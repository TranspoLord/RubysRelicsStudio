import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { getResend } from '@/lib/resend/client'

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
  try {
    // Verify webhook signature (optional but recommended)
    const signature = request.headers.get('x-shippo-signature')
    const webhookSecret = process.env.SHIPPO_WEBHOOK_SECRET

    if (webhookSecret && signature) {
      // Verify HMAC signature
      const crypto = await import('node:crypto')
      const body = await request.text()
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(body)
        .digest('hex')

      if (signature !== expectedSignature) {
        console.error('[shippo:webhook] Invalid signature')
        return new NextResponse('Unauthorized', { status: 401 })
      }
    }

    const payload = (await request.json()) as ShippoWebhookPayload
    
    // Handle tracking updates
    if (payload.event === 'track_updated' || payload.event === 'track_created') {
      const { tracking_number, carrier, status } = payload.data

      const supabase = getSupabaseAdmin()

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
              <p>Your order #${order.id} has been delivered via ${carrier.toUpperCase()} tracking #${tracking_number}.</p>
              <p><a href="https://yourdomain.com/orders/${order.id}">View order details</a></p>
            `,
          })
        } catch (emailError) {
          console.error('[shippo:webhook] Failed to send email:', emailError)
        }
      }
    }

    return new NextResponse('OK', { status: 200 })
  } catch (error) {
    console.error('[shippo:webhook]', error)
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