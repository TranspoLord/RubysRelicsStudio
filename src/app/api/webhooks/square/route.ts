import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { safeLogError } from '@/lib/security/logger'
import { sendEmail } from '@/lib/resend/send'
import { retrieveSquareOrder } from '@/lib/square/client'
import { safeHtmlEscape } from '@/lib/validate'

const supabase = getSupabaseAdmin()

/**
 * Square webhook signature verification (SEC-003).
 *
 * Square signs the webhook payload using HMAC-SHA256 over the notification
 * URL + body, and sends the result as a base64-encoded signature in the
 * `x-square-hmacsha256-signature` header.
 *
 * We verify fail-closed: if the signature key is missing or the header is
 * absent, we reject the request. No code path reaches payload processing
 * without verified signature.
 */
function verifySquareWebhookSignature(
  body: string,
  signature: string | null,
  signatureKey: string,
  notificationUrl: string
): boolean {
  // Fail-closed: both signature and key must be present
  if (!signature || !signatureKey) {
    return false
  }

  // Square's signature is computed over the notification URL + body
  const payload = notificationUrl + body
  const expectedSignature = createHmac('sha256', signatureKey)
    .update(payload)
    .digest('base64')

  // Timing-safe comparison
  const actualBuf = Buffer.from(signature)
  const expectedBuf = Buffer.from(expectedSignature)

  if (actualBuf.length !== expectedBuf.length) return false
  return timingSafeEqual(actualBuf, expectedBuf)
}

// GET endpoint for webhook verification (Square sends GET first)
export async function GET(request: NextRequest) {
  return NextResponse.json({ status: 'webhook endpoint ready' })
}

// POST endpoint for webhook events
export async function POST(request: NextRequest) {
  // SEC-003: Fail-closed — signature key must be configured
  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
  if (!signatureKey) {
    safeLogError('[Square Webhook]', 'SQUARE_WEBHOOK_SIGNATURE_KEY not configured')
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 500 }
    )
  }

  // SEC-003: Fail-closed — signature header must be present
  const signature = request.headers.get('x-square-hmacsha256-signature')
  if (!signature) {
    safeLogError('[Square Webhook]', 'Missing signature header')
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
  }

  const body = await request.text()

  // SEC-003: The notification URL is part of Square's signature payload.
  // It must match the URL configured in the Square dashboard.
  const notificationUrl = process.env.SQUARE_WEBHOOK_NOTIFICATION_URL
  if (!notificationUrl) {
    safeLogError('[Square Webhook]', 'SQUARE_WEBHOOK_NOTIFICATION_URL not configured')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  // Verify webhook signature — fail-closed
  if (!verifySquareWebhookSignature(body, signature, signatureKey, notificationUrl)) {
    safeLogError('[Square Webhook]', 'Invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: any
  try {
    event = JSON.parse(body)
  } catch (err) {
    safeLogError('[Square Webhook]', err)
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // SEC-041: Rate limit by event type, not IP (Square sends from a fixed pool)
  const eventType = event?.type || 'unknown'
  const rl = await rateLimit(`square-webhook:${eventType}`, 100, 60 * 1000)
  if (!rl.allowed) {
    return rateLimitResponse(rl.retryAfter ?? 60)
  }

  // OCT #4: dedupe with `processed = false`, and treat ONLY a primary-key
  // conflict as a duplicate. The old code treated *any* insert error as one, so
  // a transient failure returned 200 and the event was lost for good.
  const eventId = event?.event_id || event?.id
  if (!eventId) {
    safeLogError('[Square Webhook]', 'Event has no id — cannot dedupe')
    return NextResponse.json({ error: 'Invalid event' }, { status: 400 })
  }

  const { error: insertDedupError } = await supabase
    .from('exp_square_webhook_events')
    .insert({
      id: eventId,
      event_type: eventType,
      received_at: new Date().toISOString(),
      processed: false,
    })

  if (insertDedupError) {
    // 23505 = primary-key conflict: a genuine duplicate delivery.
    if (insertDedupError.code === '23505') {
      return NextResponse.json({ received: true, duplicate: true })
    }
    safeLogError('[Square Webhook:dedupe]', insertDedupError)
    return NextResponse.json({ error: 'Could not record event' }, { status: 500 })
  }

  // OCT #4: keep dedupe rows 7 days. Square retries a failing delivery for up to
  // ~72 hours, so the old 24-hour window could re-process a late retry.
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  await supabase
    .from('exp_square_webhook_events')
    .delete()
    .lt('received_at', cutoff)
    .then(null, () => {})

  // OCT #4: `payment.created` and `payment.updated` are Square's real event
  // types — `payment.completed`/`payment.failed` are not events at all, which is
  // why those branches were dead. And `payment.created` fires at *creation*, so
  // the payment's status must be read before treating it as money received: a
  // FAILED payment at the right amount used to be marked paid and shipped.
  if (event.type === 'payment.created' || event.type === 'payment.updated') {
    const payment = event.data?.object?.payment
    if (!payment) {
      return NextResponse.json({ error: 'No payment data' }, { status: 400 })
    }

    const squareOrderId = payment.order_id
    const paymentId = payment.id
    const paymentStatus = String(payment.status ?? '').toUpperCase()
    // `amount_money` excludes tips; `total_money` includes them.
    const paymentAmount = payment.amount_money?.amount
    const currency = payment.amount_money?.currency

    const { data: order, error: orderError } = await supabase
      .from('exp_orders')
      .select('id, order_total, payment_status')
      .eq('square_order_id', squareOrderId)
      .maybeSingle()

    if (orderError) {
      safeLogError('[Square Webhook:order-lookup]', orderError)
      // OCT #4: clear the dedupe row so Square's retry can actually reprocess.
      await supabase.from('exp_square_webhook_events').delete().eq('id', eventId)
      return NextResponse.json({ error: 'Order lookup failed' }, { status: 500 })
    }

    if (!order) {
      safeLogError('[Square Webhook]', `No order found for square_order_id: ${squareOrderId}`)
      return NextResponse.json({ received: true, order_found: false })
    }

    // A failed or cancelled payment is not money. Only ever downgrade a still
    // *pending* order, so a late event cannot overwrite a paid one.
    if (paymentStatus === 'FAILED' || paymentStatus === 'CANCELED') {
      await supabase
        .from('exp_orders')
        .update({ payment_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', order.id)
        .eq('payment_status', 'pending')
      return NextResponse.json({ received: true, payment_failed: true })
    }

    // APPROVED / PENDING are not money yet — wait for COMPLETED.
    if (paymentStatus !== 'COMPLETED') {
      return NextResponse.json({ received: true, payment_status: paymentStatus })
    }

    // OCT #4: a missing amount is NOT "nothing to compare" — it means the charge
    // cannot be verified, so do not mark paid.
    if (typeof paymentAmount !== 'number' || !Number.isFinite(paymentAmount)) {
      safeLogError('[Square Webhook]', `Payment ${paymentId} has no amount_money`)
      return NextResponse.json({ received: true, missing_amount: true })
    }

    if (currency && currency !== 'USD') {
      safeLogError('[Square Webhook]', `Payment ${paymentId} is in ${currency}, not USD`)
      return NextResponse.json({ received: true, currency_mismatch: true })
    }

    if (
      process.env.SQUARE_LOCATION_ID &&
      payment.location_id &&
      payment.location_id !== process.env.SQUARE_LOCATION_ID
    ) {
      safeLogError('[Square Webhook]', `Payment ${paymentId} belongs to another location`)
      return NextResponse.json({ received: true, location_mismatch: true })
    }

    // OCT #35: Square's automatic tax is recorded on the *order*, not the
    // payment, so fetch it. Without it a tax-inclusive charge would never match
    // our pre-tax total and the order would never be marked paid.
    let taxCents = 0
    if (squareOrderId) {
      try {
        const squareOrder = await retrieveSquareOrder(squareOrderId)
        const taxAmount = squareOrder?.total_tax_money?.amount
        if (typeof taxAmount === 'number' && Number.isFinite(taxAmount) && taxAmount > 0) {
          taxCents = Math.round(taxAmount)
        }
      } catch (taxError) {
        safeLogError('[Square Webhook:order-tax]', taxError)
      }
    }

    // Guard the date parse — an unparseable value used to yield "Invalid Date".
    const parsedPaidAt = payment.created_at ? new Date(payment.created_at) : null
    const paidAt =
      parsedPaidAt && !Number.isNaN(parsedPaidAt.getTime())
        ? parsedPaidAt.toISOString()
        : new Date().toISOString()

    // OCT #4: one transactional entry point. It locks the row, is idempotent,
    // refuses a mismatched amount (tax included), and never regresses the
    // fulfilment status.
    const { data: markResult, error: markError } = await supabase.rpc('exp_mark_order_paid', {
      p_order_id: order.id,
      p_square_payment_id: paymentId,
      p_amount_cents: Math.round(paymentAmount),
      p_paid_at: paidAt,
      p_source: 'square_webhook',
      p_tax_cents: taxCents,
    })

    if (markError) {
      safeLogError('[Square Webhook:mark-paid]', markError)
      // OCT #4: clear the dedupe row and return 500 so Square retries. Leaving
      // the row behind is what made a failed update unrecoverable — the retry
      // was rejected as a duplicate and the order stayed pending forever.
      await supabase.from('exp_square_webhook_events').delete().eq('id', eventId)
      return NextResponse.json({ error: 'Could not mark the order paid' }, { status: 500 })
    }

    const outcome = markResult as
      | { ok?: boolean; reason?: string; was_cancelled?: boolean }
      | null

    if (!outcome?.ok) {
      // Amount mismatch or unknown order: accept so Square stops retrying, but
      // leave the order alone for an operator to reconcile.
      safeLogError('[Square Webhook]', `mark_order_paid refused: ${outcome?.reason ?? 'unknown'}`)
      return NextResponse.json({ received: true, reason: outcome?.reason ?? 'unknown' })
    }

    if (outcome.reason === 'already_paid') {
      // A retry of an event already applied — do not email twice.
      return NextResponse.json({ received: true, already_paid: true })
    }

    if (outcome.was_cancelled) {
      safeLogError('[Square Webhook]', `Order ${order.id} was cancelled but has now been paid`)
    }

    // Only reached when the RPC genuinely marked the order paid.
    if (outcome.reason === 'marked_paid') {
      // Send payment confirmation email to the customer if this is a custom
      // request order. The DB trigger (migration 050) will set the custom
      // request status to 'paid' — we just notify the customer here.
      try {
        const { data: orderDetails } = await supabase
          .from('exp_orders')
          .select('id, customer_email, custom_request_id, order_total')
          .eq('id', order.id)
          .single()

        if (orderDetails?.customer_email && orderDetails?.custom_request_id) {
          const { data: customRequest } = await supabase
            .from('exp_custom_requests')
            .select('id, item_type, customer_name, customer_access_token')
            .eq('id', orderDetails.custom_request_id)
            .single()

          if (customRequest) {
            const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://rubysrelicsstudio.com'
            const statusUrl = customRequest.customer_access_token
              ? `${origin}/custom-orders/${customRequest.id}?access=${encodeURIComponent(customRequest.customer_access_token)}`
              : `${origin}/custom-orders`

            // OCT #14: a typed result instead of a silently ignored one, and a
            // deterministic key so a retried webhook cannot email twice.
            const paymentEmail = await sendEmail({
              to: orderDetails.customer_email,
              subject: `Payment received — your custom order is now in production (${customRequest.id.slice(0, 8)})`,
              idempotencyKey: `paid:${orderDetails.id}`,
              html: `
                <h2>Payment Received — Thank You!</h2>
                <p>Hi ${safeHtmlEscape(customRequest.customer_name ?? 'there')},</p>
                <p>We've received your payment and your custom order is now in production!</p>
                <p><strong>Request ID:</strong> ${safeHtmlEscape(customRequest.id)}</p>
                <p><strong>Item type:</strong> ${safeHtmlEscape(customRequest.item_type)}</p>
                <p><strong>Amount paid:</strong> $${Number(orderDetails.order_total).toFixed(2)}</p>
                <h3>What Happens Next?</h3>
                <p>Our team will begin working on your item. You'll receive updates as your order progresses through production.</p>
                <p>Track your request status anytime:</p>
                <p><a href="${safeHtmlEscape(statusUrl)}">${safeHtmlEscape(statusUrl)}</a></p>
              `,
            })

            if (!paymentEmail.ok) {
              safeLogError('[Square Webhook:payment-email]', paymentEmail.error)
            }
          }
        }
      } catch (emailError) {
        safeLogError('[Square Webhook:payment-email]', emailError)
        // Email failure should not affect webhook processing
      }
    }
  }

  return NextResponse.json({ received: true })
}