/**
 * Admin auth gate (SEC-012, SEPT_IMPLEMENTATION_PLAN §10.5) + CSP nonce
 * generation (SEC-047).
 *
 * /admin/* and /api/admin/* require a Supabase Auth session whose verified JWT
 * carries `app_metadata.role === 'admin'`. The sign-in entry points listed in
 * ADMIN_AUTH_EXEMPT_PATHS are the only exceptions. Per-route
 * requireAdminApiSession() / requireAdminPageSessionOrRedirect() calls remain
 * the revocation authority, because this file runs on the Edge Runtime and
 * cannot query Postgres.
 *
 * The bespoke HMAC `rr_admin_session` verifier and its MFA-flag branch were
 * removed here as part of the Google-OAuth switch. That also retires the
 * 2026-09-17 bug class (UI_AUDIT.md §15.10) in which the Edge verifier derived
 * a different key from the signer and *no* login could reach the panel: there is
 * no longer a second signing implementation to keep in sync.
 *
 * SEC-047: Also generates a per-request CSP nonce for all routes and sets
 * the Content-Security-Policy header dynamically (replacing the static
 * placeholder in next.config.ts).
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  decideAdminEdgeAccess,
  isAdminAuthExemptPath,
  type AdminEdgeDecision,
} from '@/lib/admin/edge-gate'
import { CSRF_COOKIE_NAME } from '@/lib/security/csrf'
import { isProd } from '@/lib/security/env'
import { refreshSupabaseSession, updateSupabaseSession } from '@/lib/supabase/update-session'

function ensureCsrfCookie(request: NextRequest, response: NextResponse): NextResponse {
  const existing = request.cookies.get(CSRF_COOKIE_NAME)?.value
  if (!existing || existing.length < 16) {
    response.cookies.set({
      name: CSRF_COOKIE_NAME,
      value: crypto.randomUUID().replace(/-/g, ''),
      httpOnly: false,
      sameSite: 'strict',
      secure: isProd(),
      path: '/',
      maxAge: 60 * 60 * 24 * 14, // 14 days
    })
  }
  return response
}

// The bespoke `verifyTokenEdge()` HMAC verifier lived here (80 lines of
// Web-Crypto HKDF + HMAC). It was deleted in §10.5: the panel's credential is
// now the Supabase session cookie, verified through `refreshSupabaseSession()`
// below, and the claim decision lives in src/lib/admin/edge-gate.ts where it is
// unit-tested.

/**
 * SEC-047-FIX: The nonce is generated here in middleware and set as both
 * a response header (x-nonce) AND as a response cookie (rrs_csp_nonce) so
 * the root layout can reliably read it via cookies(). The x-nonce header
 * approach works in most Next.js versions but cookies() is more portable.
 *
 * SEC-047: Generate a per-request CSP nonce and build the CSP header.
 * The nonce is passed to the app via the x-nonce response header so
 * Server Components can include it in script tags.
 *
 * NOTE: 'unsafe-eval' is required for Next.js in development
 * (Turbopack HMR, React DevTools, source-map reconstruction, etc.).
 * Production builds do not require it; it is omitted in production
 * to harden the CSP.
 */
function buildCspHeader(nonce: string): string {
  const scriptSrc = isProd()
    ? `script-src 'self' 'nonce-${nonce}' https://vercel.live`
    : `script-src 'self' 'unsafe-eval' 'nonce-${nonce}' https://vercel.live`
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vitals.vercel-insights.com https://api.resend.com https://secure.shippingapis.com",
    "frame-src https://vercel.live",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; ')
}

// SEC-047-FIX: Cookie name for CSP nonce, readable by the root layout
const CSP_NONCE_COOKIE = 'rrs_csp_nonce'

/**
 * Applies the CSP header, the nonce (response header + cookie) and the CSRF
 * cookie to an admin-branch response.
 *
 * Every branch writes the same decorations, so the SEC-047 nonce contract holds
 * for allow, deny and exempt responses alike — a missing nonce presents exactly
 * like an unhydrated page, which is the failure mode §7.1 warns about.
 */
function decorateAdminResponse(
  request: NextRequest,
  response: NextResponse,
  csp: string,
  nonce: string
): NextResponse {
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('x-nonce', nonce)
  response.cookies.set(CSP_NONCE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProd(),
    path: '/',
    maxAge: 60, // short-lived, matches request lifecycle
  })
  return ensureCsrfCookie(request, response)
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // SEC-047: Generate a per-request nonce for CSP
  const nonce = crypto.randomUUID().replace(/-/g, '')
  const csp = buildCspHeader(nonce)

  // Only apply admin auth to admin routes
  const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/api/admin')

  if (isAdminRoute) {
    // SEC-047-FIX: sign-in entry points stay reachable without an admin claim
    // (ADMIN_AUTH_EXEMPT_PATHS). The Google OAuth round trip itself lands on
    // /auth/callback, which is not under /admin and never reaches this branch.
    if (isAdminAuthExemptPath(pathname)) {
      return decorateAdminResponse(request, NextResponse.next(), csp, nonce)
    }

    // §10.5: the panel is reachable only with a Supabase session whose verified
    // JWT carries `app_metadata.role === 'admin'`. This claim check is an
    // Edge-safe optimisation — the DB re-check in src/lib/admin/auth.ts stays
    // the revocation authority. The same refresh the storefront uses runs here
    // too, otherwise a panel-only session could never rotate its access token
    // and would be signed out every hour.
    let decision: AdminEdgeDecision = 'redirect-login'

    try {
      const { claims, response } = await refreshSupabaseSession(request)
      decision = decideAdminEdgeAccess(claims, pathname)

      if (decision === 'allow') {
        // Carry the rotated Supabase cookies out on this same response.
        return decorateAdminResponse(request, response, csp, nonce)
      }
    } catch (error) {
      // Fail closed: an unreachable Auth service must not admit anyone.
      console.error('[admin:edge-gate]', error)
    }

    const denied =
      decision === 'unauthorized-api'
        ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        : NextResponse.redirect(new URL('/admin/login', request.url))

    return decorateAdminResponse(request, denied, csp, nonce)
  }

  // SUPABASE-AUTH: Rotate the Supabase session cookies for storefront routes.
  // Server Components cannot write cookies, so without this an expiring access
  // token could never be refreshed. Returns null when Supabase is not
  // configured; authorization is always decided per-request server side, so a
  // skipped refresh only affects session convenience, never security.
  const response = (await updateSupabaseSession(request)) ?? NextResponse.next()

  // SEC-047: Set CSP header on all responses (non-admin)
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('x-nonce', nonce)
  response.cookies.set(CSP_NONCE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProd(),
    path: '/',
    maxAge: 60,
  })
  return response
}

export const config = {
  // SEC-047: Apply to all routes so CSP nonce is set everywhere
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

export { CSP_NONCE_COOKIE }
