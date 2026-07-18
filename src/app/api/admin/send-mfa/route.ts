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

    // Generate and store the code
    const code = createMFACode(ip)

    // Send email via Resend
    const resend = getResend()
    let emailSent = false

    try {
      const result = await resend.emails.send({
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
      emailSent = true
      console.log('[MFA Send] Email sent successfully to', adminMfaEmail)
    } catch (emailError) {
      console.error('[MFA Send] Email send failed:', emailError)
      // In development, log the code so it can still be used for testing
      if (process.env.NEXT_PUBLIC_APP_ENV === 'development') {
        console.log('[MFA Send] ⚠️ DEV MODE — MFA code for IP', ip, 'is:', code)
      }
    }

    // Return success - don't reveal if email was actually sent (prevents enumeration)
    // In development, include the code for testing convenience
    const response: Record<string, unknown> = { success: true, message: 'Verification code sent' }
    
    if (process.env.NEXT_PUBLIC_APP_ENV === 'development' && !emailSent) {
      response.devCode = code
      response.devWarning = 'Email send failed. Using dev fallback code above.'
    }

    return NextResponse.json(response)
  } catch (error: any) {
    console.error('[MFA Send] Error:', error)
    return NextResponse.json({ error: 'Failed to send verification code' }, { status: 500 })
  }
}