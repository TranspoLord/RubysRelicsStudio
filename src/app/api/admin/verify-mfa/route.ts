import { NextRequest, NextResponse } from 'next/server'
import { verifyMFACode } from '@/lib/admin/mfa-store'
import { requireAdminApiSession } from '@/lib/admin/auth'

export async function POST(request: NextRequest) {
  try {
    // Require admin session - must have logged in with admin key first
    const sessionCheck = await requireAdminApiSession(request)
    if (!sessionCheck.ok) {
      return sessionCheck.response
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
      console.log('[MFA Verify] No challenge token found in cookies')
      return NextResponse.json({ error: 'No active verification session. Please request a new code.' }, { status: 400 })
    }

    // Log for debugging (helps diagnose Vercel issues)
    console.log('[MFA Verify] Challenge token prefix:', challengeToken.slice(0, 8) + '...')

    // Code format validation
    if (!code || code.length !== 6) {
      return NextResponse.json({ error: 'Invalid verification code format' }, { status: 400 })
    }

    const isValid = await verifyMFACode(challengeToken, code, deviceFingerprint)

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid or expired verification code' }, { status: 401 })
    }

    // Set session cookie - MFA verified
    const response = NextResponse.json({ success: true })
    response.cookies.set('admin_mfa_verified', 'true', {
      httpOnly: true,
      secure: process.env.NEXT_PUBLIC_APP_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 8, // 8 hours
      path: '/',
    })

    // Clear the challenge token cookie since it's been consumed
    response.cookies.set('admin_mfa_challenge', '', {
      httpOnly: true,
      secure: process.env.NEXT_PUBLIC_APP_ENV === 'production',
      sameSite: 'strict',
      maxAge: 0,
      path: '/',
    })

    return response
  } catch (error: any) {
    console.error('[MFA Verify] Error:', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}