import { NextResponse } from 'next/server'
import {
  ADMIN_COOKIE_NAME,
  createAdminSessionToken,
  getAdminSessionMaxAgeSeconds,
  verifyAdminSessionToken,
} from '@/lib/admin/session'
import { timingSafeEqual } from 'node:crypto'

interface SessionBody {
  key?: unknown
}

function asTrimmedString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

export async function GET(request: Request) {
  const expectedKey = process.env.ADMIN_LOGIN_KEY
  if (!expectedKey) {
    return NextResponse.json({ authenticated: false, error: 'ADMIN_LOGIN_KEY is missing.' }, { status: 500 })
  }

  const cookieHeader = request.headers.get('cookie') ?? ''
  const sessionToken = cookieHeader
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${ADMIN_COOKIE_NAME}=`))
    ?.split('=')
    .slice(1)
    .join('=')

  const authenticated = verifyAdminSessionToken(sessionToken, expectedKey)
  return NextResponse.json({ authenticated }, { status: 200 })
}

export async function POST(request: Request) {
  const expectedKey = process.env.ADMIN_LOGIN_KEY

  if (!expectedKey) {
    return NextResponse.json({ error: 'ADMIN_LOGIN_KEY is missing.' }, { status: 500 })
  }

  const body = (await request.json().catch(() => ({}))) as SessionBody
  const provided = asTrimmedString(body.key, 256)

  if (!provided || provided.length !== expectedKey.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(expectedKey))) {
    return NextResponse.json({ error: 'Invalid admin key.' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true }, { status: 200 })
  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: createAdminSessionToken(expectedKey),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: getAdminSessionMaxAgeSeconds(),
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
