/**
 * ContextMeter — a compact "context used / window" indicator for the chat
 * composer.
 *
 * Two halves from two sources:
 *   - `windowTokens` (prop) — the active model's max context window, resolved
 *     by AgentPanel from the model catalogue. Known as soon as a model is
 *     selected, so the meter appears *before* the first turn.
 *   - "used" — `agentContextTokens` from the store: the provider-normalised
 *     total input the model processed on the latest turn. Hydrated from the
 *     persisted conversation on reload, updated live from each `usage` event,
 *     and 0 for a fresh conversation.
 *
 * Renders nothing when the window is unknown (Ollama / uncatalogued model).
 * Display only (no compaction yet): it surfaces how full the window is so the
 * user can see a long thread approaching the model's limit.
 */

import { type CSSProperties } from 'react'
import { useAgentStore } from '@admin/ai/useAgentStore'
import styles from './ContextMeter.module.css'

/** Token count → compact label. `840`, `12K`, `1.5M`. */
function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${Math.round((tokens / 1_000_000) * 10) / 10}M`
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`
  return String(tokens)
}

interface ContextMeterProps {
  /** Active model's max context window, or null when unknown (hides the meter). */
  windowTokens: number | null
}

export function ContextMeter({ windowTokens }: ContextMeterProps) {
  const storedUsed = useAgentStore((s) => s.agentContextTokens)

  // No window (Ollama / uncatalogued / model not yet resolved) → hide.
  if (windowTokens === null || windowTokens <= 0) return null

  // Pre-turn / fresh conversation → 0 used against the known window.
  const used = storedUsed ?? 0
  const ratio = Math.min(1, Math.max(0, used / windowTokens))
  const pct = Math.round(ratio * 100)
  // Color is state: amber as the window fills, red when nearly full.
  const tone = ratio >= 0.9 ? 'danger' : ratio >= 0.75 ? 'warning' : 'normal'

  return (
    <div
      className={styles.meter}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={windowTokens}
      aria-valuenow={used}
      aria-label={`Context used: ${formatTokens(used)} of ${formatTokens(windowTokens)} tokens (${pct}%)`}
    >
      <span className={styles.label}>Context</span>
      <span
        className={styles.track}
        data-tone={tone}
        // Dynamic fill width — module reads it back via var(--ctx-fill).
        style={{ '--ctx-fill': `${pct}%` } as CSSProperties}
      >
        <span className={styles.fill} />
      </span>
      <span className={styles.count}>
        {formatTokens(used)} / {formatTokens(windowTokens)}
      </span>
    </div>
  )
}
