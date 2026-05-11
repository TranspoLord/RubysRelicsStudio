import { NextResponse } from 'next/server'
import {
  ADMIN_COOKIE_NAME,
  createAdminSessionToken,
  getAdminSessionMaxAgeSeconds,
  verifyAdminSessionToken,
} from '@/lib/admin/session'
import { extractAdminSessionToken, getExpectedAdminKey, hasValidAdminKey } from '@/lib/admin/auth'
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit'

interface SessionBody {
  key?: unknown
}

function asTrimmedString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

export async function GET(request: Request) {
  let expectedKey: string
  try {
    expectedKey = getExpectedAdminKey()
  } catch {
    return NextResponse.json({ authenticated: false, error: 'ADMIN_LOGIN_KEY is missing.' }, { status: 500 })
  }

  const sessionToken = extractAdminSessionToken(request.headers.get('cookie'))

  const authenticated = verifyAdminSessionToken(sessionToken, expectedKey)
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
  const rl = rateLimit(`admin-login:${ip}`, 8, 15 * 60 * 1000)
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
  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: createAdminSessionToken(expectedKey, maxAge),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
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
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
  return response
}
