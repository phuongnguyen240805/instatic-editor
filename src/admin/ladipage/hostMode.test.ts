import { afterEach, describe, expect, test } from 'bun:test'
import { activateLadipageHostMode, isLadipageHostMode, ladipagePagesListUrl } from './hostMode'

describe('ladipage host mode', () => {
  afterEach(() => {
    sessionStorage.clear()
    delete document.documentElement.dataset.host
    document.documentElement.removeAttribute('data-editor-theme')
    document.documentElement.classList.add('dark')
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
    expect(document.title).toBe('Kedi Editor')
    expect(document.documentElement.getAttribute('data-editor-theme')).toBe('light')
    expect(ladipagePagesListUrl()).toBe('https://ladipage.example/landing-pages')
  })

  test('applies the parent dark theme from the SSO query', () => {
    window.history.replaceState({}, '', '/admin/site?host=ladipage&theme=dark')
    activateLadipageHostMode()
    expect(document.documentElement.getAttribute('data-editor-theme')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  test('stays off without SSO host markers', () => {
    window.history.replaceState({}, '', '/admin/dashboard')
    activateLadipageHostMode()
    expect(isLadipageHostMode()).toBe(false)
  })
})
