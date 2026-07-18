import { NextRequest, NextResponse } from 'next/server'
import { getResend } from '@/lib/resend/client'
import { createMFACode } from '@/lib/admin/mfa-store'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { requireAdminApiSession } from '@/lib/admin/auth'

// Rate limit: 3 send requests per 10 minutes per IP
const MFA_RATE_LIMIT = 3
const MFA_RATE_WINDOW_MS = 10 * 60 * 1000

export async function POST(request: NextRequest) {
  try {
    // Require admin session - must have logged in with admin key first
    const sessionCheck = await requireAdminApiSession(request)
    if (!sessionCheck.ok) {
      return sessionCheck.response
    }

    const { clientIp } = sessionCheck.context
    const ip = clientIp

    const rl = rateLimit(`admin-mfa-send:${ip}`, MFA_RATE_LIMIT, MFA_RATE_WINDOW_MS)

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

    // Generate and store the code in Supabase
    const code = await createMFACode(ip)

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

    // Return success - don't reveal if email was actually sent (prevents enumeration)
    return NextResponse.json({ success: true, message: 'Verification code sent' })
  } catch (error: any) {
    console.error('[MFA Send] Error:', error)
    return NextResponse.json({ error: 'Failed to send verification code' }, { status: 500 })
  }
}