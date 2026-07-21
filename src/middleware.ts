/**
 * Admin auth middleware (SEC-012) + CSP nonce generation (SEC-047).
 *
 * Blocks all /admin/* and /api/admin/* routes (except /admin/login and
 * /api/admin/session) unless a valid rr_admin_session cookie is present.
 * Per-route requireAdminApiSession() calls remain as defense-in-depth.
 *
 * SEC-047: Also generates a per-request CSP nonce for all routes and sets
 * the Content-Security-Policy header dynamically (replacing the static
 * placeholder in next.config.ts).
 *
 * NOTE: This runs in the Edge Runtime, so we use the Web Crypto API
 * (crypto.subtle) instead of node:crypto for HMAC verification.
 */

import { NextRequest, NextResponse } from 'next/server'

// SEC-047: Updated to v2 to match the new token format (5 parts with mfaFlag)
const SESSION_VERSION = 'v2'

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
 * SEC-047: Generate a per-request CSP nonce and build the CSP header.
 * The nonce is passed to the app via the x-nonce response header so
 * Server Components can include it in script tags.
 */
function buildCspHeader(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://vercel.live https://js.stripe.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://vitals.vercel-insights.com https://api.resend.com https://secure.shippingapis.com",
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; ')
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // SEC-047: Generate a per-request nonce for CSP
  const nonce = crypto.randomUUID().replace(/-/g, '')
  const csp = buildCspHeader(nonce)

  // Only apply admin auth to admin routes
  const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/api/admin')

  if (isAdminRoute) {
    // Allow login page and session-creation endpoint
    if (
      pathname === '/admin/login' ||
      pathname === '/api/admin/session' ||
      pathname === '/api/admin/send-mfa' ||
      pathname === '/api/admin/verify-mfa'
    ) {
      const response = NextResponse.next()
      response.headers.set('Content-Security-Policy', csp)
      response.headers.set('x-nonce', nonce)
      return response
    }

    // Check for valid admin session cookie
    const cookie = request.cookies.get('rr_admin_session')
    const adminKey = process.env.ADMIN_LOGIN_KEY

    if (!cookie || !adminKey || !(await verifyTokenEdge(cookie.value, adminKey))) {
      if (pathname.startsWith('/api/')) {
        const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        response.headers.set('Content-Security-Policy', csp)
        return response
      }
      const response = NextResponse.redirect(new URL('/admin/login', request.url))
      response.headers.set('Content-Security-Policy', csp)
      return response
    }
  }

  // SEC-047: Set CSP header on all responses
  const response = NextResponse.next()
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('x-nonce', nonce)
  return response
}

export const config = {
  // SEC-047: Apply to all routes so CSP nonce is set everywhere
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}