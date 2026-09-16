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
 * Validate the Origin/Referer headers on a state-changing request.
 * Returns true if the request is same-origin, false otherwise.
 *
 * SEC-047: Uses exact origin comparison instead of startsWith to prevent
 * subdomain bypass (e.g., evil.example.com matching example.com).
 */
export function validateCsrfOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  const allowedOrigin = normalizeOrigin(
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'http://localhost:3000'
  )

  // At least one of Origin/Referer must be present
  if (!origin && !referer) return false

  // SEC-047: Exact origin comparison prevents subdomain bypass
  if (origin && normalizeOrigin(origin) !== allowedOrigin) return false
  if (referer && normalizeOrigin(referer) !== allowedOrigin) return false

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

  const allowedOrigin = normalizeOrigin(
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'http://localhost:3000'
  )

  // Modern browsers send Sec-Fetch-Site on cross-site requests even when
  // Origin/Referer are suppressed. Reject cross-site explicitly.
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false

  // If neither Origin, Referer, nor Sec-Fetch-Site is present, treat the
  // request as an opaque/embedded client and reject it.
  if (!origin && !referer && !fetchSite) return false

  // Present Origin/Referer headers must match the allowed origin exactly.
  if (origin && normalizeOrigin(origin) !== allowedOrigin) return false
  if (referer && normalizeOrigin(referer) !== allowedOrigin) return false
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