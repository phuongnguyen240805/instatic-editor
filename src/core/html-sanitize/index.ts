/**
 * HTML and URL sanitisation leaf.
 *
 * Pure helpers shared by publisher, markdown rendering, module render helpers,
 * and server-side HTML injection code. This module deliberately depends on
 * nothing in the publisher so lower-level renderers can use the same escaping
 * rules without pulling in the whole publishing engine.
 */

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
}

/**
 * HTML-escape the five characters that are dangerous in HTML text and
 * attribute contexts. Non-strings are stringified for module render helpers
 * that receive prop values as unknown.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch])
}

/**
 * Return true when a URL is safe for href/src/action attributes.
 * Blocks javascript:, vbscript:, and data: schemes after the same tab/newline
 * normalisation browsers apply during URL parsing.
 */
export function isSafeUrl(url: string): boolean {
  const normalized = url.replace(/[\t\n\r]/g, '').trim().toLowerCase()
  return (
    !normalized.startsWith('javascript:') &&
    !normalized.startsWith('vbscript:') &&
    !normalized.startsWith('data:')
  )
}

/**
 * Validate a URL and HTML-escape it for safe interpolation into an attribute.
 * Unsafe values collapse to "#".
 */
export function safeUrl(value: unknown): string {
  const str = String(value ?? '')
  if (!isSafeUrl(str)) return '#'
  return escapeHtml(str)
}
