import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { sanitizeText, validateEmail } from '@/lib/validate'

interface SubscribeBody {
  email?: unknown
  source?: unknown
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)

    const rlIp = await rateLimit(`newsletter-ip:${ip}`, 5, 10 * 60 * 1000)
    if (!rlIp.allowed) return rateLimitResponse(rlIp.retryAfter ?? 60)

    const body = (await request.json().catch(() => ({}))) as SubscribeBody
    const email = validateEmail(body.email)
    const source = sanitizeText(body.source, 80) || 'homepage'

    if (!email) {
      return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 })
    }

    const rlEmail = await rateLimit(`newsletter-email:${email}`, 3, 24 * 60 * 60 * 1000)
    if (!rlEmail.allowed) {
      return NextResponse.json({ message: 'You are already subscribed. Check your inbox for updates soon.' }, { status: 200 })
    }

    const supabase = getSupabaseAdmin()

    // SEC-016: Do not silently re-subscribe an email that was unsubscribed
    // within the last 30 days. Require explicit confirmation instead.
    const { data: existing } = await supabase
      .from('exp_newsletter_subscribers')
      .select('unsubscribed_at')
      .eq('email', email)
      .maybeSingle()

    if (existing?.unsubscribed_at) {
      const daysSinceUnsub =
        (Date.now() - new Date(existing.unsubscribed_at).getTime()) / 86_400_000
      if (daysSinceUnsub < 30) {
        // Send a confirmation email instead of auto-resubscribing.
        // (Email send is handled by the newsletter confirmation flow; here we
        // simply decline to re-subscribe silently.)
        return NextResponse.json(
          { message: 'Please check your email to confirm re-subscription.' },
          { status: 200 }
        )
      }
    }

    const now = new Date().toISOString()
    const userAgent = request.headers.get('user-agent') || 'unknown'

    const { error: newsletterError } = await supabase
      .from('exp_newsletter_subscribers')
      .upsert(
        {
          email,
          source,
          subscribed: true,
          subscribed_at: now,
          unsubscribed_at: null,
          consent_ip: ip,
          consent_user_agent: userAgent,
          updated_at: now,
        },
        { onConflict: 'email' }
      )

    if (newsletterError) {
      console.error('[newsletter-subscribe]', newsletterError.message)
      return NextResponse.json({ error: 'Failed to process subscription.' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Subscribed successfully.' }, { status: 200 })
  } catch (error) {
    console.error('[newsletter-subscribe]', error)
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}
