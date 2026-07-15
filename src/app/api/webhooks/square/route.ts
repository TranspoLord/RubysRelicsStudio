import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase/client'

const supabase = getSupabaseAdmin()

// Square webhook signature verification
function verifySquareWebhookSignature(
  body: string,
  signature: string | null,
  signatureKey: string
): boolean {
  if (!signature || !signatureKey) {
    return false
  }

  const expectedSignature = createHmac('sha256', signatureKey)
    .update(body)
    .digest('hex')

  // Use timing-safe comparison to prevent timing attacks
  return timingSafeEqual(signature, expectedSignature)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

// GET endpoint for webhook verification (Square sends GET first)
export async function GET(request: NextRequest) {
  return NextResponse.json({ status: 'webhook endpoint ready' })
}

// POST endpoint for webhook events
export async function POST(request: NextRequest) {
  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
  if (!signatureKey) {
    console.error('[Square Webhook] SQUARE_WEBHOOK_SIGNATURE_KEY not configured')
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 500 }
    )
  }

  const signature = request.headers.get('x-square-hmacsha256-signature')
  const body = await request.text()

  // Verify webhook signature
  if (!verifySquareWebhookSignature(body, signature, signatureKey)) {
    console.warn('[Square Webhook] Invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: any
  try {
    event = JSON.parse(body)
  } catch (err) {
    console.error('[Square Webhook] Invalid JSON', err)
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Handle payment successful event
  if (event.type === 'payment.created' || event.type === 'payment.completed') {
    const payment = event.data?.object?.payment
    if (!payment) {
      return NextResponse.json({ error: 'No payment data' }, { status: 400 })
    }

    const orderId = payment.order_id
    const paymentId = payment.id

    // Update order status in database
    const { error: updateError } = await supabase
      .from('exp_orders')
      .update({
        payment_status: 'paid',
        status: 'in_production',
        square_payment_id: paymentId,
        paid_at: new Date(payment.created_at).toISOString(),
      })
      .eq('square_order_id', orderId)

    if (updateError) {
      console.error('[Square Webhook] Failed to update order', updateError)
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