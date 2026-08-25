/**
 * URL Validation Utilities
 *
 * Centralised allowlist predicates for editor property controls.
 * Both functions follow the same contract: empty string → true (no value is
 * valid for optional fields), non-empty string → validate protocol.
 *
 * Separate from `isSafeUrl()` in `src/core/publisher/` which is the stricter
 * enforcement gate applied at HTML export time. This module is the
 * input-boundary gate applied at user-input / site-load time.
 *
 * Allowlists:
 *   isValidUrl()       — https, http, mailto
 *   isValidImageUrl()  — https, http, data:image/* (inline base64 images)
 */

/**
 * Returns true if `v` is a safe general-purpose URL for storing in site
 * props (e.g. a link href, a button href).
 *
 * Allows:  https:, http:, mailto:
 * Rejects: javascript:, data:, ftp:, blob:, custom schemes, malformed strings
 */
export function isValidUrl(v: string): boolean {
  if (!v) return true
  try {
    const { protocol } = new URL(v)
    return protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:'
  } catch {
    return false
  }
}

/**
 * Returns true if `v` is a safe URL to use as an `<img src>`.
 *
 * Allows:  https:, http:, data:image/* (e.g. data:image/png;base64,…)
 * Rejects: javascript:, data:text/html, data:application/*, blob:, ftp:,
 *          mailto:, custom schemes, malformed strings
 *
 * Note: `data:image/*` is allowed because base64-encoded inline images are a
 * legitimate use case in the editor (e.g. pasted screenshots, small icons).
 * All other `data:` subtypes are rejected to prevent unexpected content from
 * rendering in the editor preview.
 */
export function isValidImageUrl(v: string): boolean {
  if (!v) return true
  try {
    const { protocol } = new URL(v)
    if (protocol === 'https:' || protocol === 'http:') return true
    if (protocol === 'data:') return v.toLowerCase().startsWith('data:image/')
    return false
  } catch {
    return false
  }
}
