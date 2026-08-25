// fallow-ignore-file unused-file
// Loaded at runtime by plugin bundles via the import map in index.html.
// Fallow cannot see this static-asset path; the file is live in production.
/**
 * Plugin-runtime shim for `react/jsx-runtime`.
 *
 * The new JSX transform (React 17+) compiles `<Foo>...</Foo>` to imports
 * from `react/jsx-runtime`. Plugin bundles externalize this module so
 * each plugin uses the host's React JSX runtime — same instance, same
 * dispatcher, no duplicate-React crash.
 */
const G = globalThis.__instatic?.ReactJsxRuntime
if (!G) {
  throw new Error(
    "[@instatic/runtime] Host React JSX runtime not initialized. Did the host bundle finish loading before the plugin import?",
  )
}

export const jsx = G.jsx
export const jsxs = G.jsxs
export const Fragment = G.Fragment
