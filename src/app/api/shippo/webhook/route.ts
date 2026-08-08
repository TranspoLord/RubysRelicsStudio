import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createHash } from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { getResend } from '@/lib/resend/client'
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

export async function POST(request: Request) {
  // SEC-004: Fail-closed — SHIPPO_WEBHOOK_SECRET must be configured
  const webhookSecret = process.env.SHIPPO_WEBHOOK_SECRET
  if (!webhookSecret) {
    safeLogError('[shippo:webhook]', 'SHIPPO_WEBHOOK_SECRET not configured')
    return new NextResponse('Webhook not configured', { status: 500 })
  }

  // SEC-004: Fail-closed — signature header must be present
  const signature = request.headers.get('x-shippo-signature')
  if (!signature) {
    safeLogError('[shippo:webhook]', 'Missing x-shippo-signature header')
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // Read the raw body for signature verification
  const body = await request.text()

  // SEC-004: Verify HMAC signature using timing-safe comparison
  const expectedSignature = createHmac('sha256', webhookSecret)
    .update(body)
    .digest('hex')

  // SEC-004: Use crypto.timingSafeEqual instead of !==
  const actualBuf = Buffer.from(signature)
  const expectedBuf = Buffer.from(expectedSignature)

  if (actualBuf.length !== expectedBuf.length) {
    safeLogError('[shippo:webhook]', 'Invalid signature (length mismatch)')
    return new NextResponse('Unauthorized', { status: 401 })
  }

  if (!timingSafeEqual(actualBuf, expectedBuf)) {
    safeLogError('[shippo:webhook]', 'Invalid signature')
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // Signature verified — safe to process the payload
  try {
    const supabase = getSupabaseAdmin()

    // Replay protection: dedupe webhook payloads using a deterministic hash.
    // If Shippo retries the exact same event, the hash collides and we no-op.
    const payloadHash = createHash('sha256').update(body).digest('hex')
    const payloadId = `shippo:${payloadHash}`
    const { data: inserted, error: dedupeError } = await supabase
      .from('exp_shippo_webhook_events')
      .insert({
        id: payloadId,
        event_type: 'unknown',
        received_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (dedupeError || !inserted) {
      return new NextResponse('OK', { status: 200 })
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

      // Update order shipping status
      const updateData: Record<string, unknown> = {}

      if (status.toLowerCase().includes('deliver')) {
        updateData.status = 'delivered'
      } else if (status.toLowerCase().includes('ship')) {
        updateData.status = 'shipped'
      }

      updateData.updated_at = new Date().toISOString()

      if (Object.keys(updateData).length > 1) {
        await supabase
          .from('exp_orders')
          .update(updateData)
          .eq('id', order.id)
      }

      // Log tracking event
      await supabase.from('exp_order_status_events').insert({
        order_id: order.id,
        action_type: 'tracking_update',
        previous_status: order.status,
        next_status: updateData.status || order.status,
        metadata: {
          tracking_number,
          carrier,
          status,
          status_details: payload.data.status_details,
        },
        created_by: 'shippo_webhook',
      })

      // Send notification email if order is delivered
      if (status.toLowerCase().includes('deliver') && order.customer_email) {
        try {
          const resend = getResend()
          const fromAddress = process.env.SHIPPO_FROM_EMAIL || 'orders@rubysrelics.com'

          await resend.emails.send({
            from: fromAddress,
            to: [order.customer_email],
            subject: 'Your order has been delivered!',
            html: `
              <h2>Order Delivered</h2>
              <p>Your order #${safeHtmlEscape(order.id)} has been delivered via ${safeHtmlEscape(carrier.toUpperCase())} tracking #${safeHtmlEscape(tracking_number)}.</p>
              <p><a href="https://yourdomain.com/orders/${encodeURIComponent(order.id)}">View order details</a></p>
            `,
          })
        } catch (emailError) {
          safeLogError('[shippo:webhook] Failed to send email:', emailError)
        }
      }
    }

    return new NextResponse('OK', { status: 200 })
  } catch (error) {
    safeLogError('[shippo:webhook]', error)
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