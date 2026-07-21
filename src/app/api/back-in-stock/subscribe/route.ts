import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { sanitizeText, validateEmail } from '@/lib/validate'

interface SubscribeBody {
  productId?: unknown
  email?: unknown
  source?: unknown
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)

    const rlIp = await rateLimit(`bis-ip:${ip}`, 8, 10 * 60 * 1000)
    if (!rlIp.allowed) return rateLimitResponse(rlIp.retryAfter ?? 60)

    const body = (await request.json().catch(() => ({}))) as SubscribeBody
    const productId = sanitizeText(body.productId, 64)
    const email = validateEmail(body.email)
    const source = sanitizeText(body.source, 80) || 'product_page'

    if (!productId) {
      return NextResponse.json({ error: 'Product ID is required.' }, { status: 400 })
    }

    if (!email) {
      return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 })
    }

    const rlEmail = await rateLimit(`bis-email:${productId}:${email}`, 4, 24 * 60 * 60 * 1000)
    if (!rlEmail.allowed) {
      return NextResponse.json({ message: 'You are already subscribed for this product.' }, { status: 200 })
    }

    const supabase = getSupabaseAdmin()

    const { data: product, error: productError } = await supabase
      .from('exp_products')
      .select('id, is_active, is_archived')
      .eq('id', productId)
      .maybeSingle()

    if (productError || !product || !product.is_active || product.is_archived) {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 })
    }

    const now = new Date().toISOString()

    const { error: upsertError } = await supabase
      .from('exp_back_in_stock_alerts')
      .upsert(
        {
          product_id: productId,
          email,
          status: 'active',
          source,
          consent_ip: ip,
          consent_user_agent: request.headers.get('user-agent') || 'unknown',
          subscribed_at: now,
          notified_at: null,
          unsubscribed_at: null,
          updated_at: now,
        },
        { onConflict: 'product_id,email' }
      )

    if (upsertError) {
      console.error('[back-in-stock:subscribe]', upsertError.message)
      return NextResponse.json({ error: 'Failed to save subscription.' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Subscribed for back-in-stock alerts.' }, { status: 200 })
  } catch (error) {
    console.error('[back-in-stock:subscribe]', error)
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}
