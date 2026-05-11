import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

import { ADMIN_COOKIE_NAME, verifyAdminSessionToken } from '@/lib/admin/session'
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit'

export interface AdminApiContext {
  adminKey: string
  clientIp: string
  sessionToken?: string
}

interface AdminRateLimitOptions {
  key: string
  maxRequests: number
  windowMs: number
}

export function extractAdminSessionToken(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) return undefined

  return cookieHeader
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${ADMIN_COOKIE_NAME}=`))
    ?.split('=')
    .slice(1)
    .join('=')
}

export function getExpectedAdminKey(): string {
  const adminKey = process.env.ADMIN_LOGIN_KEY
  if (!adminKey) {
    throw new Error('ADMIN_LOGIN_KEY must be set for admin operations.')
  }

  return adminKey
}

export function hasValidAdminKey(candidate: string, expectedKey: string): boolean {
  if (!candidate || candidate.length !== expectedKey.length) return false
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(expectedKey))
}

export async function requireAdminApiSession(
  request: Request,
  rateLimitOptions?: AdminRateLimitOptions
): Promise<{ ok: true; context: AdminApiContext } | { ok: false; response: Response }> {
  try {
    const adminKey = getExpectedAdminKey()
    const sessionToken = extractAdminSessionToken(request.headers.get('cookie'))

    if (!verifyAdminSessionToken(sessionToken, adminKey)) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 }),
      }
    }

    const clientIp = getClientIp(request)

    if (rateLimitOptions) {
      const result = rateLimit(
        `${rateLimitOptions.key}:${clientIp}`,
        rateLimitOptions.maxRequests,
        rateLimitOptions.windowMs
      )

      if (!result.allowed) {
        return {
          ok: false,
          response: rateLimitResponse(result.retryAfter ?? 60),
        }
      }
    }

    return {
      ok: true,
      context: {
        adminKey,
        clientIp,
        sessionToken,
      },
    }
  } catch (error) {
    console.error('[admin:auth]', error)
    return {
      ok: false,
      response: NextResponse.json({ error: 'Admin authentication is not configured.' }, { status: 500 }),
    }
  }
}

export async function requireAdminPageSessionOrRedirect(nextPath = '/admin') {
  const adminKey = getExpectedAdminKey()
  const cookieStore = await cookies()
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value

  if (!verifyAdminSessionToken(token, adminKey)) {
    redirect(`/admin/login?next=${encodeURIComponent(nextPath)}`)
  }

  return {
    adminKey,
    token,
  }
}