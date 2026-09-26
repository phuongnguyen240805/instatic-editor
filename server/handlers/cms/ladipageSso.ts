/**
 * Ladipage → Instatic SSO (product path).
 *
 * GET /admin/api/cms/auth/ladipage-sso?token=...
 *
 * - Verifies short-lived HMAC token from Nest (INSTATIC_SSO_SECRET).
 * - Auto-bootstraps site + owner if install has no users (customers never run setup UI).
 * - Issues real admin session cookie (Path=/admin) and redirects to /admin/site.
 *
 * Served through Ladipage same-origin rewrite:
 *   http://localhost:3000/admin/api/... → CMS
 * Cookie Path=/admin matches browser origin :3000/admin/...
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { nanoid } from 'nanoid'
import type { DbClient } from '../../db/client'
import { createSession } from '../../auth/sessions'
import { createSessionToken, hashPassword, hashSessionToken, sessionExpiry } from '../../auth/tokens'
import { createNode } from '@core/page-tree'
import type { Page } from '@core/page-tree'
import { pageToCells } from '../../../src/core/data/pageFromRow'
import { jsonResponse, setCookieHeader } from '../../http'
import { createAuditEvent } from '../../repositories/audit'
import { createDataRow } from '../../repositories/data'
import { createSite, getSetupStatus, resetSetupStatusCacheForTests } from '../../repositories/setup'
import {
  createUser,
  listUsers,
  updateUserStepUpPolicy,
} from '../../repositories/users'
import { sessionCookie } from './session'
import { CMS_API_PREFIX, requestAuditContext } from './shared'
import { ensureLadipagePage } from './ladipageBridge'

const SSO_PATH = `${CMS_API_PREFIX}/auth/ladipage-sso`
const PURPOSE = 'ladipage-sso'
const BOOTSTRAP_EMAIL = 'ladipage-editor@localhost.local'

/**
 * Last Ladipage page opened via SSO for this CMS user (process-local).
 * Used after Instatic Publish to push HTML to Nest publish-intent.
 */
export type LadipageSsoBinding = {
  ladipagePageId: string
  instaticPageId: string | null
  siteId: string | null
  publicUrl: string | null
  at: number
}

const ssoBindingsByUserId = new Map<string, LadipageSsoBinding>()

export function getLadipageSsoBinding(userId: string): LadipageSsoBinding | null {
  return ssoBindingsByUserId.get(userId) ?? null
}

export function rememberLadipageSsoBinding(
  userId: string,
  claims: Record<string, unknown>,
): void {
  const ladipagePageId =
    typeof claims.pageId === 'string' && claims.pageId.trim()
      ? claims.pageId.trim()
      : ''
  if (!ladipagePageId) return
  ssoBindingsByUserId.set(userId, {
    ladipagePageId,
    instaticPageId:
      typeof claims.instaticPageId === 'string' ? claims.instaticPageId : null,
    siteId: typeof claims.siteId === 'string' ? claims.siteId : null,
    publicUrl: typeof claims.publicUrl === 'string' ? claims.publicUrl : null,
    at: Date.now(),
  })
}

/** One-time jti cache (single process). */
const usedJti = new Map<string, number>()
const JTI_TTL_MS = 5 * 60_000
const MAX_JTI = 5_000

function pruneJti(now = Date.now()): void {
  for (const [jti, exp] of usedJti) {
    if (exp <= now) usedJti.delete(jti)
  }
  if (usedJti.size > MAX_JTI) usedJti.clear()
}

export function verifyLadipageSsoToken(
  secret: string,
  token: string,
): { ok: true; claims: Record<string, unknown> } | { ok: false; reason: string } {
  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'malformed' }
  const [payloadB64, nonce, sig] = parts
  const body = `${payloadB64}.${nonce}`
  const expected = createHmac('sha256', secret).update(body).digest('base64url')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(sig, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_signature' }
  }
  try {
    const claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >
    if (claims.purpose !== PURPOSE) return { ok: false, reason: 'bad_purpose' }
    if (typeof claims.exp !== 'number' || claims.exp < Math.floor(Date.now() / 1000)) {
      return { ok: false, reason: 'expired' }
    }
    return { ok: true, claims }
  } catch {
    return { ok: false, reason: 'bad_payload' }
  }
}

function ssoSecret(): string {
  return (
    process.env.INSTATIC_SSO_SECRET?.trim() ||
    process.env.LADIPAGE_SSO_SECRET?.trim() ||
    ''
  )
}

function ssoRedirectLocation(req: Request, path: string): string {
  if (!path.startsWith('/')) return path
  const configured = (process.env.PUBLIC_ORIGIN ?? '')
    .split(',')[0]
    ?.trim()
    .replace(/\/$/, '')
  if (configured) return `${configured}${path}`
  const host = req.headers.get('host')
  if (!host) return path
  const forwarded = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const proto =
    forwarded === 'https' || forwarded === 'http'
      ? forwarded
      : req.url.startsWith('https:')
        ? 'https'
        : 'http'
  return `${proto}://${host}${path}`
}

function redirectTo(req: Request, path: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: ssoRedirectLocation(req, path),
      'Cache-Control': 'no-store, no-cache, max-age=0',
    },
  })
}

function ssoTargetFromClaims(claims: Record<string, unknown>): {
  ladipagePageId: string
  instaticPageId: string
  siteId: string | null
  publicUrl: string | null
  redirectPath: string
} {
  const ladipagePageId =
    typeof claims.pageId === 'string' && claims.pageId.trim()
      ? claims.pageId.trim()
      : ''
  const explicitInstaticPageId =
    typeof claims.instaticPageId === 'string' && claims.instaticPageId.trim()
      ? claims.instaticPageId.trim()
      : ''
  const instaticPageId = explicitInstaticPageId || (ladipagePageId ? `page_${ladipagePageId}` : '')
  const siteId =
    typeof claims.siteId === 'string' && claims.siteId.trim()
      ? claims.siteId.trim()
      : null
  const publicUrl =
    typeof claims.publicUrl === 'string' && claims.publicUrl.trim()
      ? claims.publicUrl.trim()
      : null
  const params = new URLSearchParams()
  if (instaticPageId) {
    params.set('table', 'pages')
    params.set('row', instaticPageId)
  }
  if (publicUrl) params.set('lpUrl', publicUrl)
  const query = params.toString()
  const redirectPath = query ? `/admin/site?${query}` : '/admin/site'
  return { ladipagePageId, instaticPageId, siteId, publicUrl, redirectPath }
}

async function resolveActiveOwnerId(db: DbClient): Promise<string | null> {
  const users = await listUsers(db)
  const active = users.filter((u) => u.status === 'active')
  if (active.length === 0) return null
  const owner = active.find((u) => u.role.slug === 'owner')
  return (owner ?? active[0]).id
}

/**
 * Ensure install has site + owner without customer UI.
 * Safe to call repeatedly: if setup already complete, only resolves user id.
 */
export async function ensureLadipageEditorOwner(
  db: DbClient,
  req: Request,
): Promise<string> {
  const existing = await resolveActiveOwnerId(db)
  if (existing) return existing

  const status = await getSetupStatus(db)
  if (!status.needsSetup) {
    // Site exists but no active user — still try list once more
    const again = await resolveActiveOwnerId(db)
    if (again) return again
  }

  const password = `Lp!${randomBytes(18).toString('base64url')}`
  const ownerId = nanoid()

  await db.transaction(async (tx) => {
    if (status.needsSetup || !status.hasSite) {
      await createSite(tx, 'Ladipage Editor', {})
    }

    await createUser(tx, {
      id: ownerId,
      email: BOOTSTRAP_EMAIL,
      displayName: 'Ladipage Editor',
      passwordHash: await hashPassword(password),
      roleId: 'owner',
      allowOwnerRole: true,
    })

    await createAuditEvent(tx, {
      actorUserId: null,
      action: 'user.create',
      targetType: 'user',
      targetId: ownerId,
      metadata: { roleId: 'owner', source: 'ladipage-sso-bootstrap' },
      ...requestAuditContext(req),
    })

    // Starter homepage so site editor is not empty
    const rootNode = createNode('base.body')
    const homePage: Page = {
      id: nanoid(),
      title: 'Home',
      slug: 'index',
      nodes: { [rootNode.id]: rootNode },
      rootNodeId: rootNode.id,
    }
    await createDataRow(
      tx,
      { id: homePage.id, tableId: 'pages', cells: pageToCells(homePage), slug: homePage.slug },
      ownerId,
    )
  })

  // Clear setup cache so subsequent status reads see complete install
  resetSetupStatusCacheForTests()

  const id = await resolveActiveOwnerId(db)
  if (!id) {
    throw new Error('SSO bootstrap created owner but user lookup failed')
  }
  return id
}

export async function handleLadipageSso(req: Request, db: DbClient): Promise<Response | null> {
  const url = new URL(req.url)
  const pathname = url.pathname.replace(/\/+$/, '') || '/'
  if (pathname !== SSO_PATH) return null
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 })
  }

  const secret = ssoSecret()
  if (!secret) {
    return jsonResponse(
      {
        error:
          'Ladipage SSO is not configured (set INSTATIC_SSO_SECRET on the Instatic process).',
      },
      { status: 503 },
    )
  }

  const token = url.searchParams.get('token')?.trim() ?? ''
  if (!token) {
    return jsonResponse({ error: 'Missing token' }, { status: 400 })
  }

  const verified = verifyLadipageSsoToken(secret, token)
  if (!verified.ok) {
    return jsonResponse({ error: `Invalid SSO token (${verified.reason})` }, { status: 401 })
  }

  const target = ssoTargetFromClaims(verified.claims)
  const jti = typeof verified.claims.jti === 'string' ? verified.claims.jti : ''
  if (jti) {
    pruneJti()
    // Prefetch / double navigation often consumes jti on a request that
    // never stores Set-Cookie. Always mint a session cookie while the
    // ticket is still valid (120s) so the editor does not fall through
    // to the Instatic password form.
    usedJti.set(jti, Date.now() + JTI_TTL_MS)
  }

  let userId: string
  try {
    userId = await ensureLadipageEditorOwner(db, req)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return jsonResponse(
      { error: `SSO bootstrap failed: ${message}` },
      { status: 503 },
    )
  }

  let redirectPath = target.redirectPath
  if (target.instaticPageId) {
    try {
      const ensured = await ensureLadipagePage(db, {
        siteKey: target.siteId,
        pageKey: target.instaticPageId,
        title: target.ladipagePageId || target.instaticPageId,
      })
      verified.claims.instaticPageId = ensured.pageId
      if (target.siteId) verified.claims.siteId = ensured.siteId
      const params = new URLSearchParams()
      params.set('table', 'pages')
      params.set('row', ensured.pageId)
      if (target.publicUrl) params.set('lpUrl', target.publicUrl)
      redirectPath = `/admin/site?${params.toString()}`
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return jsonResponse(
        { error: `SSO page bootstrap failed: ${message}` },
        { status: 503 },
      )
    }
  }

  // Customers never re-enter an Instatic password. Open a full-session step-up
  // window so Publish works (requireStepUp checks step_up_expires_at, not MFA).
  // Also disable permanent step-up on the bootstrap owner for product SSO.
  try {
    await updateUserStepUpPolicy(db, userId, {
      mode: 'disabled',
      windowMinutes: 60,
    })
  } catch {
    /* older DB without step_up columns — session window below still applies */
  }

  rememberLadipageSsoBinding(userId, verified.claims)

  const sessionToken = createSessionToken()
  const expiresAt = sessionExpiry()
  await createSession(db, {
    idHash: await hashSessionToken(sessionToken),
    userId,
    expiresAt,
    mfaPassedAt: new Date(),
    // Mirror session lifetime so pages.publish does not return step_up_required
    // for Ladipage-authenticated sessions.
    stepUpExpiresAt: expiresAt,
    ...requestAuditContext(req),
  })

  const res = redirectTo(req, redirectPath)
  return setCookieHeader(res, sessionCookie(req, sessionToken, expiresAt))
}
