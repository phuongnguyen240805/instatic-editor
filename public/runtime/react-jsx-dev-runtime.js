// fallow-ignore-file unused-file
// Loaded at runtime by plugin bundles via the import map in index.html.
// Fallow cannot see this static-asset path; the file is live in production.
/**
 * Plugin-runtime shim for `react/jsx-dev-runtime`.
 *
 * Bun.build emits `import { jsxDEV } from 'react/jsx-dev-runtime'` in
 * dev / non-production bundles. The browser resolves that bare specifier
 * through the host's import map to this file, which re-exports the host's
 * own JSX dev runtime — so plugins share the host's React instance even
 * for development-mode JSX.
 *
 * Production note: React 19's `react-jsx-dev-runtime.production.js`
 * exports `jsxDEV` as `void 0`. Plugins built with the dev JSX transform
 * therefore crash with "jsxDEV is not a function" in a production host.
 * The fix is to build plugins with production JSX: `instatic-plugin build`
 * passes `define: { 'process.env.NODE_ENV': '"production"' }` to
 * `Bun.build`, which makes Bun's transpiler emit `react/jsx-runtime`
 * (with real `jsx`/`jsxs`) instead. Third-party plugin authors using a
 * different bundler must do the same — there is intentionally no
 * fallback here.
 */
const G = globalThis.__instatic?.ReactJsxDevRuntime
if (!G) {
  throw new Error(
    "[@instatic/runtime] Host React JSX dev runtime not initialized. Did the host bundle finish loading before the plugin import?",
  )
}

export const jsxDEV = G.jsxDEV
export const Fragment = G.Fragment
