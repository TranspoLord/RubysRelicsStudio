/**
 * Admin auth middleware (SEC-012) + CSP nonce generation (SEC-047).
 *
 * Blocks all /admin/* and /api/admin/* routes (except /admin/login,
 * /admin/mfa-challenge, and /api/admin/* auth endpoints) unless a valid
 * rr_admin_session cookie is present. Per-route requireAdminApiSession()
 * calls remain as defense-in-depth.
 *
 * SEC-047: Also generates a per-request CSP nonce for all routes and sets
 * the Content-Security-Policy header dynamically (replacing the static
 * placeholder in next.config.ts).
 *
 * NOTE: This runs in the Edge Runtime, so we use the Web Crypto API
 * (crypto.subtle) instead of node:crypto for HMAC verification.
 */

import { NextRequest, NextResponse } from 'next/server'
import { CSRF_COOKIE_NAME } from '@/lib/security/csrf'
import { isProd } from '@/lib/security/env'

// SEC-047: Updated to v2 to match the new token format (5 parts with mfaFlag)
const SESSION_VERSION = 'v2'

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

/**
 * Edge-compatible HMAC-SHA256 verification using the Web Crypto API.
 * Returns true if the token's signature matches the expected HMAC.
 * SEC-047: Updated for v2 token format (version.exp.jti.mfaFlag.sig).
 */
async function verifyTokenEdge(
  token: string,
  adminKey: string
): Promise<boolean> {
  if (!token || !adminKey) return false

  const parts = token.split('.')
  if (parts.length !== 5) return false // v2: version.exp.jti.mfaFlag.sig

  const [version, expRaw, jti, mfaFlag, signature] = parts
  if (version !== SESSION_VERSION) return false

  const exp = Number.parseInt(expRaw, 10)
  if (!Number.isFinite(exp)) return false
  if (exp < Math.floor(Date.now() / 1000)) return false

  // Verify HMAC signature using Web Crypto API
  const payload = `${version}.${exp}.${jti}.${mfaFlag}`
  const encoder = new TextEncoder()

  try {
    const keyData = encoder.encode(adminKey)
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )

    const expectedSig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
    const expectedHex = Array.from(new Uint8Array(expectedSig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    // Timing-safe comparison
    if (signature.length !== expectedHex.length) return false
    let result = 0
    for (let i = 0; i < signature.length; i++) {
      result |= signature.charCodeAt(i) ^ expectedHex.charCodeAt(i)
    }
    return result === 0
  } catch {
    return false
  }
}

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
 * NOTE: 'unsafe-eval' is required for Next.js in both dev and production
 * (Turbopack HMR, React DevTools, source-map reconstruction, etc.).
 * Without it, React controlled inputs may not update the DOM value,
 * causing MUI labels to never float up.
 */
function buildCspHeader(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-eval' 'nonce-${nonce}' https://vercel.live https://js.stripe.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://vitals.vercel-insights.com https://api.resend.com https://secure.shippingapis.com",
    "frame-src https://js.stripe.com https://hooks.stripe.com https://vercel.live",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; ')
}

// SEC-047-FIX: Cookie name for CSP nonce, readable by the root layout
const CSP_NONCE_COOKIE = 'rrs_csp_nonce'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // SEC-047: Generate a per-request nonce for CSP
  const nonce = crypto.randomUUID().replace(/-/g, '')
  const csp = buildCspHeader(nonce)

  // Only apply admin auth to admin routes
  const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/api/admin')

  if (isAdminRoute) {
    // SEC-047-FIX: Allow MFA challenge page (uses a pre-MFA session token)
    // Allow login page, MFA challenge page, and auth API endpoints
    const isAuthEndpoint =
      pathname === '/admin/login' ||
      pathname === '/admin/mfa-challenge' ||
      pathname === '/api/admin/session' ||
      pathname === '/api/admin/send-mfa' ||
      pathname === '/api/admin/verify-mfa'

    if (isAuthEndpoint) {
      const response = NextResponse.next()
      response.headers.set('Content-Security-Policy', csp)
      response.headers.set('x-nonce', nonce)
      // SEC-047-FIX: Also set nonce as a cookie so the root layout can read it
      // via cookies() — more reliable than relying on headers() seeing the
      // response header set by middleware.
      response.cookies.set(CSP_NONCE_COOKIE, nonce, {
        httpOnly: true,
        sameSite: 'strict',
        secure: isProd(),
        path: '/',
        maxAge: 60, // short-lived, matches request lifecycle
      })
      return ensureCsrfCookie(request, response)
    }

    // Check for valid admin session cookie
    const cookie = request.cookies.get('rr_admin_session')
    const adminKey = process.env.ADMIN_LOGIN_KEY

    if (!cookie || !adminKey || !(await verifyTokenEdge(cookie.value, adminKey))) {
      if (pathname.startsWith('/api/')) {
        const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        response.headers.set('Content-Security-Policy', csp)
        response.cookies.set(CSP_NONCE_COOKIE, nonce, {
          httpOnly: true,
          sameSite: 'strict',
          secure: isProd(),
          path: '/',
          maxAge: 60,
        })
        return ensureCsrfCookie(request, response)
      }
      const response = NextResponse.redirect(new URL('/admin/login', request.url))
      response.headers.set('Content-Security-Policy', csp)
      response.cookies.set(CSP_NONCE_COOKIE, nonce, {
        httpOnly: true,
        sameSite: 'strict',
        secure: isProd(),
        path: '/',
        maxAge: 60,
      })
      return ensureCsrfCookie(request, response)
    }

    // Ensure CSRF cookie exists for authenticated admin pages/API usage.
    const response = NextResponse.next()
    response.headers.set('Content-Security-Policy', csp)
    response.headers.set('x-nonce', nonce)
    response.cookies.set(CSP_NONCE_COOKIE, nonce, {
      httpOnly: true,
      sameSite: 'strict',
      secure: isProd(),
      path: '/',
      maxAge: 60,
    })
    return ensureCsrfCookie(request, response)
  }

  // SEC-047: Set CSP header on all responses (non-admin)
  const response = NextResponse.next()
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
