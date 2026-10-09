/**
 * Admin auth gate (SEC-012, docs/archive/SEPT_IMPLEMENTATION_PLAN §10.5) + CSP nonce
 * generation (SEC-047).
 *
 * Next 16 deprecated the `middleware` file convention in favour of `proxy`
 * (§7.6): the file is renamed and the handler is exported as `proxy`, which is
 * the only export name Next's validator accepts here. One behavioural side
 * effect is worth knowing: a proxy runs on the **Node.js** runtime by default
 * instead of the Edge runtime. Everything used below (Web Crypto, `fetch`,
 * `@supabase/ssr`) is runtime-agnostic, and authorization is still decided per
 * request server side, so the security posture is unchanged.
 *
 * /admin/* and /api/admin/* require a Supabase Auth session whose verified JWT
 * carries `app_metadata.role === 'admin'`. The sign-in entry points listed in
 * ADMIN_AUTH_EXEMPT_PATHS are the only exceptions. Per-route
 * requireAdminApiSession() / requireAdminPageSessionOrRedirect() calls remain
 * the revocation authority, because this file runs on requests only and cannot
 * query Postgres.
 *
 * The bespoke HMAC `rr_admin_session` verifier and its MFA-flag branch were
 * removed here as part of the Google-OAuth switch. That also retires the
 * 2026-09-17 bug class (UI_AUDIT.md §15.10) in which the Edge verifier derived
 * a different key from the signer and *no* login could reach the panel: there is
 * no longer a second signing implementation to keep in sync.
 *
 * SEC-047: Also generates a per-request CSP nonce for all routes and sets the
 * Content-Security-Policy header dynamically (replacing the static placeholder
 * in next.config.ts). The policy itself lives in `src/lib/security/csp.ts`,
 * where it is unit-tested — §7.1 was a *missing script origin*, a defect no
 * type-check could catch.
 */

import { NextRequest, NextResponse } from 'next/server'

import {
  decideAdminEdgeAccess,
  isAdminAuthExemptPath,
  type AdminEdgeDecision,
} from '@/lib/admin/edge-gate'
import { CSP_NONCE_COOKIE, applyCspToResponse, generateCspNonce } from '@/lib/security/csp'
import { CSRF_COOKIE_NAME } from '@/lib/security/csrf'
import { isProd } from '@/lib/security/env'
import { safeLogError } from '@/lib/security/logger'
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

// SEC-047-FIX: The nonce is generated here and applied through
// `applyCspToResponse()`, which writes the Content-Security-Policy header, the
// `x-nonce` response header the root layout reads via `headers()`, and the
// `rrs_csp_nonce` cookie fallback the layout reads via `cookies()` — all from one
// value. Keeping them in a single tested function is deliberate (§7.6): a
// policy/header/cookie mismatch presents exactly like an unhydrated page, and the
// old inline copy here is how the analytics origin went missing in §7.1.
//
// NOTE: 'unsafe-eval' is required for Next.js in development (Turbopack HMR,
// React DevTools, source-map reconstruction). Production omits it — the branch
// lives in buildCspHeader().

/**
 * Applies the CSP header, the nonce (response header + cookie) and the CSRF
 * cookie to an admin-branch response.
 *
 * Every branch writes the same decorations, so the SEC-047 nonce contract holds
 * for allow, deny and exempt responses alike.
 */
function decorateAdminResponse(
  request: NextRequest,
  response: NextResponse,
  nonce: string
): NextResponse {
  return ensureCsrfCookie(request, applyCspToResponse(response, nonce))
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // SEC-047: Generate a per-request nonce for CSP
  const nonce = generateCspNonce()

  // Only apply admin auth to admin routes
  const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/api/admin')

  if (isAdminRoute) {
    // SEC-047-FIX: sign-in entry points stay reachable without an admin claim
    // (ADMIN_AUTH_EXEMPT_PATHS). The Google OAuth round trip itself lands on
    // /auth/callback, which is not under /admin and never reaches this branch.
    if (isAdminAuthExemptPath(pathname)) {
      return decorateAdminResponse(request, NextResponse.next(), nonce)
    }

    // §10.5: the panel is reachable only with a Supabase session whose verified
    // JWT carries `app_metadata.role === 'admin'`. This claim check is the cheap
    // pre-filter — it needs no database round trip — while the DB re-check in
    // src/lib/admin/auth.ts stays the revocation authority. The same refresh the
    // storefront uses runs here too, otherwise a panel-only session could never
    // rotate its access token and would be signed out every hour.
    let decision: AdminEdgeDecision = 'redirect-login'

    try {
      const { claims, response } = await refreshSupabaseSession(request)
      decision = decideAdminEdgeAccess(claims, pathname)

      if (decision === 'allow') {
        // Carry the rotated Supabase cookies out on this same response.
        return decorateAdminResponse(request, response, nonce)
      }
    } catch (error) {
      // Fail closed: an unreachable Auth service must not admit anyone. Fail in
      // the *shape* the caller expects as well — an unverifiable session has to
      // answer /api/admin/* with 401 exactly like any other denial, or an API
      // client sees a 307 with no body (§10.5's contract; see
      // OCT_IMPLEMENTATION_PLAN.md → OCT-1).
      safeLogError('[admin:edge-gate]', error)
      decision = decideAdminEdgeAccess(null, pathname)
    }

    const denied =
      decision === 'unauthorized-api'
        ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        : NextResponse.redirect(new URL('/admin/login', request.url))

    return decorateAdminResponse(request, denied, nonce)
  }

  // SUPABASE-AUTH: Rotate the Supabase session cookies for storefront routes.
  // Server Components cannot write cookies, so without this an expiring access
  // token could never be refreshed. Returns null when Supabase is not
  // configured; authorization is always decided per-request server side, so a
  // skipped refresh only affects session convenience, never security.
  const response = (await updateSupabaseSession(request)) ?? NextResponse.next()

  // SEC-047: Set the CSP header, the nonce header and the nonce cookie on every
  // non-admin response.
  return applyCspToResponse(response, nonce)
}

export const config = {
  // SEC-047: Apply to all routes so CSP nonce is set everywhere
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

export { CSP_NONCE_COOKIE }
