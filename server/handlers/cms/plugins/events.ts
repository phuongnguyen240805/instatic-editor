/**
 * `GET /admin/api/cms/plugins/events` — Server-Sent Events stream of plugin
 * lifecycle events.
 *
 * Wired so each connected admin tab gets `crash`, `recovered`, `parked`,
 * `restarted`, `installed`, `updated`, `uninstalled`, `enabled`, and
 * `disabled` events in real time. The admin client uses these to:
 *   - re-fetch the plugins list (live update of the Plugins page),
 *   - push a toast on crash / parked events (visible from any admin route),
 *   - bump a red badge on the nav link when any plugin is in error state.
 *
 * Behaviour:
 *   - The auth gate (`plugins.read`) is applied by the dispatcher's
 *     `resolvePluginRoutePolicy` before we reach this handler.
 *   - Initial `event: ping` keeps proxies (vite, nginx) from idle-closing
 *     the long-lived connection. Followed by a periodic heartbeat every
 *     30s for the same reason.
 *   - On `req.signal` abort (tab closed, EventSource paused), we
 *     unsubscribe from the broadcaster and stop the heartbeat. No leaks.
 *   - The stream never ends voluntarily — clients reconnect via the
 *     standard EventSource auto-reconnect on transport errors.
 */
import { subscribePluginEvents } from '../../../plugins/eventBroadcaster'
import { methodNotAllowed } from '../../../http'

export function handlePluginEventsStream(req: Request): Response {
  if (req.method !== 'GET') return methodNotAllowed()
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      function send(payload: string): void {
        try {
          controller.enqueue(encoder.encode(payload))
        } catch {
          // Stream already closed (client gone). Listeners + heartbeat
          // are torn down via the abort handler below.
        }
      }

      // Initial ping so the client sees a successful connection immediately,
      // even before the first real event arrives.
      send(`event: ping\ndata: connected\n\n`)

      // Subscribe to the broadcaster — every event becomes one SSE message.
      // SSE requires `data:` lines + a terminating blank line.
      const unsubscribe = subscribePluginEvents((event) => {
        send(`event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`)
      })

      // Heartbeat keeps proxies + the EventSource itself happy. SSE comments
      // (`: heartbeat`) are ignored by the client but reset idle timers.
      const heartbeat = setInterval(() => {
        send(`: heartbeat\n\n`)
      }, 30_000)

      // Tear down when the client disconnects.
      req.signal.addEventListener('abort', () => {
        unsubscribe()
        clearInterval(heartbeat)
        try { controller.close() } catch { /* already closed */ }
      })
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
    },
  })
}
