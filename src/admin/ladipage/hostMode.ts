const STORAGE_KEY = 'instatic-ladipage-host'
const ORIGIN_KEY = 'instatic-ladipage-origin'
const URL_KEY = 'instatic-ladipage-public-url'
const THEME_KEY = 'instatic-ladipage-theme'

export const KEDI_BRAND = {
  name: 'Kedi',
  icon: '/brand/kedi-icon.png',
  logoLight: '/brand/kedi-logo-navy.png',
  logoDark: '/brand/kedi-logo-reverse.png',
} as const

export type LadipageChromeTheme = 'light' | 'dark'

function readSearchParams(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams()
  return new URLSearchParams(window.location.search)
}

export function isLadipageHostMode(): boolean {
  if (typeof document === 'undefined') return false
  if (document.documentElement.dataset.host === 'ladipage') return true
  if (typeof sessionStorage === 'undefined') return false
  return sessionStorage.getItem(STORAGE_KEY) === '1'
}

export function ladipageReturnOrigin(): string | null {
  if (typeof sessionStorage === 'undefined') return null
  const stored = sessionStorage.getItem(ORIGIN_KEY)?.replace(/\/$/, '') ?? ''
  if (stored) return stored
  const env = (import.meta as { env?: { VITE_LADIPAGE_PUBLIC_ORIGIN?: string } }).env
    ?.VITE_LADIPAGE_PUBLIC_ORIGIN
  return env?.trim().replace(/\/$/, '') || null
}

export function ladipagePagesListUrl(): string {
  const origin = ladipageReturnOrigin()
  return origin ? `${origin}/landing-pages` : '/landing-pages'
}

export function ladipageChromeTheme(): LadipageChromeTheme {
  if (typeof sessionStorage === 'undefined') return 'light'
  return sessionStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'
}

export function kediToolbarLogoSrc(): string {
  return ladipageChromeTheme() === 'dark' ? KEDI_BRAND.logoDark : KEDI_BRAND.logoLight
}

export function applyLadipageChromeTheme(theme: LadipageChromeTheme): void {
  if (typeof document === 'undefined') return
  sessionStorage.setItem(THEME_KEY, theme)
  document.documentElement.setAttribute('data-editor-theme', theme)
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

function readRequestedTheme(params: URLSearchParams): LadipageChromeTheme | null {
  const raw = params.get('theme')
  if (raw === 'light' || raw === 'dark') return raw
  return null
}

function applyKediFavicon(): void {
  const links = document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')
  if (links.length === 0) {
    const link = document.createElement('link')
    link.rel = 'icon'
    link.type = 'image/png'
    link.href = KEDI_BRAND.icon
    document.head.appendChild(link)
    return
  }
  for (const link of links) {
    link.type = 'image/png'
    link.href = KEDI_BRAND.icon
  }
}

export function activateLadipageHostMode(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const params = readSearchParams()
  const hostFlag = params.get('host') === 'ladipage'
  const lpUrl = params.get('lpUrl')
  const remembered = sessionStorage.getItem(STORAGE_KEY) === '1'

  if (!hostFlag && !lpUrl && !remembered) return

  sessionStorage.setItem(STORAGE_KEY, '1')
  document.documentElement.dataset.host = 'ladipage'
  document.title = 'Kedi Editor'
  applyKediFavicon()

  const theme = readRequestedTheme(params) ?? ladipageChromeTheme()
  applyLadipageChromeTheme(theme)

  if (lpUrl && /^https?:\/\//i.test(lpUrl)) {
    sessionStorage.setItem(URL_KEY, lpUrl)
    try {
      sessionStorage.setItem(ORIGIN_KEY, new URL(lpUrl).origin)
    } catch {
      /* keep previous origin */
    }
  }
}
