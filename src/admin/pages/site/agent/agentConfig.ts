/**
 * Site-editor agent network configuration.
 *
 * As of Phase 3 the site editor talks to the new AI runtime at
 * `/admin/api/ai/chat/site` (provider-agnostic, multi-driver). The browser
 * still POSTs tool results to `/admin/api/ai/tool-result`.
 *
 * Endpoints live under `/admin/api/` so the session cookie scoped to
 * `Path=/admin` is sent by the browser. Outside `/admin/`, the cookie
 * wouldn't be carried and the `requireCapability('ai.chat' /
 * 'ai.tools.write')` gates would 401 every request.
 */

/**
 * Browser-bridge response endpoint. POSTed by the browser after applying a
 * write tool against the editor store; resolves the in-flight pending tool
 * waiter in `server/ai/runtime/transport.ts` so the driver loop continues.
 *
 * Body: `{ bridgeId, requestId, result: AiToolOutput }` where AiToolOutput
 * is `{ ok: boolean, data?: unknown, error?: string }`.
 */
export const AGENT_TOOL_RESULT_PATH = '/admin/api/ai/tool-result' as const

/** Per-scope defaults endpoint — read at panel open to discover the active
    credential + model for new conversations. */
export const AI_DEFAULTS_PATH = '/admin/api/ai/defaults' as const

/** Conversations endpoint root — POST to create, GET list with `?scope=site`. */
export const AI_CONVERSATIONS_PATH = '/admin/api/ai/conversations' as const
