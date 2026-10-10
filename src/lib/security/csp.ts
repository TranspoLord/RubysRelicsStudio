/**
 * Content-Security-Policy construction (SEC-047; docs/archive/SEPT_IMPLEMENTATION_PLAN §7.1/§7.6).
 *
 * The policy is built here rather than inside `src/proxy.ts` for one reason: the
 * nonce must be identical in three places — the `Content-Security-Policy` header,
 * the `x-nonce` response header the root layout reads, and the `rrs_csp_nonce`
 * cookie fallback. When those can drift (or be assembled by hand at each call
 * site) a mismatch presents exactly like an unhydrated page, which is the failure
 * mode §7.1 warns about. `applyCspToResponse()` sets all three from one value, so
 * a call site cannot get it wrong, and this module is unit-tested.
 *
 * §7.1: `@vercel/analytics` injects its loader from https://va.vercel-scripts.com
 * and exposes no `nonce` prop, so the *origin* has to be allow-listed or every
 * `track()` call in src/lib/analytics/events.ts is blocked and analytics stay
 * dark. The beacon target (vitals.vercel-insights.com) was already allowed in
 * `connect-src`, so the script origin was the only missing piece — and it is
 * missing in *both* branches, so dev/preview console noise is fixed too.
 */

import { NextResponse } from 'next/server'

import { isHttpsDeployment, isPreviewDeployment, isProd } from '@/lib/security/env'

/** Response header carrying the CSP. */
export const CSP_HEADER = 'Content-Security-Policy'

/** Response header carrying the nonce, read by the root layout via `headers()`. */
export const CSP_NONCE_HEADER = 'x-nonce'

/**
 * Cookie fallback for the nonce, read by the root layout via `cookies()`.
 *
 * Re-exported from `src/proxy.ts` for backwards compatibility with the SEC-047
 * notes in docs/archive/ADMIN_MFA_LOGIN_REVIEW.md.
 */
export const CSP_NONCE_COOKIE = 'rrs_csp_nonce'

/** Short-lived: the nonce only needs to outlive the request that generated it. */
export const CSP_NONCE_COOKIE_MAX_AGE_SECONDS = 60

/**
 * `@vercel/analytics` loader origin. Both the production loader and the dev
 * `script.debug.js` are served from here, so one entry covers dev and prod
 * (§7.1's dev/prod parity requirement).
 */
export const CSP_ANALYTICS_SCRIPT_ORIGIN = 'https://va.vercel-scripts.com'

/**
 * The Vercel preview toolbar. Preview deployments only (OCT #69) — production
 * has no business loading it, and `frame-src`/`script-src` entries are attack
 * surface like any other allow-list entry.
 */
export const CSP_VERCEL_LIVE_ORIGIN = 'https://vercel.live'

/** Analytics beacon origin — allow-listing the loader without this drops events. */
export const CSP_ANALYTICS_CONNECT_ORIGIN = 'https://vitals.vercel-insights.com'

/**
 * Script origins the app legitimately boots from, besides its own bundle.
 *
 * OCT #69: `https://vercel.live` is now conditional. It used to be allow-listed
 * in *every* environment, including production, where nothing loads it.
 */
export function cspScriptOrigins(): string[] {
  const origins = [CSP_ANALYTICS_SCRIPT_ORIGIN]
  if (isPreviewDeployment()) origins.unshift(CSP_VERCEL_LIVE_ORIGIN)
  return origins
}

/**
 * Origins of **this deployment's** Supabase project, derived from
 * `NEXT_PUBLIC_SUPABASE_URL` (OCT #69).
 *
 * The policy used to carry `https://*.supabase.co` + `wss://*.supabase.co`,
 * which allow-lists *every* Supabase project on the internet: injected script
 * could exfiltrate to an attacker's own project, which is exactly the origin the
 * wildcard blesses. Realtime needs the websocket form, so both are returned.
 *
 * A missing or malformed URL yields `[]` (fail closed) rather than a wildcard.
 */
export function supabaseCspOrigins(
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL
): string[] {
  if (!supabaseUrl) return []

  try {
    const { protocol, host } = new URL(supabaseUrl)
    if (protocol !== 'https:' && protocol !== 'http:') return []
    if (!host) return []

    const websocketProtocol = protocol === 'https:' ? 'wss:' : 'ws:'
    return [`${protocol}//${host}`, `${websocketProtocol}//${host}`]
  } catch {
    return []
  }
}

/**
 * Origins the browser may `fetch()`/connect to.
 *
 * OCT #69 dropped `api.resend.com` and `secure.shippingapis.com`: both are
 * server-only integrations, so the *browser* never needs them — they were
 * widening `connect-src` for nothing.
 */
export function cspConnectOrigins(
  supabaseUrl?: string
): string[] {
  return [...supabaseCspOrigins(supabaseUrl), CSP_ANALYTICS_CONNECT_ORIGIN]
}

/** Per-request nonce: 32 hex characters, matching the previous implementation. */
export function generateCspNonce(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

/**
 * Builds the full policy for one request.
 *
 * `'unsafe-eval'` is required by Turbopack HMR, React DevTools and source-map
 * reconstruction in development only, so it stays behind `isProd()` — a static
 * policy would either break dev or weaken production permanently.
 */
export function buildCspHeader(nonce: string): string {
  const scriptSrc = [
    'script-src',
    "'self'",
    ...(isProd() ? [] : ["'unsafe-eval'"]),
    `'nonce-${nonce}'`,
    ...cspScriptOrigins(),
  ].join(' ')

  // OCT #69: the preview toolbar is a preview-only frame; production frames
  // nothing at all.
  const frameSrc = isPreviewDeployment()
    ? `frame-src ${CSP_VERCEL_LIVE_ORIGIN}`
    : "frame-src 'none'"

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' ${cspConnectOrigins().join(' ')}`,
    frameSrc,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // OCT #69: X-Frame-Options covers this today, but the CSP is the modern
    // control and survives a proxy that strips headers.
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ')
}

/**
 * Applies the policy, the nonce header and the nonce cookie to a response.
 *
 * Returns the same response instance so it can be used inline at a return site,
 * which keeps "forgot to decorate" from being an available mistake.
 */
export function applyCspToResponse<T extends NextResponse>(response: T, nonce: string): T {
  response.headers.set(CSP_HEADER, buildCspHeader(nonce))
  response.headers.set(CSP_NONCE_HEADER, nonce)
  response.cookies.set(CSP_NONCE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: 'strict',
    // OCT #69: preview deployments are https too, so `isProd()` alone left this
    // cookie without `Secure` there.
    secure: isHttpsDeployment(),
    path: '/',
    maxAge: CSP_NONCE_COOKIE_MAX_AGE_SECONDS,
  })
  return response
}
