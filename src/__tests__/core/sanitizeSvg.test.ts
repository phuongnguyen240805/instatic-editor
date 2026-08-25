/**
 * sanitizeSvg.test.ts — the SVG DOMPurify profile keeps vector markup but
 * strips scripting / HTML-smuggling vectors.
 */

import { describe, it, expect } from 'bun:test'
import { sanitizeSvg } from '@core/sanitize'

describe('sanitizeSvg', () => {
  it('keeps a normal inline SVG (svg/path/viewBox)', () => {
    const out = sanitizeSvg('<svg viewBox="0 0 24 24"><path d="M1 1h22"/></svg>')
    expect(out).toContain('<svg')
    expect(out).toContain('viewBox="0 0 24 24"')
    expect(out).toContain('<path')
    expect(out).toContain('d="M1 1h22"')
  })

  it('preserves presentation attributes (fill: currentColor styling)', () => {
    const out = sanitizeSvg('<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="currentColor"/></svg>')
    expect(out).toContain('<circle')
    expect(out).toContain('currentColor')
  })

  it('strips <script> inside the SVG', () => {
    const out = sanitizeSvg('<svg><script>alert(1)</script><path d="M0 0"/></svg>')
    expect(out.toLowerCase()).not.toContain('<script')
    expect(out.toLowerCase()).not.toContain('alert(1)')
    expect(out.toLowerCase()).toContain('<svg')
  })

  it('strips inline event handlers', () => {
    const out = sanitizeSvg('<svg><path d="M0 0" onload="alert(1)"/></svg>')
    expect(out.toLowerCase()).not.toContain('onload')
  })

  it('strips <foreignObject> HTML smuggling', () => {
    const out = sanitizeSvg('<svg><foreignObject><img src=x onerror="alert(1)"></foreignObject></svg>')
    expect(out.toLowerCase()).not.toContain('foreignobject')
    expect(out.toLowerCase()).not.toContain('onerror')
  })

  it('returns empty string for empty/blank input', () => {
    expect(sanitizeSvg('')).toBe('')
    expect(sanitizeSvg('   ')).toBe('')
    expect(sanitizeSvg(null)).toBe('')
  })
})
