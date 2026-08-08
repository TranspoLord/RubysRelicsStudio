import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { sanitizeText, validateEmail } from '@/lib/validate'
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { requireCsrfOriginOnly } from '@/lib/security/csrf'

export async function GET(_request?: Request) {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_future_products')
      .select('id, title, description, estimated_release, category_key, status, media_url, media_alt, is_visible, sort_order')
      .eq('is_visible', true)
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('[future-products:get]', error.message)
      return NextResponse.json({ products: [] })
    }

    const products = ((data ?? []) as Array<Record<string, unknown>>)
      .slice()
      .sort((left, right) => {
        const leftOrder = Number(left.sort_order ?? 0)
        const rightOrder = Number(right.sort_order ?? 0)
        if (leftOrder !== rightOrder) return leftOrder - rightOrder
        const leftRelease = String(left.estimated_release ?? '')
        const rightRelease = String(right.estimated_release ?? '')
        return leftRelease.localeCompare(rightRelease)
      })

    return NextResponse.json({
      products: products.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        estimatedRelease: row.estimated_release,
        categoryKey: row.category_key,
        status: row.status,
        mediaUrl: row.media_url,
        mediaAlt: row.media_alt,
        isVisible: row.is_visible,
        sortOrder: row.sort_order,
      })),
    })
  } catch (error) {
    console.error('[future-products:get]', error)
    return NextResponse.json({ products: [] })
  }
}

export async function POST(request: Request) {
  try {
    const csrfResponse = requireCsrfOriginOnly(request)
    if (csrfResponse) return csrfResponse

    const ip = getClientIp(request)
    const rl = await rateLimit(`future-products-interest:${ip}`, 5, 60 * 60 * 1000, { failClosed: true })
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter ?? 60)

    const body = await request.json().catch(() => ({}))
    const email = validateEmail(body?.email)
    const name = sanitizeText(body?.name, 80)
    const idea = sanitizeText(body?.idea, 500)
    const comments = sanitizeText(body?.comments, 1000)

    if (!email) {
      return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const now = new Date().toISOString()
    const userAgent = request.headers.get('user-agent') || 'unknown'

    const { error } = await supabase.from('exp_newsletter_subscribers').upsert(
      {
        email,
        name: name || null,
        source: 'future_products_interest',
        subscribed: true,
        subscribed_at: now,
        unsubscribed_at: null,
        consent_ip: ip,
        consent_user_agent: userAgent,
        interest_details: {
          idea,
          comments,
          submitted_at: now,
        },
        response_status: 'new',
        updated_at: now,
      },
      { onConflict: 'email' }
    )

    if (error) {
      console.error('[future-products-interest]', error.message)
      return NextResponse.json({ error: 'Failed to save interest.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[future-products-interest]', error)
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 })
  }
}
