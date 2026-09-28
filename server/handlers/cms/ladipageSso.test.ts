import { describe, expect, test } from 'bun:test'
import { createHmac, randomBytes } from 'node:crypto'
import { SESSION_COOKIE_NAME } from '../../auth/tokens'
import { createSqliteClient } from '../../db/sqlite'
import { sqliteMigrations } from '../../db/migrations-sqlite'
import { runMigrations } from '../../db/runMigrations'
import type { DbClient } from '../../db/client'
import { listDataRows } from '../../repositories/data'
import { handleLadipageSso, verifyLadipageSsoToken } from './ladipageSso'

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

describe('verifyLadipageSsoToken', () => {
  const secret = 'test-sso-secret'

  test('accepts valid token', () => {
    const token = mintToken(secret, {
      purpose: 'ladipage-sso',
      sub: '1',
      pageId: 'p1',
      exp: Math.floor(Date.now() / 1000) + 60,
      jti: 'abc',
    })
    const result = verifyLadipageSsoToken(secret, token)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.claims.pageId).toBe('p1')
      expect(result.claims.purpose).toBe('ladipage-sso')
    }
  })

  test('rejects expired token', () => {
    const token = mintToken(secret, {
      purpose: 'ladipage-sso',
      exp: Math.floor(Date.now() / 1000) - 10,
    })
    const result = verifyLadipageSsoToken(secret, token)
    expect(result.ok).toBe(false)
  })

  test('rejects wrong purpose', () => {
    const token = mintToken(secret, {
      purpose: 'other',
      exp: Math.floor(Date.now() / 1000) + 60,
    })
    const result = verifyLadipageSsoToken(secret, token)
    expect(result.ok).toBe(false)
  })

  test('rejects tampered signature', () => {
    const token = mintToken(secret, {
      purpose: 'ladipage-sso',
      exp: Math.floor(Date.now() / 1000) + 60,
    })
    const bad = token.slice(0, -4) + 'xxxx'
    expect(verifyLadipageSsoToken(secret, bad).ok).toBe(false)
  })

  test('bootstraps the requested page and redirects editor to that row', async () => {
    const previousSecret = process.env.INSTATIC_SSO_SECRET
    process.env.INSTATIC_SSO_SECRET = secret
    const db = await createInMemoryTestDb()
    try {
      const token = mintToken(secret, {
        purpose: 'ladipage-sso',
        sub: '1',
        pageId: 'lp_a',
        exp: Math.floor(Date.now() / 1000) + 60,
        jti: randomBytes(8).toString('hex'),
      })
      const req = new Request(`http://localhost/admin/api/cms/auth/ladipage-sso?token=${token}`)
      const res = await handleLadipageSso(req, db)

      expect(res).not.toBeNull()
      expect(res!.status).toBe(302)
      expect(res!.headers.get('location')).toContain('/admin/site?table=pages&row=page_lp_a')
      expect(res!.headers.get('set-cookie')).toContain(`${SESSION_COOKIE_NAME}=`)

      const rows = await listDataRows(db, 'pages')
      expect(rows.map((row) => row.id)).toContain('page_lp_a')
    } finally {
      if (previousSecret == null) {
        delete process.env.INSTATIC_SSO_SECRET
      } else {
        process.env.INSTATIC_SSO_SECRET = previousSecret
      }
    }
  })

  test('replayed SSO token keeps redirecting to requested row', async () => {
    const previousSecret = process.env.INSTATIC_SSO_SECRET
    process.env.INSTATIC_SSO_SECRET = secret
    const db = await createInMemoryTestDb()
    try {
      const token = mintToken(secret, {
        purpose: 'ladipage-sso',
        sub: '1',
        pageId: 'lp_b',
        exp: Math.floor(Date.now() / 1000) + 60,
        jti: randomBytes(8).toString('hex'),
      })
      const req = new Request(`http://localhost/admin/api/cms/auth/ladipage-sso?token=${token}`)
      const first = await handleLadipageSso(req, db)
      const second = await handleLadipageSso(req, db)

      expect(first!.status).toBe(302)
      expect(second!.status).toBe(302)
      expect(first!.headers.get('location')).toContain('/admin/site?table=pages&row=page_lp_b')
      expect(first!.headers.get('location')).toContain('host=ladipage')
      expect(second!.headers.get('location')).toContain('/admin/site?table=pages&row=page_lp_b')
      expect(second!.headers.get('location')).toContain('host=ladipage')
      expect(second!.headers.get('set-cookie')).toContain(`${SESSION_COOKIE_NAME}=`)
    } finally {
      if (previousSecret == null) {
        delete process.env.INSTATIC_SSO_SECRET
      } else {
        process.env.INSTATIC_SSO_SECRET = previousSecret
      }
    }
  })
})
