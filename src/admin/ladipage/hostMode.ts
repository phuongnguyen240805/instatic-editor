const STORAGE_KEY = 'instatic-ladipage-host'
const ORIGIN_KEY = 'instatic-ladipage-origin'
const URL_KEY = 'instatic-ladipage-public-url'

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

export function activateLadipageHostMode(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const params = readSearchParams()
  const hostFlag = params.get('host') === 'ladipage'
  const lpUrl = params.get('lpUrl')
  const remembered = sessionStorage.getItem(STORAGE_KEY) === '1'

  if (!hostFlag && !lpUrl && !remembered) return

  sessionStorage.setItem(STORAGE_KEY, '1')
  document.documentElement.dataset.host = 'ladipage'
  document.title = 'LadiPage Editor'

  if (lpUrl && /^https?:\/\//i.test(lpUrl)) {
    sessionStorage.setItem(URL_KEY, lpUrl)
    try {
      sessionStorage.setItem(ORIGIN_KEY, new URL(lpUrl).origin)
    } catch {
      /* keep previous origin */
    }
  }
}
