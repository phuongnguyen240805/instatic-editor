import { useRef } from 'react'
import { useEditorStore } from '@site/store/store'
import { Panel, useAutoFocusPanel } from '@admin/shared/Panel'
import { DepsSection } from './DepsSection'

interface DependenciesPanelProps {
  variant?: 'docked'
}

export function DependenciesPanel({ variant = 'docked' }: DependenciesPanelProps) {
  const isOpen = useEditorStore((s) => s.dependenciesPanelOpen)
  const setDependenciesPanelOpen = useEditorStore((s) => s.setDependenciesPanelOpen)
  const panelRef = useRef<HTMLElement>(null)

  useAutoFocusPanel(panelRef, isOpen)

  if (!isOpen || variant !== 'docked') return null

  return (
    <Panel
      ref={panelRef}
      panelId="dependencies"
      title="Dependencies"
      testId="dependencies-panel"
      onClose={() => setDependenciesPanelOpen(false)}
    >
      <DepsSection />
    </Panel>
  )
}
