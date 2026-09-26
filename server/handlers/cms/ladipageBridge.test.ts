import { describe, expect, test } from 'bun:test'
import { createSqliteClient } from '../../db/sqlite'
import { sqliteMigrations } from '../../db/migrations-sqlite'
import { runMigrations } from '../../db/runMigrations'
import type { DbClient } from '../../db/client'
import { listDataRows, saveDataRowDraft } from '../../repositories/data'
import { getDraftSite, saveDraftSite } from '../../repositories/site'
import { pageFromRow, pageToCells } from '../../../src/core/data/pageFromRow'
import { handleLadipageBridgeRoutes } from './ladipageBridge'
import {
  createDefaultSiteExplorerOrganization,
  DEFAULT_BREAKPOINTS,
  DEFAULT_SITE_SETTINGS,
  type SiteShell,
} from '@core/page-tree'

const fakeDb = {} as never

async function createInMemoryTestDb(): Promise<DbClient> {
  const db = createSqliteClient(':memory:')
  await runMigrations(db, sqliteMigrations)
  return db
}

async function saveTestShell(db: DbClient): Promise<void> {
  const shell: SiteShell = {
    id: 'default',
    name: 'Test Site',
    breakpoints: DEFAULT_BREAKPOINTS,
    settings: structuredClone(DEFAULT_SITE_SETTINGS),
    styleRules: {},
    files: [],
    explorer: createDefaultSiteExplorerOrganization(),
    packageJson: { dependencies: {}, devDependencies: {} },
    runtime: { styles: {}, scripts: {}, dependencyLock: null },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await saveDraftSite(db, shell)
}

describe('handleLadipageBridgeRoutes', () => {
  test('ensure-page returns siteId/pageId', async () => {
    const db = await createInMemoryTestDb()
      const req = new Request('http://localhost/admin/api/cms/ladipage/ensure-page', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteKey: 'ws_1', pageKey: 'p1', title: 'T' }),
      })
      const res = await handleLadipageBridgeRoutes(req, db)
      expect(res).not.toBeNull()
      expect(res!.status).toBe(200)
      const body = await res!.json()
      expect(body.siteId).toBe('ws_1')
      expect(body.pageId).toBe('p1')

      const rows = await listDataRows(db, 'pages')
      expect(rows.map((row) => row.id)).toContain('p1')
      expect(rows.find((row) => row.id === 'p1')?.slug).toBe('t')
  })

  test('ensure-page keeps separate Ladipage rows instead of reusing Home', async () => {
    const db = await createInMemoryTestDb()
      for (const pageKey of ['page_lp_a', 'page_lp_b']) {
        const req = new Request('http://localhost/admin/api/cms/ladipage/ensure-page', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ siteKey: 'ws_1', pageKey, title: 'Landing' }),
        })
        const res = await handleLadipageBridgeRoutes(req, db)
        expect(res!.status).toBe(200)
        const body = await res!.json()
        expect(body.pageId).toBe(pageKey)
      }

      const rows = await listDataRows(db, 'pages')
      const byId = new Map(rows.map((row) => [row.id, row]))
      expect(byId.has('page_lp_a')).toBe(true)
      expect(byId.has('page_lp_b')).toBe(true)
      expect(byId.get('page_lp_a')?.slug).toBe('landing')
      expect(byId.get('page_lp_b')?.slug).toBe('landing-2')
  })

  test('import-html persists imported nodes into the Ladipage draft page', async () => {
    const db = await createInMemoryTestDb()
    const req = new Request('http://localhost/admin/api/cms/ladipage/import-html', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        siteId: 'ws_1',
        pageId: 'p1',
        title: 'Imported',
        html: '<main><h1>Hello</h1><p>World</p></main>',
      }),
    })

    const res = await handleLadipageBridgeRoutes(req, db)
    expect(res!.status).toBe(200)
    const body = await res!.json()
    expect(body.imported).toBe(true)
    expect(body.importedNodeCount).toBeGreaterThan(0)

    const rows = await listDataRows(db, 'pages')
    const row = rows.find((candidate) => candidate.id === 'p1')
    expect(row).toBeDefined()
    const page = pageFromRow(row!)
    const root = page.nodes[page.rootNodeId]
    expect(page.title).toBe('Imported')
    expect(root.children.length).toBeGreaterThan(0)
    expect(Object.values(page.nodes).some((node) => node.moduleId === 'base.text')).toBe(true)
  })

  test('import-html links imported class names to persisted style rules', async () => {
    const db = await createInMemoryTestDb()
    await saveTestShell(db)
    const req = new Request('http://localhost/admin/api/cms/ladipage/import-html', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pageId: 'p1',
        title: 'Styled',
        html: '<style>.hero{color:red}</style><main class="hero"><h1>Styled</h1></main>',
      }),
    })

    const res = await handleLadipageBridgeRoutes(req, db)
    expect(res!.status).toBe(200)

    const site = await getDraftSite(db)
    const heroRule = Object.values(site!.styleRules).find((rule) => rule.name === 'hero')
    expect(heroRule).toBeDefined()
    expect(heroRule!.styles.color).toBe('red')

    const row = (await listDataRows(db, 'pages')).find((candidate) => candidate.id === 'p1')
    const page = pageFromRow(row!)
    const importedNode = Object.values(page.nodes).find((node) => node.classIds.includes(heroRule!.id))
    expect(importedNode).toBeDefined()
    expect(importedNode!.classIds).not.toContain('hero')

    const importedSheet = site!.files.find((file) => file.path === 'imported/ladipage-p1.css')
    expect(importedSheet?.type).toBe('style')
    expect(importedSheet?.content).toContain('.hero{color:red}')
  })

  test('import-html upserts :root variables as a raw stylesheet', async () => {
    const db = await createInMemoryTestDb()
    await saveTestShell(db)
    const req = new Request('http://localhost/admin/api/cms/ladipage/import-html', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pageId: 'p1',
        title: 'Restaurant',
        html: '<style>:root{--text-color:#707070;--body-color:#FBFEFD}body{color:var(--text-color);background-color:var(--body-color)}.bd-grid{display:grid}</style><div class="bd-grid"><h1>Tasty food</h1></div>',
        linkedCss: '.extra{display:flex}',
      }),
    })

    const res = await handleLadipageBridgeRoutes(req, db)
    expect(res!.status).toBe(200)

    const site = await getDraftSite(db)
    const importedSheet = site!.files.find((file) => file.path === 'imported/ladipage-p1.css')
    expect(importedSheet?.type).toBe('style')
    expect(importedSheet?.content).toContain('--text-color:#707070')
    expect(importedSheet?.content).toContain('.bd-grid{display:grid}')
    expect(importedSheet?.content).toContain('.extra{display:flex}')
    expect(site!.runtime?.styles?.[importedSheet!.id]?.enabled).toBe(true)
  })

  test('import-html upserts linkedCss onto an existing page without replacing the tree', async () => {
    const db = await createInMemoryTestDb()
    await saveTestShell(db)
    const createReq = new Request('http://localhost/admin/api/cms/ladipage/import-html', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pageId: 'p1',
        title: 'Existing',
        html: '<main><h1>Hello</h1></main>',
      }),
    })
    expect((await handleLadipageBridgeRoutes(createReq, db))!.status).toBe(200)

    const rowsBefore = await listDataRows(db, 'pages')
    const pageBefore = pageFromRow(rowsBefore.find((row) => row.id === 'p1')!)
    const childCount = pageBefore.nodes[pageBefore.rootNodeId].children.length

    const updateReq = new Request('http://localhost/admin/api/cms/ladipage/import-html', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pageId: 'p1',
        html: '<main><h1>Replaced</h1></main>',
        linkedCss: ':root{--text-color:#393939}body{color:var(--text-color)}',
        replaceIfEmpty: true,
      }),
    })
    expect((await handleLadipageBridgeRoutes(updateReq, db))!.status).toBe(200)

    const rowsAfter = await listDataRows(db, 'pages')
    const pageAfter = pageFromRow(rowsAfter.find((row) => row.id === 'p1')!)
    expect(pageAfter.nodes[pageAfter.rootNodeId].children.length).toBe(childCount)

    const site = await getDraftSite(db)
    const importedSheet = site!.files.find((file) => file.path === 'imported/ladipage-p1.css')
    expect(importedSheet?.content).toContain('--text-color:#393939')
    expect(importedSheet?.content).toContain('body{color:var(--text-color)}')
  })

  test('import-html without a pre-created site shell still links classes and stores CSS', async () => {
    const db = await createInMemoryTestDb()
    const req = new Request('http://localhost/admin/api/cms/ladipage/import-html', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pageId: 'p1',
        title: 'Restaurant',
        html: '<style>.bd-grid{display:grid}</style><div class="bd-grid"><h1>Tasty food</h1></div>',
      }),
    })

    expect((await handleLadipageBridgeRoutes(req, db))!.status).toBe(200)

    const site = await getDraftSite(db)
    expect(site).not.toBeNull()
    const gridRule = Object.values(site!.styleRules).find((rule) => rule.name === 'bd-grid')
    expect(gridRule).toBeDefined()

    const row = (await listDataRows(db, 'pages')).find((candidate) => candidate.id === 'p1')
    const page = pageFromRow(row!)
    const gridNode = Object.values(page.nodes).find((node) => node.classIds.includes(gridRule!.id))
    expect(gridNode).toBeDefined()
    expect(site!.files.some((file) => file.content?.includes('.bd-grid{display:grid}'))).toBe(true)
  })

  test('import-html relinks class names on an existing page when CSS is upserted', async () => {
    const db = await createInMemoryTestDb()
    await saveTestShell(db)
    const createReq = new Request('http://localhost/admin/api/cms/ladipage/import-html', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pageId: 'p1',
        title: 'Existing',
        html: '<div class="bd-grid"><h1>Hello</h1></div>',
      }),
    })
    expect((await handleLadipageBridgeRoutes(createReq, db))!.status).toBe(200)

    const rows = await listDataRows(db, 'pages')
    const page = pageFromRow(rows.find((row) => row.id === 'p1')!)
    const gridNode = Object.values(page.nodes).find((node) =>
      node.classIds.some((id) => id === 'bd-grid' || id.length > 0),
    )
    expect(gridNode).toBeDefined()
    // Simulate a pre-linker import: classIds stored as HTML class names.
    gridNode!.classIds = ['bd-grid']
    await saveDataRowDraft(
      db,
      page.id,
      { cells: pageToCells(page), slug: page.slug },
      null,
    )

    const updateReq = new Request('http://localhost/admin/api/cms/ladipage/import-html', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pageId: 'p1',
        html: '<div class="bd-grid"><h1>Hello</h1></div>',
        linkedCss: '.bd-grid{display:grid}',
        replaceIfEmpty: true,
      }),
    })
    expect((await handleLadipageBridgeRoutes(updateReq, db))!.status).toBe(200)

    const site = await getDraftSite(db)
    const gridRule = Object.values(site!.styleRules).find((rule) => rule.name === 'bd-grid')
    expect(gridRule).toBeDefined()
    const after = pageFromRow((await listDataRows(db, 'pages')).find((row) => row.id === 'p1')!)
    const relinked = Object.values(after.nodes).find((node) => node.classIds.includes(gridRule!.id))
    expect(relinked).toBeDefined()
    expect(relinked!.classIds).not.toContain('bd-grid')
  })

  test('unknown ladipage path is 404 with path', async () => {
    const req = new Request('http://localhost/admin/api/cms/ladipage/nope', { method: 'GET' })
    const res = await handleLadipageBridgeRoutes(req, fakeDb)
    expect(res!.status).toBe(404)
    const body = await res!.json()
    expect(body.error).toBe('Not found')
  })

  test('non-prefix returns null', async () => {
    const req = new Request('http://localhost/admin/api/cms/other', { method: 'GET' })
    const res = await handleLadipageBridgeRoutes(req, fakeDb)
    expect(res).toBeNull()
  })
})
