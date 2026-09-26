/**
 * Auth redirect helpers.
 *
 * The OAuth flow accepts a `next` destination so users land back where they
 * started. That value arrives from the URL, so it is untrusted input and must
 * never be used as a raw redirect target (open-redirect / header-injection).
 * Everything that turns `next` into a URL goes through these helpers.
 */

/** Route that completes the OAuth code exchange. */
export const AUTH_CALLBACK_PATH = '/auth/callback'

/** Fallback destination when no (or an invalid) `next` value is supplied. */
export const DEFAULT_AUTH_NEXT = '/'

/** Upper bound for a candidate path; anything longer is treated as hostile. */
const MAX_AUTH_NEXT_LENGTH = 512

/** Non-routable sentinel used to resolve candidates for validation only. */
const AUTH_URL_SENTINEL = 'https://rrs-auth-sentinel.invalid'

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/

/**
 * Validates an untrusted `next` value and returns a safe, same-origin path.
 *
 * Rejected (returns `fallback`):
 *   - non-strings, empty strings, whitespace-only strings
 *   - absolute URLs (`https://evil.com`), protocol-relative (`//evil.com`)
 *   - backslash variants (`/\evil.com`, `/a\b`) that browsers normalize to `//`
 *   - control characters / CRLF (response-splitting and header injection)
 *   - over-long values
 *
 * Accepted values are re-serialized from the URL parser so query strings and
 * fragments survive while the origin cannot change.
 */
export function sanitizeAuthNextPath(
  value: unknown,
  fallback: string = DEFAULT_AUTH_NEXT
): string {
  if (typeof value !== 'string') return fallback

  const candidate = value.trim()
  if (!candidate || candidate.length > MAX_AUTH_NEXT_LENGTH) return fallback
  if (!candidate.startsWith('/')) return fallback
  if (candidate.startsWith('//') || candidate.startsWith('/\\')) return fallback
  if (candidate.includes('\\')) return fallback
  if (CONTROL_CHARACTERS.test(candidate)) return fallback

  try {
    const resolved = new URL(candidate, AUTH_URL_SENTINEL)
    // A same-origin resolution is the only acceptable outcome.
    if (resolved.origin !== AUTH_URL_SENTINEL) return fallback
    return `${resolved.pathname}${resolved.search}${resolved.hash}`
  } catch {
    return fallback
  }
}

/** Fallback destination for an admin `next` value. */
export const ADMIN_NEXT_FALLBACK = '/admin'

/**
 * Validates an untrusted `next` value and confines it to the admin panel.
 *
 * `sanitizeAuthNextPath()` already guarantees a same-origin path; an admin
 * login adds a second requirement — the destination must stay under `/admin`,
 * so a crafted `?next=` cannot hand an admin session to a storefront route (or
 * the reverse) after the OAuth round trip.
 */
export function sanitizeAdminNextPath(
  value: unknown,
  fallback: string = ADMIN_NEXT_FALLBACK
): string {
  const safe = sanitizeAuthNextPath(value, fallback)

  if (safe === ADMIN_NEXT_FALLBACK) return safe
  if (safe.startsWith(`${ADMIN_NEXT_FALLBACK}/`) || safe.startsWith(`${ADMIN_NEXT_FALLBACK}?`)) {
    return safe
  }

  return fallback
}

/**
 * Builds the `redirectTo` URL handed to `supabase.auth.signInWithOAuth()`.
 *
 * The result must be listed in the Supabase dashboard under
 * Authentication → URL Configuration → Redirect URLs (for example
 * `https://your-domain.com/auth/callback`, plus `/**` variants for preview
 * deployments). The `next` path is only appended when it is non-default and
 * already sanitized, so the URL stays stable for allow-list matching.
 */
export function buildAuthCallbackUrl(siteUrl: string, next?: unknown): string {
  const base = siteUrl.trim().replace(/\/+$/, '')
  const target = sanitizeAuthNextPath(next)

  const url = new URL(`${base}${AUTH_CALLBACK_PATH}`)
  if (target !== DEFAULT_AUTH_NEXT) {
    url.searchParams.set('next', target)
  }

  return url.toString()
}
