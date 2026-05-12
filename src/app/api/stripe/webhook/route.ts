import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { branch, getSupabaseAdmin } from '@/lib/supabase/client'
import { getStripeServerClient } from '@/lib/stripe/server'
import { processBackInStockAlerts } from '@/lib/back-in-stock'
import { processCheckoutAbandonmentRecovery } from '@/lib/abandoned-cart'
import { getEmailSenderAddress, getResend } from '@/lib/resend/client'
import { getGuestOrderTrackingSettings } from '@/lib/storefront-settings'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function getGuestOrderTrackingConfig() {
  const settings = await getGuestOrderTrackingSettings()

  return {
    enabled: settings.enabled,
    notifyEmail: settings.notify_email,
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
  const fromAddress = await getEmailSenderAddress()
  await resend.emails.send({
    from: fromAddress,
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

async function releaseOrderInventory(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  orderId: string,
  note: string
) {
  const { data, error } = await supabase.rpc('exp_release_order_inventory', {
    p_order_id: orderId,
    p_note: note,
  })

  if (error) {
    console.error('[stripe:webhook:inventory-release]', error.message)
    return
  }

  if (!data || typeof data !== 'object') return

  const payload = data as Record<string, unknown>
  if (payload.ok !== true) {
    console.error('[stripe:webhook:inventory-release]', payload)
  }
}

async function processBackInStockForOrder(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  orderId: string
) {
  const { data, error } = await supabase
    .from('exp_order_items')
    .select('product_id')
    .eq('order_id', orderId)

  if (error) {
    console.error('[stripe:webhook:back-in-stock:order-items]', error.message)
    return
  }

  const productIds = Array.from(
    new Set(
      (data ?? [])
        .map((row) => (typeof row.product_id === 'string' ? row.product_id : null))
        .filter((value): value is string => value !== null)
    )
  )

  if (productIds.length === 0) return

  try {
    await processBackInStockAlerts({ productIds, limit: 250 })
  } catch (error) {
    console.error('[stripe:webhook:back-in-stock:process]', error)
  }
}

function asPromoSnapshot(
  value: unknown
): { promoCode: string | null; appliedDealIds: string[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { promoCode: null, appliedDealIds: [] }
  }

  const root = value as Record<string, unknown>
  const promotions =
    root.promotions && typeof root.promotions === 'object' && !Array.isArray(root.promotions)
      ? (root.promotions as Record<string, unknown>)
      : null

  if (!promotions) {
    return { promoCode: null, appliedDealIds: [] }
  }

  const promoCode =
    typeof promotions.promoCode === 'string' && promotions.promoCode.trim().length > 0
      ? promotions.promoCode.trim().toUpperCase()
      : null

  const appliedDealIds = Array.isArray(promotions.appliedDeals)
    ? promotions.appliedDeals
        .map((entry) => {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
          const id = (entry as Record<string, unknown>).id
          return typeof id === 'string' && id.trim().length > 0 ? id.trim() : null
        })
        .filter((id): id is string => id !== null)
    : []

  return { promoCode, appliedDealIds: Array.from(new Set(appliedDealIds)) }
}

async function incrementPromotionUsageForOrder(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  orderId: string,
  cartSnapshot: unknown
) {
  const promoSnapshot = asPromoSnapshot(cartSnapshot)

  if (promoSnapshot.promoCode) {
    const { data: promoRow, error: promoLoadError } = await supabase
      .from('exp_promo_codes')
      .select('id, usage_count')
      .eq('code', promoSnapshot.promoCode)
      .maybeSingle()

    if (promoLoadError) {
      console.error('[stripe:webhook:promo-usage:load]', promoLoadError.message)
    } else if (promoRow?.id) {
      const { error: promoUpdateError } = await supabase
        .from('exp_promo_codes')
        .update({ usage_count: Number(promoRow.usage_count ?? 0) + 1 })
        .eq('id', promoRow.id)

      if (promoUpdateError) {
        console.error('[stripe:webhook:promo-usage:update]', promoUpdateError.message)
      }

      const { error: discountCodeUpdateError } = await supabase
        .from('exp_orders')
        .update({ discount_code_id: promoRow.id, updated_at: new Date().toISOString() })
        .eq('id', orderId)

      if (discountCodeUpdateError) {
        console.error('[stripe:webhook:order-discount-code:update]', discountCodeUpdateError.message)
      }
    }
  }

  if (promoSnapshot.appliedDealIds.length > 0) {
    await Promise.all(
      promoSnapshot.appliedDealIds.map(async (dealId) => {
        const { data: dealRow, error: dealLoadError } = await supabase
          .from('exp_bundle_deals')
          .select('id, usage_count')
          .eq('id', dealId)
          .maybeSingle()

        if (dealLoadError) {
          console.error('[stripe:webhook:deal-usage:load]', dealLoadError.message)
          return
        }

        if (!dealRow?.id) return

        const { error: dealUpdateError } = await supabase
          .from('exp_bundle_deals')
          .update({ usage_count: Number(dealRow.usage_count ?? 0) + 1 })
          .eq('id', dealRow.id)

        if (dealUpdateError) {
          console.error('[stripe:webhook:deal-usage:update]', dealUpdateError.message)
        }
      })
    )
  }
}

export async function POST(request: Request) {
  let eventId: string | null = null

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
    eventId = event.id

    const { error: insertWebhookError } = await supabase
      .from('exp_stripe_webhook_events')
      .insert({
        event_id: event.id,
        event_type: event.type,
        status: 'processing',
      })

    if (insertWebhookError) {
      if (insertWebhookError.code === '23505') {
        return NextResponse.json({ received: true, duplicate: true }, { status: 200 })
      }

      console.error('[stripe:webhook] Failed to register event', insertWebhookError.message)
      return NextResponse.json({ error: 'Webhook processing could not be initialized.' }, { status: 500 })
    }

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
        const { data: existingOrder, error: existingOrderError } = await supabase
          .from('exp_orders')
          .select('id, payment_status, cart_snapshot')
          .eq('id', orderId)
          .maybeSingle()

        if (existingOrderError) {
          console.error('[stripe:webhook] Order prefetch failed', existingOrderError.message)
        }

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
          await markWebhookEventFailed(supabase, event.id, error.message)
          return NextResponse.json({ error: 'Failed to update order status.' }, { status: 500 })
        }

        if (existingOrder?.payment_status !== 'paid') {
          await incrementPromotionUsageForOrder(supabase, orderId, existingOrder?.cart_snapshot)
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
          .select('id, status, quote_amount, quote_expires_at')
          .eq('id', customRequestId)
          .single()

        if (customRequestError || !customRequest) {
          console.error('[stripe:webhook] Missing custom request for payment link flow', customRequestError?.message)
        } else {
          if (customRequest.status === 'quote_sent' && customRequest.quote_expires_at) {
            const quoteExpiresAt = new Date(customRequest.quote_expires_at)
            if (!Number.isNaN(quoteExpiresAt.getTime()) && quoteExpiresAt.getTime() < Date.now()) {
              await supabase
                .from('exp_custom_requests')
                .update({ status: 'expired', updated_at: new Date().toISOString() })
                .eq('id', customRequest.id)

              console.error('[stripe:webhook] Quote expired before payment completion', customRequest.id)
              return NextResponse.json({ received: true, ignored: 'quote_expired' }, { status: 200 })
            }
          }

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
        } else {
          await releaseOrderInventory(supabase, orderId, 'Checkout async payment failed.')
          await processBackInStockForOrder(supabase, orderId)
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
        } else {
          await releaseOrderInventory(supabase, orderId, 'Checkout session expired before payment.')
          await processBackInStockForOrder(supabase, orderId)
          try {
            await processCheckoutAbandonmentRecovery(orderId)
          } catch (recoveryError) {
            console.error('[stripe:webhook:abandoned-cart:recovery]', recoveryError)
          }
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

    await markWebhookEventProcessed(supabase, event.id)

    return NextResponse.json({ received: true }, { status: 200 })
  } catch (error) {
    console.error('[stripe:webhook]', error)
    if (eventId) {
      const supabase = getSupabaseAdmin()
      await markWebhookEventFailed(
        supabase,
        eventId,
        error instanceof Error ? error.message : 'Unknown webhook processing error.'
      )
    }
    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 500 })
  }
}

async function markWebhookEventProcessed(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  eventId: string
) {
  const { error } = await supabase
    .from('exp_stripe_webhook_events')
    .update({
      status: 'processed',
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('event_id', eventId)

  if (error) {
    console.error('[stripe:webhook] Failed to mark processed', error.message)
  }
}

async function markWebhookEventFailed(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  eventId: string,
  message: string
) {
  const { error } = await supabase
    .from('exp_stripe_webhook_events')
    .update({
      status: 'failed',
      last_error: message.slice(0, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq('event_id', eventId)

  if (error) {
    console.error('[stripe:webhook] Failed to mark failed', error.message)
  }
}
