/**
 * Content-Security-Policy construction (SEC-047; SEPT_IMPLEMENTATION_PLAN §7.1/§7.6).
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

import { isProd } from '@/lib/security/env'

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
 * Script origins the app legitimately boots from, besides its own bundle.
 *
 * - `https://vercel.live` — the preview toolbar (preview deployments only).
 * - `https://va.vercel-scripts.com` — the `@vercel/analytics` loader. Both the
 *   production loader and the dev `script.debug.js` are served from this origin,
 *   so one entry covers dev and prod (§7.1's dev/prod parity requirement).
 */
export const CSP_SCRIPT_ORIGINS = [
  'https://vercel.live',
  'https://va.vercel-scripts.com',
] as const

/**
 * Origins the browser may `fetch()`/connect to. `vitals.vercel-insights.com` is
 * the analytics beacon — allowlisting the loader origin without this one would
 * load the script and then drop every event, so the two are asserted together in
 * `csp.test.ts`.
 */
export const CSP_CONNECT_ORIGINS = [
  'https://*.supabase.co',
  'wss://*.supabase.co',
  'https://vitals.vercel-insights.com',
  'https://api.resend.com',
  'https://secure.shippingapis.com',
] as const

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
    ...CSP_SCRIPT_ORIGINS,
  ].join(' ')

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' ${CSP_CONNECT_ORIGINS.join(' ')}`,
    'frame-src https://vercel.live',
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
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
    secure: isProd(),
    path: '/',
    maxAge: CSP_NONCE_COOKIE_MAX_AGE_SECONDS,
  })
  return response
}
