import { NextResponse } from 'next/server'
import { requestPasswordReset } from '@/lib/auth/customer'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { Resend } from 'resend'
import { rateLimit, rateLimitResponse, getClientIp } from '@/lib/rate-limit'
import { validateEmail, safeHtmlEscape } from '@/lib/validate'
import { getFromAddress } from '@/lib/storefront-settings'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    const rlIp = rateLimit(`forgot-pw-ip:${ip}`, 5, 15 * 60 * 1000)
    if (!rlIp.allowed) return rateLimitResponse(rlIp.retryAfter!)

    const body = await request.json()
    const { email } = body

    const validEmail = validateEmail(email)
    if (!validEmail) {
      // Return generic response — don't reveal whether email is valid
      return NextResponse.json(
        { message: 'If an account exists with that email, you will receive a password reset link shortly.' },
        { status: 200 }
      )
    }

    // Per-email rate limit (prevents targeting a specific inbox)
    const rlEmail = rateLimit(`forgot-pw-email:${validEmail}`, 3, 10 * 60 * 1000)
    if (!rlEmail.allowed) {
      // Still return generic success to avoid leaking info
      return NextResponse.json(
        { message: 'If an account exists with that email, you will receive a password reset link shortly.' },
        { status: 200 }
      )
    }

    // Request password reset (generates token)
    const { error } = await requestPasswordReset(validEmail)

    if (error) {
      // Log the error but return generic success to avoid email enumeration
      console.error('[forgot-password]', error)
    } else {
      // Fetch the reset token from database
      const supabase = getSupabaseAdmin()
      const { data: resetRecord, error: fetchError } = await supabase
        .from('exp_password_reset_tokens')
        .select('token, customer_id')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!fetchError && resetRecord?.token) {
        // Build reset link
        const resetLink = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/reset-password/${resetRecord.token}`

        // Send email via Resend
        try {
          const fromAddress = await getFromAddress()
          await resend.emails.send({
            from: fromAddress,
            to: validEmail,
            subject: 'Reset Your Password - Ruby\'s Relics Studio',
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Password Reset Request</h2>
                <p>We received a request to reset your password. Click the link below to create a new password:</p>
                <p><a href="${resetLink}" style="background-color: #8B4513; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a></p>
                <p>Or copy and paste this link into your browser:</p>
                <p><code>${safeHtmlEscape(resetLink)}</code></p>
                <p style="color: #666; font-size: 12px;">This link will expire in 24 hours.</p>
                <p style="color: #666; font-size: 12px;">If you didn't request this, you can safely ignore this email.</p>
              </div>
            `,
          })
        } catch (emailError) {
          console.error('[forgot-password] Failed to send email:', emailError)
          // Continue anyway - token is created in database
        }
      }
    }

    // Always return success to avoid email enumeration
    return NextResponse.json(
      { message: 'If an account exists with that email, you will receive a password reset link shortly.' },
      { status: 200 }
    )
  } catch (error) {
    console.error('[forgot-password]', error)
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}
