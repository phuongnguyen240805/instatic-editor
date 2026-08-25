import { describe, expect, test } from 'bun:test'
import { createHmac, randomBytes } from 'node:crypto'
import { createSqliteClient } from '../../db/sqlite'
import { sqliteMigrations } from '../../db/migrations-sqlite'
import { runMigrations } from '../../db/runMigrations'
import type { DbClient } from '../../db/client'
import { publishDraftSite } from '../../publish/publishSite'
import { ensureLadipagePage } from './ladipageBridge'
import { handleLadipageSso } from './ladipageSso'
import { notifyLadipageDraftSaved, notifyLadipagePublishIntent } from './ladipageNotify'

function mintToken(secret: string, claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')
  const nonce = randomBytes(8).toString('hex')
  const body = `${payload}.${nonce}`
  const sig = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}

async function createInMemoryTestDb(): Promise<DbClient> {
  const db = createSqliteClient(':memory:')
  await runMigrations(db, sqliteMigrations)
  return db
}

describe('notifyLadipagePublishIntent', () => {
  test('sends the published HTML for the SSO-bound Instatic page', async () => {
    const secret = 'test-sso-secret'
    const bridgeSecret = 'test-bridge-secret'
    const previousSsoSecret = process.env.INSTATIC_SSO_SECRET
    const previousBridgeBase = process.env.LADIPAGE_BFF_BASE
    const previousBridgeSecret = process.env.LADIPAGE_BRIDGE_HMAC_SECRET
    const previousFetch = globalThis.fetch
    process.env.INSTATIC_SSO_SECRET = secret
    process.env.LADIPAGE_BFF_BASE = 'http://ladipage.local'
    process.env.LADIPAGE_BRIDGE_HMAC_SECRET = bridgeSecret

    const db = await createInMemoryTestDb()
    try {
      await ensureLadipagePage(db, {
        siteKey: 'default',
        pageKey: 'page_lp_b',
        title: 'Landing B',
      })
      const token = mintToken(secret, {
        purpose: 'ladipage-sso',
        sub: '1',
        pageId: 'lp_b',
        exp: Math.floor(Date.now() / 1000) + 60,
        jti: randomBytes(8).toString('hex'),
      })
      const ssoReq = new Request(`http://localhost/admin/api/cms/auth/ladipage-sso?token=${token}`)
      const ssoRes = await handleLadipageSso(ssoReq, db)
      expect(ssoRes!.status).toBe(302)

      await ensureLadipagePage(db, {
        siteKey: 'default',
        pageKey: 'page_lp_a',
        title: 'Landing A',
      })

      const { rows: users } = await db<{ id: string }>`
        select id from users where status = ${'active'} limit 1
      `
      const userId = users[0].id
      await publishDraftSite(db, userId)

      let capturedBody: Record<string, unknown> | null = null
      let capturedUrl = ''
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        capturedUrl = String(input)
        capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
        return new Response('{}', { status: 200 })
      }) as typeof fetch

      const result = await notifyLadipagePublishIntent({ db, userId })
      expect(result.ok).toBe(true)
      expect(capturedUrl).toBe('http://ladipage.local/api/internal/landing/publish-intent')
      expect(capturedBody?.pageId).toBe('lp_b')
      expect(capturedBody?.externalPageId).toBe('page_lp_b')
      expect(capturedBody?.seoTitle).toBe('Landing B')
      expect(String(capturedBody?.html ?? '')).toContain('<title>Landing B</title>')
    } finally {
      globalThis.fetch = previousFetch
      if (previousSsoSecret == null) delete process.env.INSTATIC_SSO_SECRET
      else process.env.INSTATIC_SSO_SECRET = previousSsoSecret
      if (previousBridgeBase == null) delete process.env.LADIPAGE_BFF_BASE
      else process.env.LADIPAGE_BFF_BASE = previousBridgeBase
      if (previousBridgeSecret == null) delete process.env.LADIPAGE_BRIDGE_HMAC_SECRET
      else process.env.LADIPAGE_BRIDGE_HMAC_SECRET = previousBridgeSecret
    }
  })

  test('sends draft HTML for the SSO-bound Instatic page', async () => {
    const secret = 'test-sso-secret'
    const bridgeSecret = 'test-bridge-secret'
    const previousSsoSecret = process.env.INSTATIC_SSO_SECRET
    const previousBridgeBase = process.env.LADIPAGE_BFF_BASE
    const previousBridgeSecret = process.env.LADIPAGE_BRIDGE_HMAC_SECRET
    const previousFetch = globalThis.fetch
    process.env.INSTATIC_SSO_SECRET = secret
    process.env.LADIPAGE_BFF_BASE = 'http://ladipage.local'
    process.env.LADIPAGE_BRIDGE_HMAC_SECRET = bridgeSecret

    const db = await createInMemoryTestDb()
    try {
      await ensureLadipagePage(db, {
        siteKey: 'default',
        pageKey: 'page_lp_draft',
        title: 'Draft Landing',
      })
      const token = mintToken(secret, {
        purpose: 'ladipage-sso',
        sub: '1',
        pageId: 'lp_draft',
        exp: Math.floor(Date.now() / 1000) + 60,
        jti: randomBytes(8).toString('hex'),
      })
      const ssoReq = new Request(`http://localhost/admin/api/cms/auth/ladipage-sso?token=${token}`)
      const ssoRes = await handleLadipageSso(ssoReq, db)
      expect(ssoRes!.status).toBe(302)

      const { rows: users } = await db<{ id: string }>`
        select id from users where status = ${'active'} limit 1
      `
      const userId = users[0].id

      let capturedBody: Record<string, unknown> | null = null
      let capturedUrl = ''
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        capturedUrl = String(input)
        capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
        return new Response('{}', { status: 200 })
      }) as typeof fetch

      const result = await notifyLadipageDraftSaved({ db, userId })
      expect(result.ok).toBe(true)
      expect(capturedUrl).toBe('http://ladipage.local/api/internal/landing/draft-saved')
      expect(capturedBody?.pageId).toBe('lp_draft')
      expect(capturedBody?.externalPageId).toBe('page_lp_draft')
      expect(capturedBody?.seoTitle).toBe('Draft Landing')
      expect(String(capturedBody?.html ?? '')).toContain('<title>Draft Landing</title>')
    } finally {
      globalThis.fetch = previousFetch
      if (previousSsoSecret == null) delete process.env.INSTATIC_SSO_SECRET
      else process.env.INSTATIC_SSO_SECRET = previousSsoSecret
      if (previousBridgeBase == null) delete process.env.LADIPAGE_BFF_BASE
      else process.env.LADIPAGE_BFF_BASE = previousBridgeBase
      if (previousBridgeSecret == null) delete process.env.LADIPAGE_BRIDGE_HMAC_SECRET
      else process.env.LADIPAGE_BRIDGE_HMAC_SECRET = previousBridgeSecret
    }
  })
})
