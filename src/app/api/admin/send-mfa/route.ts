import { NextRequest, NextResponse } from 'next/server'
import { getResend } from '@/lib/resend/client'
import { createMFACode } from '@/lib/admin/mfa-store'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import { getExpectedAdminKey } from '@/lib/admin/auth'
import { ADMIN_COOKIE_NAME, verifyAdminSessionToken } from '@/lib/admin/session'
import { isProd } from '@/lib/security/env'

// Rate limit: 3 send requests per 10 minutes per session
const MFA_RATE_LIMIT = 3
const MFA_RATE_WINDOW_MS = 10 * 60 * 1000

export async function POST(request: NextRequest) {
  try {
    // SEC-047: Verify the admin session WITHOUT MFA requirement.
    // The user is requesting an MFA code, so they have a valid session
    // but haven't verified MFA yet (mfaFlag='0').
    const adminKey = getExpectedAdminKey()
    const sessionToken = request.headers
      .get('cookie')
      ?.split(';')
      .map((e) => e.trim())
      .find((e) => e.startsWith(`${ADMIN_COOKIE_NAME}=`))
      ?.split('=')
      .slice(1)
      .join('=')

    if (!(await verifyAdminSessionToken(sessionToken, adminKey, false))) {
      return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 })
    }

    const clientIp = getClientIp(request)

    // Rate limit by IP to prevent abuse (but verification uses challenge token, not IP)
    // SEC-047: failClosed=true so brute-force is blocked if the DB is down
    const rl = await rateLimit(`admin-mfa-send:${clientIp}`, MFA_RATE_LIMIT, MFA_RATE_WINDOW_MS, {
      failClosed: true,
    })

    if (!rl.allowed) {
      const retryAfter = rl.retryAfter ?? 600
      return NextResponse.json(
        { error: `Too many requests. Please wait ${retryAfter} seconds before trying again.` },
        { status: 429 }
      )
    }

    const adminMfaEmail = process.env.ADMIN_MFA_EMAIL

    if (!adminMfaEmail) {
      console.error('[MFA Send] ADMIN_MFA_EMAIL not configured')
      return NextResponse.json({ error: 'MFA not configured' }, { status: 500 })
    }

    // Read optional device fingerprint from request body
    const body = await request.json().catch(() => ({}))
    const deviceFingerprint = typeof body.deviceFingerprint === 'string' ? body.deviceFingerprint : undefined

    // Generate and store the code in Supabase — returns a challenge token
    const { code, challengeToken } = await createMFACode(deviceFingerprint)

    // Send email via Resend
    const resend = getResend()

    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL!,
        to: [adminMfaEmail],
        subject: "Your Ruby's Relics Admin Login Code",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Admin Login Verification</h2>
            <p>Your verification code is:</p>
            <div style="background: #f3f3f3; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #c9a96e;">${code}</span>
            </div>
            <p>This code will expire in <strong>10 minutes</strong>.</p>
            <p style="color: #666; font-size: 14px;">If you did not request this code, please ignore this email.</p>
          </div>
        `,
      })
      console.log('[MFA Send] Email sent successfully to', adminMfaEmail)
    } catch (emailError) {
      console.error('[MFA Send] Email send failed:', emailError)
      // Don't reveal email errors to client (prevents enumeration)
    }

    // Set the challenge token as an httpOnly cookie
    const response = NextResponse.json({ success: true, message: 'Verification code sent' })
    response.cookies.set('admin_mfa_challenge', challengeToken, {
      httpOnly: true,
      secure: isProd(), // SEC-019: shared isProd() helper
      sameSite: 'strict',
      maxAge: 10 * 60, // 10 minutes (matches code expiry)
      path: '/',
    })

    return response
  } catch (error: any) {
    console.error('[MFA Send] Error:', error)
    return NextResponse.json({ error: 'Failed to send verification code' }, { status: 500 })
  }
}