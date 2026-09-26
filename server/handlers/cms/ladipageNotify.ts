/**
 * After Instatic Publish, optionally push HTML to Ladipage Nest
 * POST /api/internal/landing/publish-intent (HMAC bridge).
 *
 * Env (Instatic process):
 *   LADIPAGE_BFF_BASE              e.g. http://host.docker.internal:7002
 *   LADIPAGE_BRIDGE_HMAC_SECRET    must match Nest LADIPAGE_BRIDGE_HMAC_SECRET
 *
 * Missing env or page binding is an error — the editor must not report
 * "Published" when LadiPage never received HTML.
 */
import { createHmac } from 'node:crypto'
import type { DbClient } from '../../db/client'
import { registry } from '@core/module-engine'
import { publishPage, type SiteCssBundle } from '@core/publisher'
import {
  getDraftSiteDocument,
  getLatestPublishedSiteSnapshot,
  getPublishedPageSnapshotById,
} from '../../repositories/publish'
import type { RendererOutput } from '../../publish/publicRenderer'
import { applyPublishedHtmlPipeline } from '../../publish/publishedHtmlPipeline'
import { getLadipageSsoBinding } from './ladipageSso'

function bridgeBase(): string {
  return (
    process.env.LADIPAGE_BFF_BASE?.trim() ||
    process.env.LADIPAGE_NEST_URL?.trim() ||
    ''
  ).replace(/\/$/, '')
}

function bridgeSecret(): string {
  return (
    process.env.LADIPAGE_BRIDGE_HMAC_SECRET?.trim() ||
    process.env.INSTATIC_BRIDGE_HMAC_SECRET?.trim() ||
    ''
  )
}

function sign(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
}

const EMPTY_CSS_BUNDLE: SiteCssBundle = {
  reset: { bundle: 'reset', filename: '', hash: '', content: '' },
  framework: { bundle: 'framework', filename: '', hash: '', content: '' },
  style: { bundle: 'style', filename: '', hash: '', content: '' },
  userStyles: { bundle: 'userStyles', filename: '', hash: '', content: '' },
}

function ladipageIdFromExternal(externalPageId: string): string | null {
  if (!externalPageId.startsWith('page_')) return null
  const rest = externalPageId.slice('page_'.length).trim()
  return rest || null
}

function absolutizeInstaticUrls(html: string): string {
  const origin = (
    process.env.PUBLIC_ORIGIN ||
    process.env.LADIPAGE_PUBLIC_ORIGIN ||
    ''
  )
    .split(',')[0]
    ?.trim()
    .replace(/\/$/, '')
  if (!origin) return html
  return html
    .replace(/(\s(?:src|href)=["'])\/(?!\/)/gi, `$1${origin}/`)
    .replace(
      /url\(\s*(['"]?)\/(?!\/)/gi,
      (_match, quote: string) => `url(${quote}${origin}/`,
    )
}

async function postBridgeJson(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const base = bridgeBase()
  const secret = bridgeSecret()
  if (!base || !secret) {
    return {
      ok: false,
      error: 'LADIPAGE_BFF_BASE / LADIPAGE_BRIDGE_HMAC_SECRET not set',
    }
  }

  const rawBody = JSON.stringify(body)
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = sign(secret, timestamp, rawBody)

  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-lp-timestamp': timestamp,
        'x-lp-signature': signature,
      },
      body: rawBody,
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `${path} ${res.status}: ${text.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function resolveInlinePageHtml(
  db: DbClient,
  targetPageId?: string | null,
): Promise<{ html: string; title: string; externalPageId: string } | null> {
  if (targetPageId) {
    const published = await resolveDraftHtml(db, targetPageId)
    if (published) return published
  }

  const snap = targetPageId
    ? await getPublishedPageSnapshotById(db, targetPageId)
    : await getLatestPublishedSiteSnapshot(db)
  if (!snap) return resolveDraftHtml(db, targetPageId)

  const page = snap.site.pages.find((candidate) => candidate.id === snap.pageRowId)
  if (!page) return null
  try {
    const published = publishPage(page, snap.site, registry, { cssEmission: 'inline' })
    const rendered: RendererOutput = {
      html: published.html,
      pageId: page.id,
      slug: page.slug,
      siteId: snap.site.id,
      jsModuleIds: published.jsModuleIds,
      publishVersion: 0,
      cssBundle: EMPTY_CSS_BUNDLE,
    }
    const html = await applyPublishedHtmlPipeline(rendered, db)
    return {
      html: absolutizeInstaticUrls(html),
      title: page.title || page.slug || page.id,
      externalPageId: page.id,
    }
  } catch {
    return resolveDraftHtml(db, targetPageId)
  }
}

async function resolveDraftHtml(
  db: DbClient,
  targetPageId?: string | null,
): Promise<{ html: string; title: string; externalPageId: string } | null> {
  if (!targetPageId) return null

  const site = await getDraftSiteDocument(db)
  const page = site?.pages.find((candidate) => candidate.id === targetPageId)
  if (!site || !page) return null

  try {
    const published = publishPage(page, site, registry, { cssEmission: 'inline' })
    const rendered: RendererOutput = {
      html: published.html,
      pageId: page.id,
      slug: page.slug,
      siteId: site.id,
      jsModuleIds: published.jsModuleIds,
      publishVersion: 0,
      cssBundle: EMPTY_CSS_BUNDLE,
    }
    const html = await applyPublishedHtmlPipeline(rendered, db)
    return {
      html: absolutizeInstaticUrls(html),
      title: page.title || page.slug || page.id,
      externalPageId: page.id,
    }
  } catch {
    return null
  }
}

/**
 * Fire-and-forget friendly: returns error string or null on success/skip.
 */
export async function notifyLadipagePublishIntent(input: {
  db: DbClient
  userId: string
  uploadsDir?: string
}): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  const binding = getLadipageSsoBinding(input.userId)
  const targetPageId = binding?.instaticPageId ?? null
  const published = await resolveInlinePageHtml(input.db, targetPageId)
  if (!published?.html) {
    return { ok: false, error: 'no published HTML to send' }
  }

  const externalPageId = binding?.instaticPageId || published.externalPageId
  const pageId =
    binding?.ladipagePageId ||
    ladipageIdFromExternal(externalPageId) ||
    ''
  if (!pageId) {
    return { ok: false, error: 'no Ladipage page id (SSO binding missing)' }
  }

  const result = await postBridgeJson('/api/internal/landing/publish-intent', {
    pageId,
    externalPageId,
    html: published.html,
    seoTitle: published.title,
  })
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

export async function notifyLadipageDraftSaved(input: {
  db: DbClient
  userId: string
}): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  const binding = getLadipageSsoBinding(input.userId)
  const targetPageId = binding?.instaticPageId ?? null
  const draft = await resolveDraftHtml(input.db, targetPageId)
  if (!draft?.html) {
    return { ok: false, error: 'no draft HTML to send' }
  }

  const externalPageId = binding?.instaticPageId || draft.externalPageId
  const pageId =
    binding?.ladipagePageId ||
    ladipageIdFromExternal(externalPageId) ||
    ''
  if (!pageId) {
    return { ok: false, error: 'no Ladipage page id (SSO binding missing)' }
  }

  const result = await postBridgeJson('/api/internal/landing/draft-saved', {
    pageId,
    externalPageId,
    html: draft.html,
    seoTitle: draft.title,
  })
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}
