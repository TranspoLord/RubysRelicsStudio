import { NextResponse } from 'next/server'
import {
  ADMIN_COOKIE_NAME,
  createAdminSessionToken,
  getAdminSessionMaxAgeSeconds,
  verifyAdminSessionToken,
} from '@/lib/admin/session'
import { extractAdminSessionToken, getExpectedAdminKey, hasValidAdminKey } from '@/lib/admin/auth'
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { isProd } from '@/lib/security/env'
import { validateCsrfOrigin } from '@/lib/security/csrf'

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
  return NextResponse.json({ authenticated }, { status: 200 })
}

export async function POST(request: Request) {
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

  // Allow more attempts during debugging — the admin key itself is the
  // primary auth protection.
  // TODO: lower before launch
  const rateLimitMax = 200

  // SEC-047: failClosed=false during development — if the DB is down,
  // allow the request through rather than locking the admin out.
  // TODO: set failClosed=true before launch
  const rl = await rateLimit(rateLimitKey, rateLimitMax, 15 * 60 * 1000, { failClosed: false })
  if (!rl.allowed) {
    return rateLimitResponse(rl.retryAfter ?? 60)
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

export async function DELETE() {
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