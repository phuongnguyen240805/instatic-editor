import type { StyleRule } from './styleRule'

export type StyleRuleRegistry = Record<string, StyleRule> | null | undefined

const ASCII_WHITESPACE_RE = /[\t\n\f\r ]/
// Class names cannot contain ASCII control characters. The regex literally
// matches the U+0000–U+001F + U+007F range, which is precisely the rule we
// want to enforce; the `no-control-regex` lint rule exists to flag accidental
// uses, which this is not.
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\0-\x1f\x7f]/

function validateCssClassName(name: string): string | null {
  if (name.length === 0) return 'Class name is required'
  if (name.trim() !== name) return 'Class names cannot start or end with whitespace'
  if (ASCII_WHITESPACE_RE.test(name)) return 'Class names cannot contain whitespace'
  if (CONTROL_CHAR_RE.test(name)) return 'Class names cannot contain control characters'
  return null
}

export function assertValidCssClassName(name: string): void {
  const error = validateCssClassName(name)
  if (error) throw new Error(`[classSlice] ${error}`)
}

/**
 * Return the CSS selector to emit for a style rule.
 *
 *   - kind:'class':   `rule.selector` (always pre-built as `.<escaped-name>`).
 *   - kind:'ambient': `rule.selector` verbatim (`h1 > span`, `.hero .title`, ...).
 */
export function styleRuleSelector(cls: Pick<StyleRule, 'selector'>): string {
  return cls.selector
}

/**
 * HTML import stamps `el.classList` names onto `node.classIds` before those
 * names are linked to registry ids. If linking never ran (no site shell, or
 * an existing page that was imported before the linker), dropping unknown
 * ids leaves the canvas with no `class=` tokens — imported CSS like
 * `.bd-grid { display: grid }` matches nothing. Bare CSS class names are
 * therefore emitted as-is; nanoid-looking ids and ambient rules stay dropped.
 */
const BARE_CSS_CLASS_NAME_RE = /^-?[_a-zA-Z]+[_a-zA-Z0-9-]*$/

export function isBareCssClassName(value: string): boolean {
  return BARE_CSS_CLASS_NAME_RE.test(value)
}

/**
 * Resolve a node's `classIds` to the class-attribute tokens the publisher
 * should write. Ambient-kind rules are silently filtered out — they never
 * belong in `class="..."`. Unknown ids that are valid CSS class names
 * (unlinked HTML import names) are preserved.
 */
export function classNamesForClassIds(
  classes: StyleRuleRegistry,
  classIds: readonly string[] | undefined,
): string[] {
  if (!classIds?.length) return []

  const names: string[] = []
  for (const id of classIds) {
    const cls = classes?.[id]
    if (cls) {
      if (cls.kind === 'class') names.push(cls.name)
      continue
    }
    if (isBareCssClassName(id)) names.push(id)
  }
  return names
}
