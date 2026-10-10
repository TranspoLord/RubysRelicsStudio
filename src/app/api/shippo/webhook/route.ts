import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createHash } from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { sendEmail } from '@/lib/resend/send'
import { safeLogError } from '@/lib/security/logger'
import { safeHtmlEscape } from '@/lib/validate'

// Shippo webhook handler for tracking updates
// Configure this URL in Shippo dashboard: https://yourdomain.com/api/shippo/webhook
// Shippo will send POST requests when tracking status changes

interface ShippoWebhookPayload {
  data: {
    tracking_number: string
    carrier: string
    status: string
    status_details: string
    estimated_delivery_date: string | null
    tracking_history: Array<{
      date: string
      status: string
      status_details: string
    }>
    metadata?: Record<string, unknown>
  }
  event: string
}

/**
 * OCT #21: Shippo's dashboard can send an HMAC-SHA256 signature
 * (`x-shippo-signature`, hex) or nothing but a secret URL token. Both are
 * compared in constant time, and the token form is only accepted when
 * `SHIPPO_WEBHOOK_TOKEN` is configured — so the endpoint stays fail-closed.
 */
function timingSafeEqualStrings(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

export async function POST(request: Request) {
  const webhookSecret = process.env.SHIPPO_WEBHOOK_SECRET
  const webhookToken = process.env.SHIPPO_WEBHOOK_TOKEN

  // SEC-004: Fail-closed — at least one credential must be configured
  if (!webhookSecret && !webhookToken) {
    safeLogError(
      '[shippo:webhook]',
      'Neither SHIPPO_WEBHOOK_SECRET nor SHIPPO_WEBHOOK_TOKEN is configured',
    )
    return new NextResponse('Webhook not configured', { status: 500 })
  }

  // Read the raw body for signature verification
  const body = await request.text()
  const signature = request.headers.get('x-shippo-signature')
  const urlToken = new URL(request.url).searchParams.get('token')

  const signatureOk =
    Boolean(webhookSecret) &&
    Boolean(signature) &&
    timingSafeEqualStrings(
      String(signature),
      createHmac('sha256', String(webhookSecret)).update(body).digest('hex'),
    )

  const tokenOk =
    Boolean(webhookToken) &&
    Boolean(urlToken) &&
    timingSafeEqualStrings(String(urlToken), String(webhookToken))

  if (!signatureOk && !tokenOk) {
    safeLogError('[shippo:webhook]', 'Invalid or missing webhook credentials')
    return new NextResponse('Unauthorized', { status: 401 })
  }

  let payloadId: string | null = null

  // Signature verified — safe to process the payload
  try {
    const supabase = getSupabaseAdmin()

    // OCT #21: dedupe like the Square webhook. The row is written with
    // `processed = false` (the column defaulted to `true`, so a failure was never
    // retried) and ONLY a primary-key conflict counts as a duplicate — the old
    // code treated any insert error as one and returned 200, losing the event.
    const payloadHash = createHash('sha256').update(body).digest('hex')
    payloadId = `shippo:${payloadHash}`
    const { error: dedupeError } = await supabase.from('exp_shippo_webhook_events').insert({
      id: payloadId,
      event_type: 'unknown',
      received_at: new Date().toISOString(),
      processed: false,
    })

    if (dedupeError) {
      if (dedupeError.code === '23505') {
        return new NextResponse('OK', { status: 200 })
      }
      safeLogError('[shippo:webhook:dedupe]', dedupeError)
      return new NextResponse('Error', { status: 500 })
    }

    const payload = JSON.parse(body) as ShippoWebhookPayload

    await supabase
      .from('exp_shippo_webhook_events')
      .update({ event_type: payload.event || 'unknown' })
      .eq('id', payloadId)
      .then(null, () => {})

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    await supabase
      .from('exp_shippo_webhook_events')
      .delete()
      .lt('received_at', cutoff)
      .then(null, () => {})

    // Handle tracking updates
    if (payload.event === 'track_updated' || payload.event === 'track_created') {
      const { tracking_number, carrier, status } = payload.data
      const normalizedStatus = String(status ?? '').toUpperCase()

      // OCT #21: Shippo reports TRANSIT/DELIVERED, so the old
      // `status.includes('ship')` never matched and orders never became shipped.
      const nextStatus =
        normalizedStatus === 'TRANSIT'
          ? 'shipped'
          : normalizedStatus === 'DELIVERED'
            ? 'delivered'
            : null

      // Find order by tracking number
      const { data: order, error: orderError } = await supabase
        .from('exp_orders')
        .select('id, customer_email, status, guest_tracking_token')
        .eq('tracking_number', tracking_number)
        .single()

      if (orderError || !order) {
        // No order found, log and return success
        console.log(`[shippo:webhook] No order found for tracking ${tracking_number}`)
        return new NextResponse('OK', { status: 200 })
      }

      // OCT #21: conditional transitions, so a late TRANSIT cannot pull a shipped
      // order back and a DELIVERED event cannot resurrect a cancelled one.
      let movedToDelivered = false
      const now = new Date().toISOString()

      if (nextStatus === 'shipped') {
        const { error: updateError } = await supabase
          .from('exp_orders')
          .update({ status: 'shipped', updated_at: now })
          .eq('id', order.id)
          .in('status', ['in_production', 'ready_to_ship'])

        if (updateError) throw updateError
      } else if (nextStatus === 'delivered') {
        const { data: updated, error: updateError } = await supabase
          .from('exp_orders')
          .update({ status: 'delivered', updated_at: now })
          .eq('id', order.id)
          .eq('status', 'shipped')
          .select('id')

        if (updateError) throw updateError
        movedToDelivered = (updated ?? []).length > 0
      }

      // Log tracking event. The error is checked now: `tracking_update` was
      // rejected by the CHECK until migration 074 and the failure was swallowed,
      // so no tracking event was ever recorded.
      const { error: eventError } = await supabase.from('exp_order_status_events').insert({
        order_id: order.id,
        action_type: 'tracking_update',
        previous_status: order.status,
        next_status: nextStatus ?? order.status,
        metadata: {
          tracking_number,
          carrier: carrier ?? null,
          status,
          status_details: payload.data.status_details,
        },
        created_by: 'shippo_webhook',
      })

      if (eventError) {
        safeLogError('[shippo:webhook:event]', eventError)
        throw eventError
      }

      // Send notification email only when this event actually moved the order to
      // delivered (the idempotency key is the second guard).
      if (movedToDelivered && order.customer_email) {
        const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://rubysrelicsstudio.com'
        const trackUrl = order.guest_tracking_token
          ? `${origin}/orders/${encodeURIComponent(order.id)}?access=${encodeURIComponent(order.guest_tracking_token)}`
          : `${origin}/shop`

        // OCT #14: a typed result, and a deterministic key so a repeated
        // DELIVERED update cannot send a second email. The carrier/tracking
        // values are coerced because Shippo omits them on some events — the old
        // `carrier.toUpperCase()` threw a 500 when it did.
        const deliveredEmail = await sendEmail({
          to: order.customer_email,
          subject: 'Your order has been delivered!',
          idempotencyKey: `delivered:${order.id}`,
          html: `
            <h2>Order Delivered</h2>
            <p>Your order #${safeHtmlEscape(order.id)} has been delivered via ${safeHtmlEscape(String(carrier ?? '').toUpperCase())} tracking #${safeHtmlEscape(String(tracking_number ?? ''))}.</p>
            <p><a href="${safeHtmlEscape(trackUrl)}">View order details</a></p>
          `,
        })

        if (!deliveredEmail.ok) {
          safeLogError('[shippo:webhook] Failed to send email:', deliveredEmail.error)
        }
      }
    }

    // OCT #21: only mark the row processed once the event really landed.
    await supabase
      .from('exp_shippo_webhook_events')
      .update({ processed: true })
      .eq('id', payloadId)
      .then(null, () => {})

    return new NextResponse('OK', { status: 200 })
  } catch (error) {
    safeLogError('[shippo:webhook]', error)

    // OCT #21: clear the dedupe row so Shippo's retry is processed instead of
    // being rejected as a duplicate, and so a `processed = true` default cannot
    // hide the failure.
    if (payloadId) {
      await getSupabaseAdmin()
        .from('exp_shippo_webhook_events')
        .delete()
        .eq('id', payloadId)
        .then(null, () => {})
    }

    return new NextResponse('Error', { status: 500 })
  }
}

// GET endpoint for webhook verification
export async function GET() {
  return NextResponse.json({
    message: 'Shippo webhook endpoint. Configure in Shippo dashboard.',
    timestamp: new Date().toISOString()
  })
}