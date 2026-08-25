// fallow-ignore-file unused-file
// Loaded at runtime by plugin bundles via the import map in index.html.
// Fallow cannot see this static-asset path; the file is live in production.
/**
 * Plugin-runtime shim for `@instatic/plugin-sdk`.
 *
 * Plugins import the runtime helpers + builders from this package. Most
 * of the SDK is type-only (manifest types, render-context types) — those
 * don't need a runtime entry. Only the helpers plugins call at runtime
 * are exposed here.
 *
 * The host's main bundle populates `globalThis.__instatic.pluginSdk`
 * with the live builder functions.
 */
const G = globalThis.__instatic?.pluginSdk
if (!G) {
  throw new Error(
    "[@instatic/runtime] Plugin SDK not initialized. Did the host bundle finish loading before the plugin import?",
  )
}

export const PLUGIN_API_VERSION = G.PLUGIN_API_VERSION
export const definePluginPanel = G.definePluginPanel
export const definePluginCanvasOverlay = G.definePluginCanvasOverlay
export const definePluginAdminApp = G.definePluginAdminApp
export const definePlugin = G.definePlugin
export const defineModule = G.defineModule
export const defineComponent = G.defineComponent
export const definePack = G.definePack
export const permissions = G.permissions
export const control = G.control
export const html = G.html
export const raw = G.raw
export const escapeHtml = G.escapeHtml
export const safeUrl = G.safeUrl
export const createNamespace = G.createNamespace
export const h = G.h
export const vc = G.vc
