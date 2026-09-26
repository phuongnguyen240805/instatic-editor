/**
 * Prepare user-authored CSS for the canvas <style> tag.
 *
 * UserStylesheetInjector wraps author CSS in `@layer user-authored` so
 * unlayered editor chrome wins. `@import` is invalid inside a layer (and
 * after any wrapping prelude), which made Bedimcode stylesheets that start
 * with a Google Fonts `@import` fail to apply — layout CSS never reached
 * the iframe. Hoist `@import` to the top of the style tag, then layer the
 * remaining rules.
 */

const IMPORT_RULE_RE = /@import\s+(?:url\s*\(\s*)?(?:'[^']+'|"[^"]+")\s*\)?[^;]*;/gi

export function wrapUserStylesheetCss(css: string): string {
  const source = css.trim()
  if (!source) return '/* no user stylesheets */'

  const imports: string[] = []
  const body = source
    .replace(IMPORT_RULE_RE, (rule) => {
      imports.push(rule.trim())
      return ''
    })
    .trim()

  const parts: string[] = []
  if (imports.length > 0) parts.push(imports.join('\n'))
  if (body) parts.push(`@layer user-authored {\n${body}\n}`)
  return parts.join('\n\n')
}
