/**
 * base.body editor preview component.
 *
 * Renders ONLY its children — no wrapper element. The page-tree children
 * render directly into the iframe's real `<body>`, matching what the
 * publisher does (the publisher's `base.body` also emits no wrapper; the
 * body element is the published document's `<body>`).
 *
 * Editor metadata that used to live on a wrapping `<div>` (data-node-id,
 * canvas selection attrs, click handlers, the user's mcClassName) is now
 * applied to the iframe's actual `<body>` element via `useEffect` —
 * `BodyOwnerProbe` is a tiny
 * `display: contents` component that gives the effect a ref into the
 * iframe document. The probe element contributes no layout or accessible
 * affordance; it disappears from the DOM tree from CSS's perspective.
 *
 * Component-only file so React Fast Refresh can hot-patch edits without
 * re-running module registration.
 */
import { useEffect, useRef } from 'react'
import type { ModuleComponentProps, NodeWrapperProps as NodeWrapperPropsType } from '@core/module-engine'

type BodyProps = Record<string, unknown>

export const BodyEditor = ({ children, mcClassName, nodeWrapperProps }: ModuleComponentProps<BodyProps>) => {
  // `display: contents` probe — has zero layout footprint and is invisible
  // to CSS selectors used by the user, but it has an `ownerDocument` we
  // can read inside the effect to apply attrs to the iframe `<body>`.
  const probeRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const probe = probeRef.current
    if (!probe) return
    const body = probe.ownerDocument?.body
    if (!body) return
    return applyEditorAttrsToBody(body, mcClassName, nodeWrapperProps)
  }, [mcClassName, nodeWrapperProps])

  return (
    <>
      <div
        ref={probeRef}
        aria-hidden="true"
        style={{ display: 'contents' }}
        data-instatic-body-probe=""
      />
      {children}
    </>
  )
}

/**
 * Apply editor attrs/handlers from `nodeWrapperProps` onto the iframe
 * `<body>` and return a cleanup that removes the handlers. Lives at module
 * scope so React Compiler doesn't flag the cross-frame DOM mutations.
 */
function applyEditorAttrsToBody(
  body: HTMLElement,
  mcClassName: string | undefined,
  nodeWrapperProps: NodeWrapperPropsType | undefined,
): () => void {
  if (nodeWrapperProps?.['data-node-id']) {
    body.setAttribute('data-node-id', nodeWrapperProps['data-node-id'])
  }
  if (nodeWrapperProps?.['data-module-id']) {
    body.setAttribute('data-module-id', nodeWrapperProps['data-module-id'])
  }
  body.setAttribute('tabindex', '0')
  body.removeAttribute('role')
  body.removeAttribute('aria-pressed')
  if (nodeWrapperProps?.['data-canvas-selected']) {
    body.setAttribute('data-canvas-selected', nodeWrapperProps['data-canvas-selected'])
  } else {
    body.removeAttribute('data-canvas-selected')
  }
  if (nodeWrapperProps?.['data-hovered']) {
    body.setAttribute('data-hovered', nodeWrapperProps['data-hovered'])
  } else {
    body.removeAttribute('data-hovered')
  }
  if (mcClassName !== undefined) {
    body.className = mcClassName
  }

  const handlers: Array<[string, EventListener]> = []
  const addListener = <K extends keyof HTMLElementEventMap>(
    name: K,
    handler: ((e: HTMLElementEventMap[K]) => void) | undefined,
  ) => {
    if (!handler) return
    const wrapped = handler as unknown as EventListener
    body.addEventListener(name, wrapped)
    handlers.push([name, wrapped])
  }
  addListener('click', nodeWrapperProps?.onClick as unknown as ((e: MouseEvent) => void) | undefined)
  addListener('dblclick', nodeWrapperProps?.onDoubleClick as unknown as ((e: MouseEvent) => void) | undefined)
  addListener('contextmenu', nodeWrapperProps?.onContextMenu as unknown as ((e: MouseEvent) => void) | undefined)
  addListener('keydown', nodeWrapperProps?.onKeyDown as unknown as ((e: KeyboardEvent) => void) | undefined)
  const onMouseEnter = nodeWrapperProps?.onMouseEnter
  if (onMouseEnter) {
    const wrapped = () => onMouseEnter()
    body.addEventListener('mouseenter', wrapped)
    handlers.push(['mouseenter', wrapped as EventListener])
  }
  const onMouseLeave = nodeWrapperProps?.onMouseLeave
  if (onMouseLeave) {
    const wrapped = () => onMouseLeave()
    body.addEventListener('mouseleave', wrapped)
    handlers.push(['mouseleave', wrapped as EventListener])
  }

  return () => {
    for (const [name, handler] of handlers) {
      body.removeEventListener(name, handler)
    }
  }
}
