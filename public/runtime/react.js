// fallow-ignore-file unused-file
// Loaded at runtime by plugin bundles via the import map in index.html.
// Fallow cannot see this static-asset path; the file is live in production.
/**
 * Plugin-runtime shim for `react`.
 *
 * Plugin bundles externalize `react` and resolve it through the host's
 * import map (see index.html) to this URL. At load time, the host's main
 * bundle has already populated `globalThis.__instatic.React` with the
 * editor's live React instance — we re-export the named API plus the
 * default so plugin authors can write either `import * as React from 'react'`
 * or `import { useState } from 'react'`.
 *
 * This guarantees one React copy per page and zero React in plugin
 * bundles. If the host bundle hasn't loaded yet (an extremely-edge race
 * we shouldn't ever hit because the import map is parsed eagerly and
 * plugins import lazily), we throw a clear diagnostic instead of
 * silently re-instantiating React.
 */
const G = globalThis.__instatic?.React
if (!G) {
  throw new Error(
    "[@instatic/runtime] Host React not initialized. Did the host bundle finish loading before the plugin import?",
  )
}

export const Children = G.Children
export const Component = G.Component
export const Fragment = G.Fragment
export const Profiler = G.Profiler
export const PureComponent = G.PureComponent
export const StrictMode = G.StrictMode
export const Suspense = G.Suspense
export const cloneElement = G.cloneElement
export const createContext = G.createContext
export const createElement = G.createElement
export const createRef = G.createRef
export const forwardRef = G.forwardRef
export const isValidElement = G.isValidElement
export const lazy = G.lazy
export const memo = G.memo
export const startTransition = G.startTransition
export const useCallback = G.useCallback
export const useContext = G.useContext
export const useDebugValue = G.useDebugValue
export const useDeferredValue = G.useDeferredValue
export const useEffect = G.useEffect
export const useId = G.useId
export const useImperativeHandle = G.useImperativeHandle
export const useInsertionEffect = G.useInsertionEffect
export const useLayoutEffect = G.useLayoutEffect
export const useMemo = G.useMemo
export const useReducer = G.useReducer
export const useRef = G.useRef
export const useState = G.useState
export const useSyncExternalStore = G.useSyncExternalStore
export const useTransition = G.useTransition
export const version = G.version
export default G
