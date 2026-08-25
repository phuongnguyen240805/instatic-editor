/**
 * FloatingWindow — shared shell for the Media page's three draggable windows
 * (Upload Queue, Detached Inspector, Bulk Edit). Wraps `useDraggablePanel`
 * with a `PanelHeader` and a scrollable body so each window can focus on
 * its own contents.
 *
 * Position is persisted automatically by `useDraggablePanel` via the
 * `workspaceLayoutStorage` module (each `FloatingPanelId` gets its own key).
 * Visibility is owned by the caller — pass `open` from your component
 * state. Closing fires `onClose`.
 */
import { useImperativeHandle, type CSSProperties, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { PanelHeader } from '@admin/shared/PanelHeader'
import { useDraggablePanel } from '@site/hooks/useDraggablePanel'
import type { FloatingPanelId, PanelPosition } from '@admin/state/workspaceLayoutStorage'
import { cn } from '@ui/cn'
import styles from './FloatingWindow.module.css'

interface FloatingWindowProps {
  panelId: FloatingPanelId
  /** Visibility — when false the window unmounts (drag state stays in storage). */
  open: boolean
  title: string
  /** Default position when no stored position exists. */
  defaultPosition: PanelPosition
  /** Header right-slot actions (e.g. "Clear" buttons on the upload queue). */
  headerActions?: ReactNode
  /** Width in pixels — driven by a CSS var, allows simple resizing later. */
  width?: number
  /** Optional max height in pixels — body scrolls when exceeded. */
  maxHeight?: number
  /** Extra class on the root container. */
  className?: string
  ariaLabel?: string
  testId?: string
  onClose: () => void
  children?: ReactNode
  /** React 19: ref is a regular prop on function components. */
  ref?: Ref<HTMLDivElement>
}

export function FloatingWindow({
  panelId,
  open,
  title,
  defaultPosition,
  headerActions,
  width = 320,
  maxHeight,
  className,
  ariaLabel,
  testId,
  onClose,
  children,
  ref: forwardedRef,
}: FloatingWindowProps) {
  const { panelRef, headerDragProps, panelPositionStyle } = useDraggablePanel(
    panelId,
    () => defaultPosition,
  )

  // Forward the same DOM node that `panelRef` (returned from useDraggablePanel)
  // attaches to. `useImperativeHandle` re-runs every render and React guarantees
  // `panelRef.current` is up to date by then, so we can route the forwarded
  // contract through it without a parallel local ref. Avoids the React Compiler
  // bailout from writing `panelRef.current = node` inside a ref callback.
  useImperativeHandle(forwardedRef, () => panelRef.current as HTMLDivElement)

  if (!open) return null

  const style = {
    '--floating-window-w': `${width}px`,
    ...(maxHeight ? { '--floating-window-max-h': `${maxHeight}px` } : {}),
    ...panelPositionStyle,
  } as CSSProperties

  // Portal into <body> so the window can float above ANY ancestor — including
  // sidebars with `overflow: hidden` and modal backdrops.
  return createPortal(
    <aside
      ref={panelRef as React.RefObject<HTMLDivElement>}
      className={cn(styles.window, className)}
      role="dialog"
      aria-label={ariaLabel ?? title}
      data-testid={testId ?? `floating-window-${panelId}`}
      style={style}
      onClick={(event) => event.stopPropagation()}
    >
      <PanelHeader
        panelId={panelId}
        title={title}
        onClose={onClose}
        dragHandleProps={headerDragProps}
      >
        {headerActions}
      </PanelHeader>
      <div className={styles.body}>{children}</div>
    </aside>,
    document.body,
  )
}
