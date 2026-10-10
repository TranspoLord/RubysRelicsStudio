import { NextRequest, NextResponse, after } from 'next/server'
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
      // OCT #4: the confirmation email is scheduled with `after()`, so Resend's
      // latency can never delay Square's 200 (a slow send risks a redelivery of
      // the whole event). The body lives in `sendPaymentConfirmationEmail`.
      const buyerEmailFromSquare =
        typeof payment.buyer_email_address === 'string' ? payment.buyer_email_address : undefined
      after(() => sendPaymentConfirmationEmail(order.id, buyerEmailFromSquare, Math.round(paymentAmount)))
    }
  }

  // OCT #4: refunds. Square emits `refund.created` (usually PENDING) and then
  // `refund.updated` (COMPLETED) for the same refund, so this is handled in one
  // place that only moves money on COMPLETED and claims the refund id first.
  if (event.type === 'refund.created' || event.type === 'refund.updated') {
    return handleRefundEvent(event, eventId)
  }

  return NextResponse.json({ received: true })
}

/**
 * OCT #4: the refund half of the Square webhook.
 *
 * Square emits `refund.created` (usually PENDING) and then `refund.updated`
 * (COMPLETED) for the same refund, so this function
 *   * only moves money on COMPLETED,
 *   * claims the refund id in `exp_order_status_events` before touching the
 *     order — the partial unique index from migration 077 makes that insert the
 *     atomic gate, so the second delivery loses with 23505,
 *   * releases the claim and the dedupe row if the order update fails, so
 *     Square's retry can finish the job.
 */
async function handleRefundEvent(event: any, eventId: string): Promise<NextResponse> {
  const refund = event.data?.object?.refund
  if (!refund) {
    return NextResponse.json({ error: 'No refund data' }, { status: 400 })
  }

  const refundStatus = String(refund.status ?? '').toUpperCase()
  if (refundStatus !== 'COMPLETED') {
    // PENDING / REJECTED / FAILED are not money back (yet, or ever).
    return NextResponse.json({ received: true, refund_status: refundStatus })
  }

  const refundId = typeof refund.id === 'string' ? refund.id : ''
  const refundAmount = refund.amount_money?.amount
  const refundCurrency = refund.amount_money?.currency

  if (!refundId) {
    safeLogError('[Square Webhook]', 'Refund has no id — cannot dedupe')
    return NextResponse.json({ error: 'Invalid refund' }, { status: 400 })
  }

  if (typeof refundAmount !== 'number' || !Number.isFinite(refundAmount) || refundAmount <= 0) {
    safeLogError('[Square Webhook]', `Refund ${refundId} has no usable amount_money`)
    return NextResponse.json({ received: true, missing_amount: true })
  }

  if (refundCurrency && refundCurrency !== 'USD') {
    safeLogError('[Square Webhook]', `Refund ${refundId} is in ${refundCurrency}, not USD`)
    return NextResponse.json({ received: true, currency_mismatch: true })
  }

  if (
    process.env.SQUARE_LOCATION_ID &&
    refund.location_id &&
    refund.location_id !== process.env.SQUARE_LOCATION_ID
  ) {
    safeLogError('[Square Webhook]', `Refund ${refundId} belongs to another location`)
    return NextResponse.json({ received: true, location_mismatch: true })
  }

  const { order, error: lookupError } = await findOrderForRefund(
    refund.order_id,
    refund.payment_id,
  )

  if (lookupError) {
    safeLogError('[Square Webhook:refund-lookup]', lookupError)
    await clearDedupeRow(eventId)
    return NextResponse.json({ error: 'Refund lookup failed' }, { status: 500 })
  }

  if (!order) {
    safeLogError('[Square Webhook]', `No order found for refund ${refundId}`)
    return NextResponse.json({ received: true, order_found: false })
  }

  // A refund only means something once the order is paid: the checkout writes
  // `square_order_id` before any money moves, so a pending order can match too.
  const refundable =
    order.payment_status === 'paid' ||
    order.payment_status === 'partially_refunded' ||
    order.payment_status === 'refunded'

  if (!refundable) {
    safeLogError(
      '[Square Webhook]',
      `Refund ${refundId} for order ${order.id} ignored — payment_status is ${order.payment_status ?? 'null'}`,
    )
    return NextResponse.json({ received: true, refund_ignored: 'not_paid' })
  }

  const refundedCents =
    Math.round(Number(order.refunded_amount ?? 0) * 100) + Math.round(refundAmount)
  const orderTotalCents = Math.round(Number(order.order_total ?? 0) * 100)
  // The charge can exceed `order_total` when Square adds tax (OCT #35), so a
  // cumulative refund that covers the record counts as a full refund.
  const nextPaymentStatus = refundedCents >= orderTotalCents ? 'refunded' : 'partially_refunded'
  const now = new Date().toISOString()
  const refundedAt = squareTimestamp(refund.updated_at ?? refund.created_at, now)

  const { data: claim, error: claimError } = await supabase
    .from('exp_order_status_events')
    .insert({
      order_id: order.id,
      action_type: 'refund_webhook',
      previous_status: null,
      next_status: null,
      previous_payment_status: order.payment_status,
      next_payment_status: nextPaymentStatus,
      note: null,
      metadata: {
        square_refund_id: refundId,
        amount_cents: Math.round(refundAmount),
        refunded_total_cents: refundedCents,
        source: 'square_webhook',
      },
      created_by: 'square_webhook',
    })
    .select('id')
    .single()

  if (claimError?.code === '23505') {
    // Already applied by an earlier delivery of this same refund.
    return NextResponse.json({ received: true, refund_already_applied: true })
  }

  if (claimError || !claim?.id) {
    safeLogError('[Square Webhook:refund-claim]', claimError)
    await clearDedupeRow(eventId)
    return NextResponse.json({ error: 'Could not record the refund' }, { status: 500 })
  }

  const { error: refundError } = await supabase
    .from('exp_orders')
    .update({
      payment_status: nextPaymentStatus,
      refunded_amount: refundedCents / 100,
      refunded_at: refundedAt,
      updated_at: now,
    })
    .eq('id', order.id)

  if (refundError) {
    // Release the claim so the trail never claims a refund that was not applied.
    safeLogError('[Square Webhook:refund]', refundError)
    await supabase.from('exp_order_status_events').delete().eq('id', claim.id)
    await clearDedupeRow(eventId)
    return NextResponse.json({ error: 'Could not record the refund' }, { status: 500 })
  }

  return NextResponse.json({
    received: true,
    refund_applied: nextPaymentStatus,
    refunded_total_cents: refundedCents,
  })
}

/** OCT #4: drop the dedupe row so Square's retry is processed again. */
async function clearDedupeRow(eventId: string): Promise<void> {
  await supabase.from('exp_square_webhook_events').delete().eq('id', eventId)
}

interface RefundedOrderRow {
  id: string
  order_total: number | null
  payment_status: string | null
  refunded_amount: number | null
}

/**
 * OCT #4: look a refunded order up by the Square order id the checkout writes,
 * then by the payment id the mark-paid RPC stores, so a refund is not dropped
 * when Square omits one of the two.
 */
async function findOrderForRefund(
  squareOrderId: unknown,
  paymentId: unknown,
): Promise<{ order: RefundedOrderRow | null; error: unknown }> {
  const columns = 'id, order_total, payment_status, refunded_amount'

  if (typeof squareOrderId === 'string' && squareOrderId) {
    const { data, error } = await supabase
      .from('exp_orders')
      .select(columns)
      .eq('square_order_id', squareOrderId)
      .maybeSingle()

    if (error) return { order: null, error }
    if (data) return { order: data as RefundedOrderRow, error: null }
  }

  if (typeof paymentId === 'string' && paymentId) {
    const { data, error } = await supabase
      .from('exp_orders')
      .select(columns)
      .eq('square_payment_id', paymentId)
      .maybeSingle()

    if (error) return { order: null, error }
    if (data) return { order: data as RefundedOrderRow, error: null }
  }

  return { order: null, error: null }
}

/** A Square timestamp we can trust, or `fallback` (never "Invalid Date"). */
function squareTimestamp(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  return fallback
}

/**
 * OCT #4 / #13 / #14: the "payment received" email, scheduled by the webhook with
 * `after()` so it never delays the response.
 *
 * Two shapes: a shop order (items + options + total + the order link) and a
 * custom-request order (the request link). `chargedCents` is the amount Square
 * actually took, which includes any tax Square added; it falls back to the
 * recorded total when it is not known.
 */
async function sendPaymentConfirmationEmail(
  orderId: string,
  buyerEmailFallback?: string,
  chargedCents?: number,
): Promise<void> {
  try {
    const { data: orderDetails } = await supabase
      .from('exp_orders')
      .select('id, customer_email, custom_request_id, order_total, guest_tracking_token, production_estimate_band')
      .eq('id', orderId)
      .single()

    if (!orderDetails) return

    // OCT #13: a shop order has no custom request. `customer_email` can be
    // missing when the buyer never typed one, but Square knows it.
    if (!orderDetails.custom_request_id) {
      await sendShopConfirmationEmail(orderDetails, buyerEmailFallback, chargedCents)
      return
    }

    if (!orderDetails.customer_email) return

    const { data: customRequest } = await supabase
      .from('exp_custom_requests')
      .select('id, item_type, customer_name, customer_access_token')
      .eq('id', orderDetails.custom_request_id)
      .single()

    if (!customRequest) return

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
  } catch (emailError) {
    // An email failure must never affect webhook processing.
    safeLogError('[Square Webhook:payment-email]', emailError)
  }
}

interface ShopOrderEmailRow {
  id: string
  customer_email: string | null
  order_total: number | null
  guest_tracking_token: string | null
  production_estimate_band: string | null
}

/**
 * OCT #13: the shop-order confirmation email.
 *
 * Sent from the paid transition only, so a pending or failed payment never
 * produces one. It carries the order number, the items with their options, the
 * amount charged and the `/orders/…?access=…` link, because the first shipping
 * update can be weeks away for made-to-order items.
 */
async function sendShopConfirmationEmail(
  order: ShopOrderEmailRow,
  buyerEmailFallback?: string,
  chargedCents?: number,
): Promise<void> {
  const to = order.customer_email ?? buyerEmailFallback ?? ''
  if (!to) {
    safeLogError('[Square Webhook:payment-email]', `Order ${order.id} has no customer email`)
    return
  }

  // OCT #13: backfill so later shipping and delivery emails can reach the buyer.
  if (!order.customer_email && buyerEmailFallback) {
    await supabase
      .from('exp_orders')
      .update({ customer_email: buyerEmailFallback, updated_at: new Date().toISOString() })
      .eq('id', order.id)
      .then(null, () => {})
  }

  const { data: items } = await supabase
    .from('exp_order_items')
    .select('product_title, variant_label, quantity, line_total, selected_options')
    .eq('order_id', order.id)

  const rows = (items ?? []) as Array<{
    product_title: string
    variant_label: string | null
    quantity: number
    line_total: number
    selected_options: Record<string, unknown> | null
  }>

  const itemLines = rows
    .map((item) => {
      const options =
        item.selected_options && Object.keys(item.selected_options).length > 0
          ? ` <span style="color:#666">(${Object.entries(item.selected_options)
              .map(([key, value]) => `${safeHtmlEscape(key)}: ${safeHtmlEscape(String(value))}`)
              .join(', ')})</span>`
          : ''
      const variant = item.variant_label ? ` — ${safeHtmlEscape(item.variant_label)}` : ''
      return `<li>${safeHtmlEscape(item.product_title)}${variant} × ${Number(item.quantity)}${options} — $${Number(item.line_total).toFixed(2)}</li>`
    })
    .join('')

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://rubysrelicsstudio.com'
  const orderUrl = order.guest_tracking_token
    ? `${origin}/orders/${encodeURIComponent(order.id)}?access=${encodeURIComponent(order.guest_tracking_token)}`
    : `${origin}/orders/${encodeURIComponent(order.id)}`

  const paidAmount =
    typeof chargedCents === 'number' && chargedCents > 0
      ? chargedCents / 100
      : Number(order.order_total ?? 0)

  const email = await sendEmail({
    to,
    subject: `Payment received — order ${order.id.slice(0, 8).toUpperCase()}`,
    // OCT #14: one deterministic key per order, so a redelivered webhook cannot
    // send a second confirmation.
    idempotencyKey: `paid:${order.id}`,
    html: `
      <h2>Payment Received — Thank You!</h2>
      <p>We received your payment of <strong>$${paidAmount.toFixed(2)}</strong> and your order is in our forge queue.</p>
      ${itemLines ? `<h3>Your order</h3><ul>${itemLines}</ul>` : ''}
      <p><strong>Production estimate:</strong> ${safeHtmlEscape(order.production_estimate_band ?? 'To be confirmed')}</p>
      <p><a href="${safeHtmlEscape(orderUrl)}">View your order</a> — that page always shows the latest status and any tracking number.</p>
      <p>We will email you again when your order ships.</p>
    `,
  })

  if (!email.ok) {
    safeLogError('[Square Webhook:payment-email]', email.error)
  }
}

