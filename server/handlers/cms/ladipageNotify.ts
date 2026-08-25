/**
 * After Instatic Publish, optionally push HTML to Ladipage Nest
 * POST /api/internal/landing/publish-intent (HMAC bridge).
 *
 * Env (Instatic process):
 *   LADIPAGE_BFF_BASE              e.g. http://host.docker.internal:7002
 *   LADIPAGE_BRIDGE_HMAC_SECRET    must match Nest LADIPAGE_BRIDGE_HMAC_SECRET
 *
 * Silent no-op when env or page binding is missing.
 */
import { createHmac } from 'node:crypto'
import type { DbClient } from '../../db/client'
import { registry } from '@core/module-engine'
import { publishPage, type SiteCssBundle } from '@core/publisher'
import {
  getDraftSiteDocument,
  getLatestPublishedSiteSnapshot,
  getPublishedPageSnapshotById,
  type PublishedPageSnapshot,
} from '../../repositories/publish'
import type { RendererOutput } from '../../publish/publicRenderer'
import { renderPublishedSnapshot } from '../../publish/publicRenderer'
import { applyPublishedHtmlPipeline } from '../../publish/publishedHtmlPipeline'
import { readArtefact } from '../../publish/staticArtefact'
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

async function postBridgeJson(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const base = bridgeBase()
  const secret = bridgeSecret()
  if (!base || !secret) {
    return { ok: true }
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

async function resolvePublishedHtml(
  db: DbClient,
  uploadsDir: string | undefined,
  targetPageId?: string | null,
): Promise<{ html: string; title: string; externalPageId: string } | null> {
  const renderSnapshot = async (
    snap: PublishedPageSnapshot,
  ): Promise<{ html: string; title: string; externalPageId: string } | null> => {
    try {
      const page = snap.site.pages.find((p) => p.id === snap.pageRowId)
      const slug = page?.slug || 'index'
      const urlPath = slug === 'index' ? '/' : `/${slug}`
      if (uploadsDir) {
        const diskHtml = await readArtefact(uploadsDir, urlPath)
        if (diskHtml?.trim()) {
          return {
            html: diskHtml,
            title: page?.title || slug,
            externalPageId: snap.pageRowId,
          }
        }
      }
      const syntheticUrl = new URL(`http://localhost${urlPath}`)
      const rendered = await renderPublishedSnapshot(snap, { db, url: syntheticUrl })
      const html = await applyPublishedHtmlPipeline(rendered, db)
      return {
        html,
        title: page?.title || slug,
        externalPageId: snap.pageRowId,
      }
    } catch {
      return null
    }
  }

  if (targetPageId) {
    const snap = await getPublishedPageSnapshotById(db, targetPageId)
    return snap ? renderSnapshot(snap) : null
  }

  const snap = await getLatestPublishedSiteSnapshot(db)
  return snap ? renderSnapshot(snap) : null
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
      html,
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
  const base = bridgeBase()
  const secret = bridgeSecret()
  if (!base || !secret) {
    return { ok: true, skipped: 'LADIPAGE_BFF_BASE / LADIPAGE_BRIDGE_HMAC_SECRET not set' }
  }

  const binding = getLadipageSsoBinding(input.userId)
  if (!binding?.ladipagePageId) {
    return { ok: true, skipped: 'no Ladipage page binding from SSO' }
  }

  const published = await resolvePublishedHtml(input.db, input.uploadsDir, binding.instaticPageId)
  if (!published?.html) {
    return { ok: false, error: 'no published HTML to send' }
  }

  const result = await postBridgeJson('/api/internal/landing/publish-intent', {
    pageId: binding.ladipagePageId,
    externalPageId: binding.instaticPageId || published.externalPageId,
    html: published.html,
    seoTitle: published.title,
  })
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

export async function notifyLadipageDraftSaved(input: {
  db: DbClient
  userId: string
}): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  const base = bridgeBase()
  const secret = bridgeSecret()
  if (!base || !secret) {
    return { ok: true, skipped: 'LADIPAGE_BFF_BASE / LADIPAGE_BRIDGE_HMAC_SECRET not set' }
  }

  const binding = getLadipageSsoBinding(input.userId)
  if (!binding?.ladipagePageId || !binding.instaticPageId) {
    return { ok: true, skipped: 'no Ladipage page binding from SSO' }
  }

  const draft = await resolveDraftHtml(input.db, binding.instaticPageId)
  if (!draft?.html) {
    return { ok: false, error: 'no draft HTML to send' }
  }

  const result = await postBridgeJson('/api/internal/landing/draft-saved', {
    pageId: binding.ladipagePageId,
    externalPageId: binding.instaticPageId || draft.externalPageId,
    html: draft.html,
    seoTitle: draft.title,
  })
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}
