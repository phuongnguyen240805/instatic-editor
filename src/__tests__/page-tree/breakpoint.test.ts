import { describe, expect, it } from 'bun:test'
import { breakpointMediaQuery, parseBreakpoint } from '@core/page-tree'

describe('parseBreakpoint', () => {
  it('defaults the media query from width for existing breakpoint records', () => {
    const breakpoint = parseBreakpoint({
      id: 'tablet',
      label: 'Tablet',
      width: 768,
      icon: 'tablet',
    })

    expect(breakpoint).not.toBeNull()
    expect(breakpoint!.mediaQuery).toBe('(max-width: 768px)')
    expect(breakpointMediaQuery(breakpoint!)).toBe('(max-width: 768px)')
  })

  it('migrates stored desktop max-width:1440 to min-width:769', () => {
    const breakpoint = parseBreakpoint({
      id: 'desktop',
      label: 'Desktop',
      width: 1440,
      icon: 'monitor',
      mediaQuery: '(max-width: 1440px)',
    })

    expect(breakpoint).not.toBeNull()
    expect(breakpoint!.mediaQuery).toBe('(min-width: 769px)')
  })

  it('preserves an explicit mobile-first media query', () => {
    const breakpoint = parseBreakpoint({
      id: 'tablet',
      label: 'Tablet',
      width: 768,
      icon: 'tablet',
      mediaQuery: '(min-width: 768px)',
    })

    expect(breakpoint).not.toBeNull()
    expect(breakpointMediaQuery(breakpoint!)).toBe('(min-width: 768px)')
  })
})
