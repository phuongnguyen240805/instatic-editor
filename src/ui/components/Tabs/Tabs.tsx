/**
 * Tabs — ARIA-correct, keyboard-navigable tab compound component.
 *
 * Implements the WAI-ARIA "tabs with automatic activation" pattern:
 * arrow keys move focus AND change the active value simultaneously.
 *
 * Underline-indicator style — visually distinct from RangeTabs (pill
 * segmented control). Tabs is for page-level chrome; RangeTabs is for
 * compact inline widget-header toggles.
 *
 * All four components compose a single React Context so the value type
 * is generic at the Tabs boundary and the inner components only see strings.
 * Tab panel DOM nodes stay mounted (just hidden) — consistent with Search's
 * pattern and correct for any consumer that holds component state in panels.
 *
 * Lives under src/ui/components/ so plugins can import it via
 * @instatic/host-ui.
 */
import {
  createContext,
  useContext,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { cn } from '@ui/cn'
import styles from './Tabs.module.css'

// ---------------------------------------------------------------------------
// Internal context — untyped to string so the four sub-components don't
// need their own generic parameters on useContext.
// ---------------------------------------------------------------------------

interface TabsContextValue {
  activeValue: string
  onChange: (value: string) => void
  idPrefix: string
}

const TabsContext = createContext<TabsContextValue | null>(null)

function useTabsContext(component: string): TabsContextValue {
  const ctx = useContext(TabsContext)
  if (ctx === null) {
    throw new Error(`<${component}> must be rendered inside a <Tabs> component.`)
  }
  return ctx
}

// ---------------------------------------------------------------------------
// Prop types (exported for consumer use)
// ---------------------------------------------------------------------------

export interface TabsProps<TValue extends string> {
  /** Currently active tab value. */
  value: TValue
  /** Called with the next value when the user activates a tab. */
  onChange: (next: TValue) => void
  children?: ReactNode
}

export interface TabListProps {
  /** Required accessible label for the tablist. Rendered as aria-label. */
  ariaLabel: string
  children?: ReactNode
}

export interface TabProps<TValue extends string> {
  /** The value this tab represents. Must match a TabPanel value. */
  value: TValue
  children?: ReactNode
}

export interface TabPanelProps<TValue extends string> {
  /** The value this panel represents. Must match a Tab value. */
  value: TValue
  children?: ReactNode
}

// ---------------------------------------------------------------------------
// Tabs — context provider
// ---------------------------------------------------------------------------

export function Tabs<TValue extends string>({
  value,
  onChange,
  children,
}: TabsProps<TValue>) {
  const idPrefix = useId()

  return (
    <TabsContext.Provider
      value={{
        activeValue: value,
        // Cast: internally the context deals with plain strings; the generic
        // TValue guard at the Tabs boundary ensures Tab/TabPanel only pass
        // valid values through.
        onChange: onChange as (v: string) => void,
        idPrefix,
      }}
    >
      {children}
    </TabsContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// TabList — renders role="tablist", owns keyboard navigation
// ---------------------------------------------------------------------------

export function TabList({ ariaLabel, children }: TabListProps) {
  const { onChange } = useTabsContext('TabList')
  const listRef = useRef<HTMLDivElement>(null)

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const list = listRef.current
    if (!list) return

    const tabs = Array.from(
      list.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    )
    const focusedIndex = tabs.findIndex((t) => t === document.activeElement)
    if (focusedIndex === -1) return

    let nextIndex: number

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault()
        nextIndex = (focusedIndex + 1) % tabs.length
        break
      case 'ArrowLeft':
        e.preventDefault()
        nextIndex = (focusedIndex - 1 + tabs.length) % tabs.length
        break
      case 'Home':
        e.preventDefault()
        nextIndex = 0
        break
      case 'End':
        e.preventDefault()
        nextIndex = tabs.length - 1
        break
      default:
        return
    }

    const nextTab = tabs[nextIndex]
    if (!nextTab) return

    // Move focus (roving tabindex handled by aria-selected / tabIndex on Tab).
    nextTab.focus()

    // Automatic activation — active value follows focus on arrow keys.
    const nextValue = nextTab.dataset['value']
    if (nextValue !== undefined) {
      onChange(nextValue)
    }
  }

  return (
    <div
      ref={listRef}
      className={styles.tabList}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab — individual tab trigger
// ---------------------------------------------------------------------------

export function Tab<TValue extends string>({ value, children }: TabProps<TValue>) {
  const { activeValue, onChange, idPrefix } = useTabsContext('Tab')
  const isActive = value === activeValue
  const tabId = `${idPrefix}-tab-${value}`
  const panelId = `${idPrefix}-panel-${value}`

  return (
    <button
      id={tabId}
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls={panelId}
      // Roving tabindex: only the active tab is in the natural focus order.
      // Arrow keys (handled by TabList) move between inactive tabs.
      tabIndex={isActive ? 0 : -1}
      // data-value lets the TabList keyboard handler read the value without
      // a separate context subscription per tab.
      data-value={value}
      className={cn(styles.tab, isActive && styles.tabActive)}
      onClick={() => onChange(value)}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// TabPanel — content region associated with a tab
// ---------------------------------------------------------------------------

export function TabPanel<TValue extends string>({
  value,
  children,
}: TabPanelProps<TValue>) {
  const { activeValue, idPrefix } = useTabsContext('TabPanel')
  const isActive = value === activeValue
  const tabId = `${idPrefix}-tab-${value}`
  const panelId = `${idPrefix}-panel-${value}`

  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={tabId}
      // hidden keeps inactive panels out of the accessibility tree and layout
      // while leaving their DOM nodes (and component state) mounted.
      hidden={!isActive}
      className={styles.tabPanel}
    >
      {children}
    </div>
  )
}
