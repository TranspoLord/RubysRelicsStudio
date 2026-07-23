import { NextRequest, NextResponse } from 'next/server'
import { getEmailSenderAddress, getResend } from '@/lib/resend/client'
import { createMFACode } from '@/lib/admin/mfa-store'
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { getExpectedAdminKey } from '@/lib/admin/auth'
import { ADMIN_COOKIE_NAME, verifyAdminSessionToken } from '@/lib/admin/session'
import { isProd } from '@/lib/security/env'

export const runtime = 'nodejs'

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

    // When running outside Vercel, getClientIp returns 'unknown' for all
    // requests, which would make all local dev share the same rate-limit
    // bucket. Use the user-agent to differentiate sessions.
    const rateLimitKey =
      clientIp === 'unknown'
        ? `admin-mfa-send:unknown:${(request.headers.get('user-agent') ?? 'local').slice(0, 40)}`
        : `admin-mfa-send:${clientIp}`

    // Rate limit MFA send requests by IP to prevent email spam
    const rl = await rateLimit(rateLimitKey, MFA_RATE_LIMIT, MFA_RATE_WINDOW_MS, {
      failClosed: true,
    })

    // When running outside Vercel, add a global cap to prevent UA rotation from
    // bypassing the per-session limit.
    if (clientIp === 'unknown') {
      const globalRl = await rateLimit('admin-mfa-send:non-vercel-global', 10, MFA_RATE_WINDOW_MS, {
        failClosed: true,
      })
      if (!globalRl.allowed) {
        return NextResponse.json(
          { error: 'Too many requests. Please wait before trying again.' },
          { status: 429 }
        )
      }
    }

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

    // Resolve the sender address from storefront settings (with DB fallback)
    const fromAddress = await getEmailSenderAddress()

    // Send email via Resend
    const resend = getResend()

    try {
      await resend.emails.send({
        from: fromAddress,
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
      // Email failed — return an error so the admin knows to try again.
      // The risk of enumeration is minimal (the recipient address is the admin's own email).
      return NextResponse.json(
        { error: 'Failed to send verification code. Please try again.' },
        { status: 500 }
      )
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