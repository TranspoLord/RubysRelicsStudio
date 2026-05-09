import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { FROM_ADDRESS, getResend } from '@/lib/resend/client'
import { getStripeServerClient } from '@/lib/stripe/server'
import { timingSafeEqual } from 'node:crypto'

interface RequestContext {
  params: Promise<{ id: string }>
}

interface QuoteActionBody {
  action?: unknown
  quoteAmount?: unknown
  note?: unknown
}

function asString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

function asMoney(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100) / 100
}

function parseAdminKey(request: Request): string {
  const auth = request.headers.get('authorization')
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim()
  }
  return request.headers.get('x-admin-key')?.trim() ?? ''
}

async function sendQuoteEmail(input: {
  customerEmail: string
  itemType: string
  requestId: string
  quoteAmount: number
  paymentLinkUrl: string
  statusUrl: string
  note: string | null
}) {
  if (!process.env.RESEND_API_KEY) return

  const resend = getResend()
  await resend.emails.send({
    from: FROM_ADDRESS,
    to: [input.customerEmail],
    subject: `Your custom quote is ready (${input.requestId.slice(0, 8)})`,
    html: `
      <h2>Your Quote Is Ready</h2>
      <p><strong>Request ID:</strong> ${input.requestId}</p>
      <p><strong>Item type:</strong> ${input.itemType}</p>
      <p><strong>Quoted total:</strong> $${input.quoteAmount.toFixed(2)}</p>
      <p>
        <a href="${input.paymentLinkUrl}">Pay securely via Stripe</a>
      </p>
      <p>
        Track your request status: <a href="${input.statusUrl}">${input.statusUrl}</a>
      </p>
      ${input.note ? `<p><strong>Note from the studio:</strong> ${input.note}</p>` : ''}
    `,
  })
}

export async function GET(request: Request, context: RequestContext) {
  try {
    const params = await context.params
    const requestId = asString(params.id, 64)
    const accessToken = asString(new URL(request.url).searchParams.get('access'), 200)

    if (!requestId || !accessToken) {
      return NextResponse.json({ error: 'Missing request access token.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_custom_requests')
      .select('id, status, item_type, quantity, description, quote_amount, stripe_payment_link_url, admin_notes, created_at, updated_at, customer_access_expires_at')
      .eq('id', requestId)
      .eq('customer_access_token', accessToken)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Request status link is invalid.' }, { status: 404 })
    }

    if (data.customer_access_expires_at) {
      const expiresAt = new Date(data.customer_access_expires_at)
      if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
        return NextResponse.json({ error: 'Request status link has expired.' }, { status: 410 })
      }
    }

    return NextResponse.json({ request: data }, { status: 200 })
  } catch (error) {
    console.error('[custom-orders:id:get]', error)
    return NextResponse.json({ error: 'Could not load request status.' }, { status: 500 })
  }
}

export async function PATCH(request: Request, context: RequestContext) {
  try {
    const adminKey = parseAdminKey(request)
    const expectedAdminKey = process.env.ADMIN_LOGIN_KEY

    if (!expectedAdminKey) {
      return NextResponse.json({ error: 'ADMIN_LOGIN_KEY is not configured.' }, { status: 500 })
    }

    if (!adminKey || adminKey.length !== expectedAdminKey.length || !timingSafeEqual(Buffer.from(adminKey), Buffer.from(expectedAdminKey))) {
      return NextResponse.json({ error: 'Unauthorized admin action.' }, { status: 401 })
    }

    const params = await context.params
    const requestId = asString(params.id, 64)
    const body = (await request.json()) as QuoteActionBody
    const action = asString(body.action, 40)

    if (!requestId || !action) {
      return NextResponse.json({ error: 'Missing request id or action.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { data: requestRow, error: requestError } = await supabase
      .from('exp_custom_requests')
      .select('id, status, customer_email, item_type, customer_access_token')
      .eq('id', requestId)
      .single()

    if (requestError || !requestRow) {
      return NextResponse.json({ error: 'Custom request was not found.' }, { status: 404 })
    }

    if (action === 'send_quote') {
      const quoteAmount = asMoney(body.quoteAmount)
      const note = asString(body.note, 2000) || null

      if (!quoteAmount) {
        return NextResponse.json({ error: 'Quote amount must be greater than zero.' }, { status: 400 })
      }

      const stripe = getStripeServerClient()
      const stripePrice = await stripe.prices.create({
        currency: 'usd',
        unit_amount: Math.round(quoteAmount * 100),
        product_data: {
          name: `Custom Quote: ${requestRow.item_type}`,
        },
      })

      const paymentLink = await stripe.paymentLinks.create({
        line_items: [
          {
            price: stripePrice.id,
            quantity: 1,
          },
        ],
        metadata: {
          source: 'expansion_custom_quote',
          custom_request_id: requestRow.id,
        },
      })

      const { data: updated, error: updateError } = await supabase
        .from('exp_custom_requests')
        .update({
          status: 'quote_sent',
          quote_amount: quoteAmount,
          stripe_payment_link_id: paymentLink.id,
          stripe_payment_link_url: paymentLink.url,
          admin_notes: note,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestRow.id)
        .select('id, status, quote_amount, stripe_payment_link_url, updated_at')
        .single()

      if (updateError || !updated) {
        console.error('[custom-orders:id:send-quote:update]', updateError?.message)
        return NextResponse.json({ error: 'Could not save quote details.' }, { status: 500 })
      }

      const origin = new URL(request.url).origin
      const statusUrl = requestRow.customer_access_token
        ? `${origin}/custom-orders/${requestRow.id}?access=${encodeURIComponent(requestRow.customer_access_token)}`
        : `${origin}/custom-orders`

      try {
        await sendQuoteEmail({
          customerEmail: requestRow.customer_email,
          itemType: requestRow.item_type,
          requestId: requestRow.id,
          quoteAmount,
          paymentLinkUrl: paymentLink.url,
          statusUrl,
          note,
        })
      } catch (mailError) {
        console.error('[custom-orders:id:send-quote:email]', mailError)
      }

      return NextResponse.json({ request: updated }, { status: 200 })
    }

    if (action === 'mark_rejected') {
      const note = asString(body.note, 2000) || 'Request rejected by admin review.'

      const { data: updated, error: updateError } = await supabase
        .from('exp_custom_requests')
        .update({
          status: 'cancelled',
          admin_notes: note,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestRow.id)
        .select('id, status, admin_notes, updated_at')
        .single()

      if (updateError || !updated) {
        console.error('[custom-orders:id:mark-rejected:update]', updateError?.message)
        return NextResponse.json({ error: 'Could not update request status.' }, { status: 500 })
      }

      return NextResponse.json({ request: updated }, { status: 200 })
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 })
  } catch (error) {
    console.error('[custom-orders:id:patch]', error)
    return NextResponse.json({ error: 'Could not process admin action.' }, { status: 500 })
  }
}
