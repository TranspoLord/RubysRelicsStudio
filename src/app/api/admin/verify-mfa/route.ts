import { NextRequest, NextResponse } from 'next/server'
import { verifyMFACode, invalidateChallengeToken } from '@/lib/admin/mfa-store'
import { getExpectedAdminKey } from '@/lib/admin/auth'
import {
  ADMIN_COOKIE_NAME,
  createAdminSessionToken,
  getAdminSessionMaxAgeSeconds,
  verifyAdminSessionToken,
} from '@/lib/admin/session'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import { isProd } from '@/lib/security/env'
import { safeLogError } from '@/lib/security/logger'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    // Require admin session - must have logged in with admin key first.
    // SEC-047: We verify the token WITHOUT MFA requirement here because the
    // user is about to verify their MFA code. The token must be valid (correct
    // HMAC, not expired, not revoked) but mfaFlag can be '0'.
    const adminKey = getExpectedAdminKey()
    const sessionToken = request.headers
      .get('cookie')
      ?.split(';')
      .map((e) => e.trim())
      .find((e) => e.startsWith(`${ADMIN_COOKIE_NAME}=`))
      ?.split('=')
      .slice(1)
      .join('=')

    // Verify the session token WITHOUT MFA requirement (the user is about to verify MFA)
    if (!(await verifyAdminSessionToken(sessionToken, adminKey, false))) {
      return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { code } = body
    const deviceFingerprint = typeof body.deviceFingerprint === 'string' ? body.deviceFingerprint : undefined

    // Read challenge token from httpOnly cookie (set during send-mfa)
    const cookieHeader = request.headers.get('cookie') ?? ''
    const challengeToken = cookieHeader
      .split(';')
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith('admin_mfa_challenge='))
      ?.split('=')
      .slice(1)
      .join('=')

    if (!challengeToken) {
      return NextResponse.json(
        { error: 'No active verification session. Please request a new code.' },
        { status: 400 }
      )
    }

    // SEC-006: Rate limit by challenge token (not IP) — 5 attempts per 5 minutes
    // SEC-047: failClosed=true so brute-force is blocked if the DB is down
    const rl = await rateLimit(`admin-mfa-verify:${challengeToken}`, 5, 5 * 60 * 1000, {
      failClosed: true,
    })
    if (!rl.allowed) {
      // SEC-006: After 5 failed attempts, invalidate the challenge token
      await invalidateChallengeToken(challengeToken)
      return NextResponse.json(
        { error: 'Too many attempts. Request a new code.' },
        { status: 429 }
      )
    }

    // Code format validation
    if (!code || code.length !== 6) {
      return NextResponse.json({ error: 'Invalid verification code format' }, { status: 400 })
    }

    const isValid = await verifyMFACode(challengeToken, code, deviceFingerprint)

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid or expired verification code' }, { status: 401 })
    }

    // SEC-047: Re-issue the session token with mfaVerified=true.
    // This cryptographically binds the MFA-verified state to the session,
    // replacing the old client-forgeable admin_mfa_verified cookie.
    const maxAge = await getAdminSessionMaxAgeSeconds()
    const newToken = await createAdminSessionToken(adminKey, maxAge, {
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') || undefined,
      mfaVerified: true,
    })

    const response = NextResponse.json({ success: true })
    response.cookies.set({
      name: ADMIN_COOKIE_NAME,
      value: newToken,
      httpOnly: true,
      sameSite: 'strict',
      secure: isProd(),
      path: '/',
      maxAge,
    })

    // Clear the challenge token cookie since it's been consumed
    response.cookies.set('admin_mfa_challenge', '', {
      httpOnly: true,
      secure: isProd(),
      sameSite: 'strict',
      maxAge: 0,
      path: '/',
    })

    return response
  } catch (error: any) {
    safeLogError('[MFA Verify]', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}