/**
 * CSRF protection helpers (SEC-014).
 *
 * Defence in depth — two layers:
 *
 * Layer 1 — Origin/Referer header validation
 *   Reject any state-changing request whose Origin or Referer header does not
 *   match the deployed application origin. This blocks classic cross-site
 *   form POSTs.
 *
 * Layer 2 — Double-submit cookie
 *   A random CSRF token is set as a non-httpOnly cookie on page load. The
 *   client must echo the same value back in an `X-CSRF-Token` header on every
 *   state-changing request. The server compares the cookie value to the
 *   header value. This blocks same-site subdomain attacks that Origin
 *   validation alone cannot stop.
 *
 * Webhooks are exempt — they authenticate via signature verification instead.
 */

import { NextResponse } from 'next/server'

const CSRF_COOKIE_NAME = 'rrs_csrf'
const CSRF_HEADER_NAME = 'x-csrf-token'

/**
 * SEC-047: Normalize a URL to its origin (protocol://host:port).
 * Returns empty string if the URL is invalid.
 */
function normalizeOrigin(url: string): string {
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.host}`
  } catch {
    return ''
  }
}

/**
 * Derive the expected origin from the request's own host. On Vercel/Next this
 * reflects the real routed host (via forwarded headers), so it works across
 * preview/custom domains and local dev without a configured public URL.
 */
function requestOrigin(request: Request): string {
  return normalizeOrigin(request.url)
}

/**
 * Validate the Origin/Referer headers on a state-changing request.
 * Returns true if the request is same-origin, false otherwise.
 *
 * SEC-047: Exact origin comparison (against the request's own host) is used
 * instead of startsWith to prevent subdomain bypass (e.g. evil.example.com
 * matching example.com).
 */
export function validateCsrfOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  const expected = requestOrigin(request)

  // At least one of Origin/Referer must be present
  if (!origin && !referer) return false

  // Present Origin/Referer must match the request's own origin exactly.
  if (expected && origin && normalizeOrigin(origin) !== expected) return false
  if (expected && referer && normalizeOrigin(referer) !== expected) return false

  return true
}

/**
 * Lenient same-origin check for pre-authentication mutation endpoints (e.g.
 * login/logout at /api/admin/session).
 *
 * Unlike `validateCsrfOrigin`, this returns `true` when the request omits
 * both Origin and Referer — many same-origin `fetch()` calls (and some edge
 * runtimes) omit the Origin header. It still rejects any request whose
 * Origin/Referer *is* present and cross-origin, which is the actual CSRF
 * signal. This is the origin-only pattern recommended by
 * docs/PENTEST_CSRF_PLAYBOOK.md §2.4 for pre-auth mutation routes.
 *
 * SEC-BATCH1-H3: Hardened with Sec-Fetch-Site so a cross-site attacker that
 * strips Origin/Referer (e.g. via referrer-policy) is still rejected.
 */
export function validateCsrfOriginLenient(request: Request): boolean {
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  const fetchSite = request.headers.get('sec-fetch-site')

  // Reject explicit cross-site / same-site requests. Sec-Fetch-Site is set by
  // the browser and cannot be forged by cross-origin JavaScript.
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false

  // A browser-reported same-origin result is authoritative and needs no
  // configured origin, so accept it directly.
  if (fetchSite === 'same-origin') return true

  // No usable Sec-Fetch-Site (older browsers / opaque clients). Reject only if
  // every signal is absent, then compare Origin/Referer to the request's host.
  if (!origin && !referer && !fetchSite) return false

  const expected = requestOrigin(request)
  if (expected && origin && normalizeOrigin(origin) !== expected) return false
  if (expected && referer && normalizeOrigin(referer) !== expected) return false
  return true
}

/**
 * SEC-BATCH1-H3: Combined CSRF check for pre-authentication mutation endpoints.
 * Enforces the lenient origin check plus the double-submit token. Login/logout
 * are state-changing and must carry the CSRF cookie echoed in X-CSRF-Token.
 */
export function requireCsrfLenient(request: Request): NextResponse | null {
  if (!validateCsrfOriginLenient(request)) {
    return NextResponse.json(
      { error: 'Cross-origin request blocked.' },
      { status: 403 }
    )
  }
  if (!validateCsrfToken(request)) {
    return NextResponse.json(
      { error: 'CSRF token missing or invalid.' },
      { status: 403 }
    )
  }
  return null
}

/**
 * Validate the double-submit CSRF token.

 * Compares the CSRF cookie value to the X-CSRF-Token header value.
 * Returns true if both are present and equal.
 */
export function validateCsrfToken(request: Request): boolean {
  const cookieHeader = request.headers.get('cookie') ?? ''
  const cookieValue = cookieHeader
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${CSRF_COOKIE_NAME}=`))
    ?.split('=')
    .slice(1)
    .join('=')

  const headerValue = request.headers.get(CSRF_HEADER_NAME)

  if (!cookieValue || !headerValue) return false
  if (cookieValue.length !== headerValue.length) return false

  // Constant-time comparison
  let result = 0
  for (let i = 0; i < cookieValue.length; i++) {
    result |= cookieValue.charCodeAt(i) ^ headerValue.charCodeAt(i)
  }
  return result === 0
}

/**
 * Combined CSRF check for state-changing API routes.
 * Returns a 403 NextResponse if the request fails CSRF validation,
 * or null if the request passes.
 *
 * Webhook routes MUST NOT use this — they use signature verification.
 */
export function requireCsrf(request: Request): NextResponse | null {
  if (!validateCsrfOrigin(request)) {
    return NextResponse.json(
      { error: 'Cross-origin request blocked.' },
      { status: 403 }
    )
  }
  if (!validateCsrfToken(request)) {
    return NextResponse.json(
      { error: 'CSRF token missing or invalid.' },
      { status: 403 }
    )
  }
  return null
}

/**
 * Origin-only CSRF check for public mutation endpoints that do not rely on
 * cookie auth but should still reject cross-site submissions.
 */
export function requireCsrfOriginOnly(request: Request): NextResponse | null {
  if (!validateCsrfOrigin(request)) {
    return NextResponse.json(
      { error: 'Cross-origin request blocked.' },
      { status: 403 }
    )
  }
  return null
}

export { CSRF_COOKIE_NAME, CSRF_HEADER_NAME }