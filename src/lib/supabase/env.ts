/**
 * Centralised Supabase environment accessors.
 *
 * Every Supabase client (browser, server, admin) resolves its URL and public
 * key here so a misconfigured deployment fails with one clear message instead
 * of an undefined URL deep inside the auth SDK.
 *
 * Only `NEXT_PUBLIC_*` variables are read by `getSiteUrl()`, because that
 * helper runs in the browser (OAuth `redirectTo`).
 */

/**
 * Returns the project URL (`NEXT_PUBLIC_SUPABASE_URL`).
 */
export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) {
    throw new Error('[Supabase] NEXT_PUBLIC_SUPABASE_URL must be set.')
  }
  return url
}

/**
 * Returns the browser-safe public API key.
 *
 * Supabase renamed the `anon` key to the `publishable` key. Both names are
 * accepted so existing deployments (which still set `..._ANON_KEY`) keep
 * working while new environments can adopt the new name.
 */
export function getSupabasePublishableKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!key) {
    throw new Error(
      '[Supabase] NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) must be set.'
    )
  }
  return key
}

/**
 * Ensures a configured site URL is an absolute origin with no trailing slash.
 * Vercel exposes `NEXT_PUBLIC_VERCEL_URL` without a protocol, so add one when
 * the value is not already absolute.
 */
function normalizeOrigin(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(trimmed)) return `http://${trimmed}`
  return `https://${trimmed}`
}

/**
 * Returns the canonical public origin of this deployment.
 *
 * Order of preference:
 *   1. `NEXT_PUBLIC_SITE_URL` (set this in production / Vercel)
 *   2. `NEXT_PUBLIC_APP_URL` (legacy alias kept for existing environments)
 *   3. `NEXT_PUBLIC_VERCEL_URL` (auto-set by Vercel for previews)
 *   4. `window.location.origin` in the browser
 *   5. `http://localhost:3000` for local development / tests
 *
 * The returned origin MUST be listed in the Supabase dashboard under
 * Authentication → URL Configuration → Redirect URLs with the
 * `/auth/callback` path, otherwise OAuth sign-in is rejected.
 */
export function getSiteUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_VERCEL_URL

  if (configured) return normalizeOrigin(configured)
  if (typeof window !== 'undefined') return window.location.origin
  return 'http://localhost:3000'
}
