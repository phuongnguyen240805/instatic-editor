/**
 * Shared constants for the automated Playwright E2E suite.
 *
 * The Playwright `webServer` (`scripts/e2e-dev.ts`) resets the disposable
 * `.tmp/e2e-*` database once per run and then serves a single shared stack:
 * one admin origin, one public origin, one SQLite database. Every spec runs
 * serially against that shared state (`workers: 1`), so these constants are the
 * single source of truth for the owner account and origins.
 */

/** First-run owner created by the `setup` project. Reused by every spec. */
export const OWNER = {
  email: 'owner.e2e@example.com',
  password: 'qwerty123456',
  siteName: 'Automated E2E Site',
} as const

/** Public (visitor-facing) origin. Different port → always a fresh context. */
export const PUBLIC_BASE_URL =
  process.env.E2E_PUBLIC_BASE_URL ?? 'http://127.0.0.1:3002'

/**
 * Saved owner authentication state. The `setup` project writes this after
 * first-run setup; specs that opt in start already logged in as the owner.
 */
export const OWNER_STATE_FILE = '.tmp/e2e-owner-state.json'

/**
 * An empty (logged-out) storage state. Specs that **publish** (which triggers a
 * step-up) or **sign out** must opt into this and `login()` fresh, because both
 * actions rotate the session token server-side — reusing the shared owner state
 * would invalidate it for every later spec. Read-only specs keep the fast shared
 * owner state.
 */
export const ANONYMOUS_STATE = { cookies: [], origins: [] }
