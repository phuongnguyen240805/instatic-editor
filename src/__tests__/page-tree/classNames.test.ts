import { describe, expect, it } from 'bun:test'
import { classNamesForClassIds, type StyleRule } from '@core/page-tree'

function classRule(id: string, name: string): StyleRule {
  const now = Date.now()
  return {
    id,
    name,
    kind: 'class',
    selector: `.${name}`,
    order: 0,
    styles: {},
    contextStyles: {},
    createdAt: now,
    updatedAt: now,
  }
}

function ambientRule(id: string, selector: string): StyleRule {
  const now = Date.now()
  return {
    id,
    name: selector,
    kind: 'ambient',
    selector,
    order: 1,
    styles: {},
    contextStyles: {},
    createdAt: now,
    updatedAt: now,
  }
}

describe('classNamesForClassIds', () => {
  it('resolves linked class ids to authored names', () => {
    const rules = { c1: classRule('c1', 'bd-grid') }
    expect(classNamesForClassIds(rules, ['c1'])).toEqual(['bd-grid'])
  })

  it('emits unlinked HTML class names so imported CSS can match', () => {
    expect(classNamesForClassIds({}, ['bd-grid', 'home__container', 'nav__link'])).toEqual([
      'bd-grid',
      'home__container',
      'nav__link',
    ])
    expect(classNamesForClassIds(null, ['bd-grid'])).toEqual(['bd-grid'])
  })

  it('filters ambient rules and unknown generated ids', () => {
    const rules = {
      c1: classRule('c1', 'hero'),
      a1: ambientRule('a1', 'h1'),
    }
    expect(classNamesForClassIds(rules, ['c1', 'a1', '0not-a-class'])).toEqual(['hero'])
  })
})
