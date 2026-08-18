import { NextResponse } from 'next/server'
import {
  ADMIN_COOKIE_NAME,
  createAdminSessionToken,
  extractMfaFlagFromToken,
  getAdminSessionMaxAgeSeconds,
  verifyAdminSessionToken,
} from '@/lib/admin/session'
import { extractAdminSessionToken, getExpectedAdminKey, hasValidAdminKey } from '@/lib/admin/auth'
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { isProd } from '@/lib/security/env'
import { validateCsrfOrigin, validateCsrfOriginLenient } from '@/lib/security/csrf'

interface SessionBody {

  key?: unknown
}

function asTrimmedString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

export async function GET(request: Request) {
  // SEC-023: Require same-origin check on the GET endpoint to prevent
  // cross-origin admin-cookie validity probing.
  if (!validateCsrfOrigin(request)) {
    return NextResponse.json({ error: 'Cross-origin request blocked.' }, { status: 403 })
  }

  let expectedKey: string
  try {
    expectedKey = getExpectedAdminKey()
  } catch {
    return NextResponse.json({ authenticated: false, error: 'ADMIN_LOGIN_KEY is missing.' }, { status: 500 })
  }

  const sessionToken = extractAdminSessionToken(request.headers.get('cookie'))

  // SEC-047: Use requireMfa=false for the GET status check — we just want to
  // know if the session is valid, not whether MFA is completed.
  const authenticated = await verifyAdminSessionToken(sessionToken, expectedKey, false)

  // SEC-047-FIX: Also return mfaVerified so client-side guards (e.g. the
  // deprecated AALGuard) can determine whether to redirect to the MFA
  // challenge page. The mfaFlag is extracted from the token without a DB
  // lookup — the signature was already verified above.
  const mfaVerified = authenticated && extractMfaFlagFromToken(sessionToken) === '1'

  return NextResponse.json({ authenticated, mfaVerified }, { status: 200 })
}

export async function POST(request: Request) {
  // SEC-047-FIX (permanent): Pre-authentication login endpoint. We still
  // enforce a *lenient* same-origin check — reject only requests whose
  // Origin/Referer is present AND cross-origin (the real login-CSRF signal),
  // tolerating same-origin fetch() that omits Origin. This restores the CSRF
  // protection that a blanket removal discarded, without re-breaking legit
  // same-origin logins. Brute force is gated by fail-closed rate limiting;
  // SameSite=Strict on the session cookie mitigates post-auth CSRF.
  if (!validateCsrfOriginLenient(request)) {
    return NextResponse.json({ error: 'Cross-origin request blocked.' }, { status: 403 })
  }

  let expectedKey: string

  try {
    expectedKey = getExpectedAdminKey()
  } catch {
    return NextResponse.json({ error: 'ADMIN_LOGIN_KEY is missing.' }, { status: 500 })
  }

  const ip = getClientIp(request)

  // When running outside Vercel, getClientIp returns 'unknown' for all
  // requests, which would make all local dev share the same rate-limit
  // bucket. Use the user-agent to differentiate sessions.
  const rateLimitKey =
    ip === 'unknown'
      ? `admin-login:unknown:${(request.headers.get('user-agent') ?? 'local').slice(0, 40)}`
      : `admin-login:${ip}`

  // Rate limit login attempts by IP
  const rl = await rateLimit(rateLimitKey, 5, 15 * 60 * 1000, { failClosed: true })
  if (!rl.allowed) {
    return rateLimitResponse(rl.retryAfter ?? 60)
  }

  // When running outside Vercel, add a global cap to prevent UA rotation from
  // bypassing the per-IP limit.
  if (ip === 'unknown') {
    const globalRl = await rateLimit('admin-login:non-vercel-global', 20, 15 * 60 * 1000, { failClosed: true })
    if (!globalRl.allowed) {
      return rateLimitResponse(globalRl.retryAfter ?? 60)
    }
  }

  const body = (await request.json().catch(() => ({}))) as SessionBody
  const provided = asTrimmedString(body.key, 256)

  if (!hasValidAdminKey(provided, expectedKey)) {
    return NextResponse.json({ error: 'Invalid admin key.' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true }, { status: 200 })
  const maxAge = await getAdminSessionMaxAgeSeconds()
  // SEC-047: New sessions are created with mfaVerified=false (default).
  // The user must complete MFA to get a token with mfaVerified=true.
  const sessionToken = await createAdminSessionToken(expectedKey, maxAge, {
    ipAddress: ip,
    userAgent: request.headers.get('user-agent') || undefined,
  })
  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: sessionToken,
    httpOnly: true,
    sameSite: 'strict', // SEC-020: strict, not lax
    secure: isProd(),   // SEC-019: shared isProd() helper
    path: '/',
    maxAge,
  })

  return response
}

export async function DELETE(request: Request) {
  // SEC-047-FIX (permanent): Logout is gated by the SameSite=Strict session
  // cookie, but we still apply a lenient same-origin check so a cross-site
  // logout-CSRF cannot clear the victim's session cookie via a cross-origin
  // response (SameSite governs *sending*, not *Set-Cookie*).
  if (!validateCsrfOriginLenient(request)) {
    return NextResponse.json({ error: 'Cross-origin request blocked.' }, { status: 403 })
  }

  const response = NextResponse.json({ ok: true }, { status: 200 })
  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: '',

    httpOnly: true,
    sameSite: 'strict', // SEC-020: strict, not lax
    secure: isProd(),   // SEC-019: shared isProd() helper
    path: '/',
    maxAge: 0,
  })
  return response
}
