import { afterEach, describe, expect, test } from 'bun:test'
import { activateLadipageHostMode, isLadipageHostMode, ladipagePagesListUrl } from './hostMode'

describe('ladipage host mode', () => {
  afterEach(() => {
    sessionStorage.clear()
    delete document.documentElement.dataset.host
    document.title = 'Instatic'
    window.history.replaceState({}, '', '/admin/site')
  })

  test('activates from host=ladipage and remembers the public origin', () => {
    window.history.replaceState(
      {},
      '',
      '/admin/site?host=ladipage&lpUrl=https://ladipage.example/p/demo',
    )
    activateLadipageHostMode()
    expect(isLadipageHostMode()).toBe(true)
    expect(document.documentElement.dataset.host).toBe('ladipage')
    expect(document.title).toBe('LadiPage Editor')
    expect(ladipagePagesListUrl()).toBe('https://ladipage.example/landing-pages')
  })

  test('stays off without SSO host markers', () => {
    window.history.replaceState({}, '', '/admin/dashboard')
    activateLadipageHostMode()
    expect(isLadipageHostMode()).toBe(false)
  })
})
