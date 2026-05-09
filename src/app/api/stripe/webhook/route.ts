import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { branch, getSupabaseAdmin } from '@/lib/supabase/client'
import { getStripeServerClient } from '@/lib/stripe/server'
import { FROM_ADDRESS, getResend } from '@/lib/resend/client'

const DEFAULT_GUEST_TRACKING_ENABLED = true
const DEFAULT_GUEST_TRACKING_NOTIFY_EMAIL = 'orders@rubysrelics.com'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function getGuestOrderTrackingConfig() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('exp_storefront_settings')
    .select('setting_value')
    .eq('setting_key', 'guest_order_tracking')
    .single()

  if (error && error.code !== 'PGRST116') {
    console.error('[stripe:webhook:settings]', error.message)
  }

  const enabled =
    typeof data?.setting_value?.enabled === 'boolean'
      ? data.setting_value.enabled
      : DEFAULT_GUEST_TRACKING_ENABLED

  const notifyEmail =
    typeof data?.setting_value?.notify_email === 'string' && data.setting_value.notify_email.trim().length > 3
      ? data.setting_value.notify_email.trim()
      : process.env.ORDER_TRACKING_NOTIFY_EMAIL ?? DEFAULT_GUEST_TRACKING_NOTIFY_EMAIL

  return {
    enabled,
    notifyEmail,
  }
}

async function sendTrackingFallbackEmail(input: {
  orderId: string
  sessionId: string
  paymentIntentId: string | null
  customerEmail: string | null
  notifyEmail: string
}) {
  if (!process.env.RESEND_API_KEY) return

  const resend = getResend()
  await resend.emails.send({
    from: FROM_ADDRESS,
    to: [input.notifyEmail],
    subject: `Manual tracking needed for order ${input.orderId.slice(0, 8)}`,
    html: `
      <h2>Guest Order Tracking Disabled</h2>
      <p>This paid order needs manual tracking communication.</p>
      <p><strong>Order ID:</strong> ${escapeHtml(input.orderId)}</p>
      <p><strong>Stripe Session:</strong> ${escapeHtml(input.sessionId)}</p>
      <p><strong>Payment Intent:</strong> ${escapeHtml(input.paymentIntentId ?? 'n/a')}</p>
      <p><strong>Customer Email:</strong> ${escapeHtml(input.customerEmail ?? 'unknown')}</p>
    `,
  })
}

export async function POST(request: Request) {
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

    if (!webhookSecret) {
      console.error('[stripe:webhook] Missing STRIPE_WEBHOOK_SECRET')
      return NextResponse.json({ error: 'Webhook secret not configured.' }, { status: 500 })
    }

    const signature = request.headers.get('stripe-signature')
    if (!signature) {
      return NextResponse.json({ error: 'Missing Stripe signature header.' }, { status: 400 })
    }

    const rawBody = await request.text()
    const stripe = getStripeServerClient()

    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
    } catch (error) {
      console.error('[stripe:webhook] Signature verification failed', error)
      return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const orderId = typeof session.metadata?.order_id === 'string' ? session.metadata.order_id : null
      const metadataCustomRequestId =
        typeof session.metadata?.custom_request_id === 'string'
          ? session.metadata.custom_request_id
          : null
      const paymentIntentId =
        typeof session.payment_intent === 'string' ? session.payment_intent : null
      const paymentLinkId =
        typeof session.payment_link === 'string' ? session.payment_link : null

      if (orderId) {
        const { error } = await supabase
          .from('exp_orders')
          .update({
            payment_status: 'paid',
            status: 'paid',
            paid_at: new Date().toISOString(),
            stripe_session_id: session.id,
            stripe_payment_intent_id: paymentIntentId,
            stripe_payment_link_id: paymentLinkId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', orderId)

        if (error) {
          console.error('[stripe:webhook] Order update failed', error.message)
          return NextResponse.json({ error: 'Failed to update order status.' }, { status: 500 })
        }

        const trackingConfig = await getGuestOrderTrackingConfig()
        if (!trackingConfig.enabled) {
          try {
            await sendTrackingFallbackEmail({
              orderId,
              sessionId: session.id,
              paymentIntentId,
              customerEmail:
                typeof session.customer_details?.email === 'string'
                  ? session.customer_details.email
                  : null,
              notifyEmail: trackingConfig.notifyEmail,
            })
          } catch (mailError) {
            console.error('[stripe:webhook:tracking-fallback-email]', mailError)
          }
        }
      } else {
        let customRequestId = metadataCustomRequestId

        if (!customRequestId && paymentLinkId) {
          const { data: customRequestByLink, error: customRequestByLinkError } = await supabase
            .from('exp_custom_requests')
            .select('id')
            .eq('stripe_payment_link_id', paymentLinkId)
            .single()

          if (customRequestByLinkError && customRequestByLinkError.code !== 'PGRST116') {
            console.error('[stripe:webhook] Custom request lookup by payment link failed', customRequestByLinkError.message)
          }

          customRequestId = customRequestByLink?.id ?? null
        }

        if (!customRequestId) {
          console.error('[stripe:webhook] Missing metadata.order_id or custom-request correlation on checkout.session.completed')
          return NextResponse.json({ received: true }, { status: 200 })
        }

        const { data: customRequest, error: customRequestError } = await supabase
          .from('exp_custom_requests')
          .select('id, quote_amount')
          .eq('id', customRequestId)
          .single()

        if (customRequestError || !customRequest) {
          console.error('[stripe:webhook] Missing custom request for payment link flow', customRequestError?.message)
        } else {
          const quotedTotal = Number(customRequest.quote_amount ?? 0)

          const { error: upsertError } = await supabase
            .from('exp_orders')
            .upsert(
              {
                order_path: 'custom',
                payment_mode: 'stripe_payment_link',
                payment_status: 'paid',
                status: 'paid',
                custom_request_id: customRequest.id,
                stripe_session_id: session.id,
                stripe_payment_link_id: paymentLinkId,
                stripe_payment_intent_id: paymentIntentId,
                production_estimate_band: 'To be confirmed',
                subtotal: quotedTotal,
                discount_amount: 0,
                shipping_cost: 0,
                order_total: quotedTotal,
                shipping_method: 'standard',
                shipping_address: {},
                cart_snapshot: {
                  source: 'custom_request_payment_link',
                  custom_request_id: customRequest.id,
                },
                paid_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                branch,
              },
              { onConflict: 'stripe_session_id' }
            )

          if (upsertError) {
            console.error('[stripe:webhook] Custom order upsert failed', upsertError.message)
          }

          const { error: requestUpdateError } = await supabase
            .from('exp_custom_requests')
            .update({
              status: 'paid',
              updated_at: new Date().toISOString(),
            })
            .eq('id', customRequest.id)

          if (requestUpdateError) {
            console.error('[stripe:webhook] Custom request paid update failed', requestUpdateError.message)
          }
        }
      }
    }

    if (event.type === 'checkout.session.async_payment_failed') {
      const session = event.data.object as Stripe.Checkout.Session
      const orderId = typeof session.metadata?.order_id === 'string' ? session.metadata.order_id : null

      if (orderId) {
        const { error } = await supabase
          .from('exp_orders')
          .update({
            payment_status: 'failed',
            status: 'awaiting_payment',
            updated_at: new Date().toISOString(),
          })
          .eq('id', orderId)

        if (error) {
          console.error('[stripe:webhook] Async payment failed update failed', error.message)
        }
      }
    }

    if (event.type === 'checkout.session.expired') {
      const session = event.data.object as Stripe.Checkout.Session
      const orderId = typeof session.metadata?.order_id === 'string' ? session.metadata.order_id : null

      if (orderId) {
        const { error } = await supabase
          .from('exp_orders')
          .update({
            payment_status: 'failed',
            status: 'cancelled',
            updated_at: new Date().toISOString(),
          })
          .eq('id', orderId)

        if (error) {
          console.error('[stripe:webhook] Expired update failed', error.message)
        }
      }
    }

    if (event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent
      const paymentIntentId = paymentIntent.id

      const { error } = await supabase
        .from('exp_orders')
        .update({
          payment_status: 'failed',
          status: 'awaiting_payment',
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_payment_intent_id', paymentIntentId)

      if (error) {
        console.error('[stripe:webhook] payment_intent failed update error', error.message)
      }
    }

    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge
      const paymentIntentId =
        typeof charge.payment_intent === 'string' ? charge.payment_intent : null

      if (paymentIntentId) {
        const { error } = await supabase
          .from('exp_orders')
          .update({
            payment_status: 'refunded',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_payment_intent_id', paymentIntentId)

        if (error) {
          console.error('[stripe:webhook] charge refunded update error', error.message)
        }
      }
    }

    return NextResponse.json({ received: true }, { status: 200 })
  } catch (error) {
    console.error('[stripe:webhook]', error)
    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 500 })
  }
}
