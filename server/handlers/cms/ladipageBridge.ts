/**
 * Minimal CMS routes used by Ladipage Nest adapter (landing-cms).
 *
 *   POST /admin/api/cms/ladipage/ensure-page
 *   POST /admin/api/cms/ladipage/import-html
 *   GET  /admin/api/cms/ladipage/pages/:pageId/artifact
 *
 * Artifact prefers real published HTML (Layer A disk / published snapshot).
 * Ensure/import materialize Ladipage-owned pages into the Instatic draft tree.
 */
import type { DbClient } from '../../db/client'
import { badRequest, jsonResponse, methodNotAllowed, readValidatedBody } from '../../http'
import { Type } from '@core/utils/typeboxHelpers'
import { CMS_API_PREFIX } from './shared'
import {
  getPublishedPageSnapshotById,
} from '../../repositories/publish'
import { createDataRow, listDataRows, saveDataRowDraft } from '../../repositories/data'
import { getDraftSite, saveDraftSite } from '../../repositories/site'
import { pageFromRow, pageToCells } from '../../../src/core/data/pageFromRow'
import { renderPublishedSnapshot } from '../../publish/publicRenderer'
import { applyPublishedHtmlPipeline } from '../../publish/publishedHtmlPipeline'
import { readArtefact } from '../../publish/staticArtefact'
import { nanoid } from 'nanoid'
import { classKindSelector, createNode, type PageNode, type SiteShell, type StyleRule } from '@core/page-tree'
import type { Page } from '@core/page-tree'
import { importHtml } from '@core/htmlImport'
import { cssToStyleRules, type NewStyleRule } from '@core/siteImport'

const PREFIX = `${CMS_API_PREFIX}/ladipage`

function uploadsDir(): string {
  return process.env.UPLOADS_DIR?.trim() || './uploads'
}

function pageFromSnapshot(snap: {
  pageRowId: string
  site: { pages: Array<{ id: string; slug?: string; title?: string }> }
}): { slug: string; title: string } {
  const page = snap.site.pages.find((p) => p.id === snap.pageRowId)
  const slug = page?.slug || 'index'
  return { slug, title: page?.title || slug }
}

function slugBase(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'page'
}

function uniqueSlug(base: string, rows: Array<{ slug?: string | null }>): string {
  const used = new Set(rows.map((row) => row.slug).filter(Boolean))
  if (!used.has(base)) return base
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${base}-${i}`
    if (!used.has(candidate)) return candidate
  }
  return `${base}-${Date.now()}`
}

async function ensureServerDomParser(): Promise<void> {
  if (typeof DOMParser !== 'undefined') return

  const { GlobalWindow } = await import('happy-dom')
  const window = new GlobalWindow({ url: 'http://localhost/' })
  const target = globalThis as unknown as {
    DOMParser: typeof DOMParser
    CSSStyleSheet: typeof CSSStyleSheet
  }
  target.DOMParser = window.DOMParser as typeof DOMParser
  target.CSSStyleSheet = window.CSSStyleSheet as unknown as typeof CSSStyleSheet
}

function stampParentIds(
  nodes: Record<string, PageNode>,
  nodeId: string,
  parentId: string | null,
): void {
  const node = nodes[nodeId]
  if (!node) return
  node.parentId = parentId
  for (const childId of node.children) {
    stampParentIds(nodes, childId, node.id)
  }
}

function indexStyleRulesByName(rules: Record<string, StyleRule>): Map<string, string> {
  const byName = new Map<string, string>()
  for (const rule of Object.values(rules)) {
    if (!byName.has(rule.name)) byName.set(rule.name, rule.id)
  }
  return byName
}

function maxStyleRuleOrder(rules: Record<string, StyleRule>): number {
  let maxOrder = -1
  for (const rule of Object.values(rules)) {
    if (typeof rule.order === 'number' && rule.order > maxOrder) maxOrder = rule.order
  }
  return maxOrder
}

function mergeImportedStyleRules(
  rules: readonly NewStyleRule[],
  siteRules: Record<string, StyleRule>,
  byName: Map<string, string>,
): void {
  if (rules.length === 0) return

  const ambientSelectors = new Set<string>()
  for (const rule of Object.values(siteRules)) {
    if (rule.kind === 'ambient') ambientSelectors.add(rule.selector)
  }

  let maxOrder = maxStyleRuleOrder(siteRules)
  const now = Date.now()
  for (const rule of rules) {
    if (rule.kind === 'class') {
      if (byName.has(rule.name)) continue
    } else if (ambientSelectors.has(rule.selector)) {
      continue
    }

    const id = nanoid()
    const styleRule: StyleRule = {
      ...rule,
      id,
      order: (maxOrder += 1),
      createdAt: now,
      updatedAt: now,
    }
    siteRules[id] = styleRule
    if (rule.kind === 'class') byName.set(rule.name, id)
    else ambientSelectors.add(rule.selector)
  }
}

function linkImportedClassNames(
  classNames: readonly string[] | undefined,
  siteRules: Record<string, StyleRule>,
  byName: Map<string, string>,
): string[] {
  if (!classNames?.length) return []

  const ids: string[] = []
  for (const name of classNames) {
    if (!name) continue
    let id = byName.get(name)
    if (!id) {
      const now = Date.now()
      const styleRule: StyleRule = {
        id: nanoid(),
        name,
        kind: 'class',
        selector: classKindSelector(name),
        order: maxStyleRuleOrder(siteRules) + 1,
        styles: {},
        contextStyles: {},
        createdAt: now,
        updatedAt: now,
      }
      siteRules[styleRule.id] = styleRule
      byName.set(name, styleRule.id)
      id = styleRule.id
    }
    if (!ids.includes(id)) ids.push(id)
  }
  return ids
}

async function applyImportedStyles(
  db: DbClient,
  fragment: ReturnType<typeof importHtml>,
  nodes: Record<string, PageNode>,
  rootNode: PageNode,
): Promise<void> {
  const shell = await getDraftSite(db)
  if (!shell) return

  const byName = indexStyleRulesByName(shell.styleRules)
  const parsedCss = fragment.styleCss.trim()
    ? cssToStyleRules(fragment.styleCss, { breakpoints: shell.breakpoints })
    : { rules: [], conditions: [] }

  mergeImportedStyleRules(parsedCss.rules, shell.styleRules, byName)
  rootNode.classIds = linkImportedClassNames(rootNode.classIds, shell.styleRules, byName)
  for (const node of Object.values(nodes)) {
    node.classIds = linkImportedClassNames(node.classIds, shell.styleRules, byName)
  }

  if (parsedCss.conditions.length > 0) {
    if (!shell.conditions) shell.conditions = []
    const existing = new Set(shell.conditions.map((condition) => condition.id))
    for (const condition of parsedCss.conditions) {
      if (existing.has(condition.id)) continue
      existing.add(condition.id)
      shell.conditions.push(condition)
    }
  }

  const nextShell: SiteShell = { ...shell, updatedAt: Date.now() }
  await saveDraftSite(db, nextShell, null)
}

async function importHtmlIntoPage(
  db: DbClient,
  input: {
    pageId: string
    title: string
    slug: string
    html: string
  },
): Promise<{ importedNodeCount: number }> {
  await ensureServerDomParser()

  const fragment = importHtml(input.html)
  const rootNode = createNode('base.body')
  rootNode.children = [...fragment.rootIds]
  if (fragment.body?.classIds) rootNode.classIds = fragment.body.classIds
  if (fragment.body?.inlineStyles) rootNode.inlineStyles = fragment.body.inlineStyles
  if (fragment.body?.props) {
    rootNode.props = { ...rootNode.props, ...fragment.body.props }
  }

  const nodes: Record<string, PageNode> = {
    [rootNode.id]: rootNode,
    ...fragment.nodes,
  }
  stampParentIds(nodes, rootNode.id, null)
  await applyImportedStyles(db, fragment, nodes, rootNode)

  const page: Page = {
    id: input.pageId,
    title: input.title,
    slug: input.slug,
    nodes,
    rootNodeId: rootNode.id,
  }

  await saveDataRowDraft(
    db,
    input.pageId,
    { cells: pageToCells(page), slug: page.slug },
    null,
  )

  return { importedNodeCount: fragment.rootIds.length }
}

export async function ensureLadipagePage(
  db: DbClient,
  input: {
    siteKey?: string | null
    pageKey?: string | null
    title?: string | null
  },
): Promise<{ siteId: string; pageId: string }> {
  const siteId = (input.siteKey || 'default').trim() || 'default'
  const requestedPageId = (input.pageKey || 'home').trim() || 'home'
  const title = (input.title || requestedPageId).trim() || requestedPageId

  const rows = await listDataRows(db, 'pages')
  const existing =
    rows.find((row) => row.id === requestedPageId) ||
    rows.find((row) => row.slug === requestedPageId)
  if (existing) return { siteId, pageId: existing.id }

  const rootNode = createNode('base.body')
  const page: Page = {
    id: requestedPageId,
    title,
    slug: uniqueSlug(slugBase(title || requestedPageId), rows),
    nodes: { [rootNode.id]: rootNode },
    rootNodeId: rootNode.id,
  }
  const row = await createDataRow(
    db,
    { id: page.id, tableId: 'pages', cells: pageToCells(page), slug: page.slug },
    null,
  )
  return { siteId, pageId: row.id }
}

async function buildArtifactHtml(
  db: DbClient,
  pageId: string,
  siteIdHint?: string | null,
): Promise<{ html: string; title: string; etag: string } | null> {
  // 1) Published snapshot by exact id. Never fall back to "latest": Ladipage
  // page isolation depends on a miss staying a miss for this page id.
  const snap = await getPublishedPageSnapshotById(db, pageId)
  if (snap) {
    try {
      const { slug, title } = pageFromSnapshot(snap)
      const urlPath = slug === 'index' ? '/' : `/${slug}`
      const syntheticUrl = new URL(`http://localhost${urlPath}`)
      const rendered = await renderPublishedSnapshot(snap, { db, url: syntheticUrl })
      const html = await applyPublishedHtmlPipeline(rendered, db)
      return {
        html,
        title,
        etag: `pub-${snap.pageRowId}`,
      }
    } catch {
      /* fall through */
    }
  }

  // 2) Static artefact on disk. Only use this for the homepage mapping; for a
  // specific page id, a generic "/" hit would leak another page's content.
  try {
    const rows = await listDataRows(db, 'pages')
    const pageRow = rows.find((r) => r.id === pageId)
    if (pageRow) {
      const page = pageFromRow(pageRow)
      const urlPath = page.slug === 'index' ? '/' : `/${page.slug}`
      const html = await readArtefact(uploadsDir(), urlPath)
      if (html?.trim()) {
        return { html, title: page.title || pageId, etag: `disk-${pageId}` }
      }
    }
  } catch {
    /* disk may fail in tests */
  }

  // 3) Draft page row (pre-publish)
  try {
    const rows = await listDataRows(db, 'pages')
    const match =
      rows.find((r) => r.id === pageId) ||
      rows.find((r) => r.slug === pageId)
    if (match) {
      const page = pageFromRow(match)
      const title = page.title || match.slug || pageId
      const html = [
        '<!DOCTYPE html><html><head><meta charset="utf-8">',
        `<title>${escapeHtml(title)}</title></head>`,
        `<body data-lp-page="${escapeHtml(pageId)}" data-instatic-draft="1">`,
        `<main><h1>${escapeHtml(title)}</h1>`,
        '<p>Draft page (publish in Instatic to bake full HTML).</p></main>',
        '</body></html>',
      ].join('')
      return { html, title, etag: `draft-${match.id}` }
    }
  } catch {
    /* ignore */
  }

  void siteIdHint
  return null
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function handleLadipageBridgeRoutes(
  req: Request,
  db: DbClient,
): Promise<Response | null> {
  const url = new URL(req.url)
  const pathname = url.pathname.replace(/\/+$/, '') || '/'

  if (!pathname.startsWith(PREFIX)) return null

  // POST .../ensure-page
  if (pathname === `${PREFIX}/ensure-page`) {
    if (req.method !== 'POST') return methodNotAllowed()
    const EnsureSchema = Type.Object({
      siteKey: Type.Optional(Type.String()),
      pageKey: Type.Optional(Type.String()),
      title: Type.Optional(Type.String()),
      html: Type.Optional(Type.String()),
    })
    const body = await readValidatedBody(req, EnsureSchema)
    const { siteId, pageId } = await ensureLadipagePage(db, {
      siteKey: body?.siteKey,
      pageKey: body?.pageKey,
      title: body?.title,
    })
    return jsonResponse({ siteId, pageId, id: pageId })
  }

  // POST .../import-html
  if (pathname === `${PREFIX}/import-html`) {
    if (req.method !== 'POST') return methodNotAllowed()
    const ImportSchema = Type.Object({
      siteId: Type.Optional(Type.String()),
      pageId: Type.Optional(Type.String()),
      html: Type.Optional(Type.String()),
      title: Type.Optional(Type.String()),
    })
    const body = await readValidatedBody(req, ImportSchema)
    if (!body) return badRequest('Invalid body')
    const { siteId, pageId } = await ensureLadipagePage(db, {
      siteKey: body.siteId,
      pageKey: body.pageId,
      title: body.title,
    })
    const rows = await listDataRows(db, 'pages')
    const row = rows.find((candidate) => candidate.id === pageId)
    const page = row ? pageFromRow(row) : null
    const html = body.html?.trim() ?? ''
    let importedNodeCount = 0

    if (html) {
      const imported = await importHtmlIntoPage(db, {
        pageId,
        title: body.title?.trim() || page?.title || pageId,
        slug: page?.slug || uniqueSlug(slugBase(body.title || pageId), rows),
        html,
      })
      importedNodeCount = imported.importedNodeCount
    }

    return jsonResponse({
      siteId,
      pageId,
      ok: true,
      imported: importedNodeCount > 0,
      importedNodeCount,
    })
  }

  // GET .../pages/:pageId/artifact
  const artifactMatch = pathname.match(
    new RegExp(`^${PREFIX.replace(/\//g, '\\/')}/pages/([^/]+)/artifact$`),
  )
  if (artifactMatch) {
    if (req.method !== 'GET') return methodNotAllowed()
    const pageId = decodeURIComponent(artifactMatch[1])
    const siteId = url.searchParams.get('siteId')
    const artifact = await buildArtifactHtml(db, pageId, siteId)
    if (!artifact) {
      const title = pageId
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body data-lp-page="${escapeHtml(pageId)}"><main><h1>${escapeHtml(title)}</h1><p>No published artifact yet. Save + Publish in the editor first.</p></main></body></html>`
      return jsonResponse({
        html,
        title,
        description: '',
        etag: `empty-${pageId}`,
      })
    }
    return jsonResponse({
      html: artifact.html,
      title: artifact.title,
      description: '',
      etag: artifact.etag,
    })
  }

  return jsonResponse({ error: 'Not found', path: pathname }, { status: 404 })
}
