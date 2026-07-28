import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { safeLogError } from '@/lib/security/logger'
import { getEmailSenderAddress, getResend } from '@/lib/resend/client'
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
  const notificationUrl = process.env.SQUARE_WEBHOOK_NOTIFICATION_URL || request.url

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

  // SEC-047: Replay protection — atomic deduplication by event.id within 24h.
  // Uses INSERT with ON CONFLICT DO NOTHING to make the check-and-insert atomic,
  // preventing the TOCTOU race condition where two concurrent requests could
  // both pass the SELECT check and both process the event.
  const eventId = event?.event_id || event?.id
  if (eventId) {
    const { data: inserted, error: insertDedupError } = await supabase
      .from('exp_square_webhook_events')
      .insert({
        id: eventId,
        event_type: eventType,
        received_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertDedupError || !inserted) {
      // Duplicate event (primary key conflict) — return 200 but do not reprocess
      return NextResponse.json({ received: true, duplicate: true })
    }

    // Lazy cleanup: delete events older than 24 hours
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    await supabase
      .from('exp_square_webhook_events')
      .delete()
      .lt('received_at', cutoff)
      .then(null, () => {})
  }

  // Handle payment successful event
  if (event.type === 'payment.created' || event.type === 'payment.completed') {
    const payment = event.data?.object?.payment
    if (!payment) {
      return NextResponse.json({ error: 'No payment data' }, { status: 400 })
    }

    const orderId = payment.order_id
    const paymentId = payment.id
    const paymentAmount = payment.total_money?.amount // in cents

    // SEC-003: Look up the order and reconcile the payment amount
    const { data: order, error: orderError } = await supabase
      .from('exp_orders')
      .select('id, order_total, payment_status')
      .eq('square_order_id', orderId)
      .maybeSingle()

    if (orderError || !order) {
      safeLogError('[Square Webhook]', `No order found for square_order_id: ${orderId}`)
      // Return 200 so Square doesn't retry, but don't mark anything paid
      return NextResponse.json({ received: true, order_found: false })
    }

    // SEC-003: Amount reconciliation — fail-closed if mismatch
    if (paymentAmount != null && order.order_total != null) {
      const expectedAmountCents = Math.round(Number(order.order_total) * 100)
      if (paymentAmount !== expectedAmountCents) {
        safeLogError(
          '[Square Webhook]',
          `Amount mismatch for order ${order.id}: expected ${expectedAmountCents}c, got ${paymentAmount}c`
        )
        // Do NOT mark as paid — fail closed
        return NextResponse.json({ received: true, amount_mismatch: true })
      }
    }

    // Amounts match (or no amount to compare) — mark order as paid
    const { error: updateError } = await supabase
      .from('exp_orders')
      .update({
        payment_status: 'paid',
        status: 'in_production',
        square_payment_id: paymentId,
        paid_at: new Date(payment.created_at).toISOString(),
      })
      .eq('id', order.id)

    if (updateError) {
      safeLogError('[Square Webhook]', updateError)
    } else {
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

          if (customRequest && process.env.RESEND_API_KEY) {
            const resend = getResend()
            const fromAddress = await getEmailSenderAddress()
            const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://rubysrelicsstudio.com'
            const statusUrl = customRequest.customer_access_token
              ? `${origin}/custom-orders/${customRequest.id}?access=${encodeURIComponent(customRequest.customer_access_token)}`
              : `${origin}/custom-orders`

            await resend.emails.send({
              from: fromAddress,
              to: [orderDetails.customer_email],
              subject: `Payment received — your custom order is now in production (${customRequest.id.slice(0, 8)})`,
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
          }
        }
      } catch (emailError) {
        safeLogError('[Square Webhook:payment-email]', emailError)
        // Email failure should not affect webhook processing
      }
    }
  }

  // Handle payment failed event
  if (event.type === 'payment.failed') {
    const payment = event.data?.object?.payment
    if (payment) {
      const orderId = payment.order_id

      await supabase
        .from('exp_orders')
        .update({ payment_status: 'failed' })
        .eq('square_order_id', orderId)
    }
  }

  return NextResponse.json({ received: true })
}