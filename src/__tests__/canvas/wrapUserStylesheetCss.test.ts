import { describe, expect, it } from 'bun:test'
import { wrapUserStylesheetCss } from '@site/canvas/wrapUserStylesheetCss'

describe('wrapUserStylesheetCss', () => {
  it('hoists @import out of the user-authored layer so layout CSS still applies', () => {
    const css = `/* imported/ladipage-p1.css */
@import url("https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap");

:root { --text-color: #707070; }
.bd-grid { display: grid; gap: 1.5rem; }
`
    const wrapped = wrapUserStylesheetCss(css)
    expect(wrapped.startsWith('@import url("https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap");')).toBe(true)
    expect(wrapped).toContain('@layer user-authored {')
    expect(wrapped).toContain('.bd-grid { display: grid; gap: 1.5rem; }')
    expect(wrapped).not.toMatch(/@layer user-authored \{[\s\S]*@import/)
  })

  it('returns a comment when the stylesheet is empty', () => {
    expect(wrapUserStylesheetCss('')).toBe('/* no user stylesheets */')
  })
})
