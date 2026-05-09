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

    const rlIp = rateLimit(`newsletter-ip:${ip}`, 5, 10 * 60 * 1000)
    if (!rlIp.allowed) return rateLimitResponse(rlIp.retryAfter ?? 60)

    const body = (await request.json().catch(() => ({}))) as SubscribeBody
    const email = validateEmail(body.email)
    const source = sanitizeText(body.source, 80) || 'homepage'

    if (!email) {
      return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 })
    }

    const rlEmail = rateLimit(`newsletter-email:${email}`, 3, 24 * 60 * 60 * 1000)
    if (!rlEmail.allowed) {
      return NextResponse.json({ message: 'You are already subscribed. Check your inbox for updates soon.' }, { status: 200 })
    }

    const supabase = getSupabaseAdmin()

    const { data: customer } = await supabase
      .from('exp_customers')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    const now = new Date().toISOString()
    const userAgent = request.headers.get('user-agent') || 'unknown'

    const { error: newsletterError } = await supabase
      .from('exp_newsletter_subscribers')
      .upsert(
        {
          email,
          customer_id: customer?.id ?? null,
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

    if (customer?.id) {
      const { error: customerError } = await supabase
        .from('exp_customers')
        .update({
          receives_newsletter: true,
          newsletter_consent_at: now,
          newsletter_consent_ip: ip,
          updated_at: now,
        })
        .eq('id', customer.id)

      if (customerError) {
        console.error('[newsletter-subscribe:customer-update]', customerError.message)
      }
    }

    return NextResponse.json({ message: 'Subscribed successfully.' }, { status: 200 })
  } catch (error) {
    console.error('[newsletter-subscribe]', error)
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}
