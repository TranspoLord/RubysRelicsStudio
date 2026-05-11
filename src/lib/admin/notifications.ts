import { getSupabaseAdmin } from '@/lib/supabase/client'

interface PendingNotification {
  sourceType: 'order' | 'custom_request' | 'system'
  sourceId: string
  eventType: string
  title: string
  body: string
  href: string
  metadata?: Record<string, unknown>
}

export async function syncOperationalNotifications() {
  const supabase = getSupabaseAdmin()

  const [ordersResult, customRequestsResult] = await Promise.all([
    supabase
      .from('exp_orders')
      .select('id, status, payment_status, order_total, created_at, updated_at')
      .in('status', ['paid', 'ready_to_ship'])
      .order('updated_at', { ascending: false })
      .limit(80),

    supabase
      .from('exp_custom_requests')
      .select('id, status, item_type, customer_email, quote_expires_at, updated_at')
      .in('status', ['awaiting_quote', 'quote_sent'])
      .order('updated_at', { ascending: false })
      .limit(80),
  ])

  if (ordersResult.error) {
    console.error('[admin:notifications:orders]', ordersResult.error.message)
  }
  if (customRequestsResult.error) {
    console.error('[admin:notifications:custom-requests]', customRequestsResult.error.message)
  }

  const pending: PendingNotification[] = []

  for (const order of ordersResult.data ?? []) {
    if (order.status === 'paid') {
      pending.push({
        sourceType: 'order',
        sourceId: order.id,
        eventType: 'order_paid',
        title: 'Paid order awaiting production',
        body: `Order ${order.id.slice(0, 8)} is paid (${Number(order.order_total ?? 0).toFixed(2)} USD).`,
        href: `/admin/orders`,
        metadata: {
          status: order.status,
          payment_status: order.payment_status,
        },
      })
    }

    if (order.status === 'ready_to_ship') {
      pending.push({
        sourceType: 'order',
        sourceId: order.id,
        eventType: 'order_ready_to_ship',
        title: 'Order ready to ship',
        body: `Order ${order.id.slice(0, 8)} is ready for shipment dispatch.`,
        href: `/admin/orders`,
        metadata: {
          status: order.status,
          payment_status: order.payment_status,
        },
      })
    }
  }

  for (const request of customRequestsResult.data ?? []) {
    if (request.status === 'awaiting_quote') {
      pending.push({
        sourceType: 'custom_request',
        sourceId: request.id,
        eventType: 'custom_request_awaiting_quote',
        title: 'Custom request awaiting quote',
        body: `${request.item_type} request from ${request.customer_email}.`,
        href: `/admin/custom-requests`,
        metadata: {
          status: request.status,
        },
      })
    }

    if (request.status === 'quote_sent' && request.quote_expires_at) {
      const expiresAt = new Date(request.quote_expires_at)
      if (!Number.isNaN(expiresAt.getTime())) {
        const msRemaining = expiresAt.getTime() - Date.now()
        if (msRemaining <= 1000 * 60 * 60 * 24) {
          pending.push({
            sourceType: 'custom_request',
            sourceId: request.id,
            eventType: 'custom_request_quote_expiring',
            title: 'Custom quote expiring soon',
            body: `Quote for ${request.item_type} expires on ${expiresAt.toLocaleString()}.`,
            href: `/admin/custom-requests`,
            metadata: {
              status: request.status,
              quote_expires_at: request.quote_expires_at,
            },
          })
        }
      }
    }
  }

  if (pending.length === 0) {
    return
  }

  const rows = pending.map((item) => ({
    source_type: item.sourceType,
    source_id: item.sourceId,
    event_type: item.eventType,
    title: item.title,
    body: item.body,
    href: item.href,
    metadata: item.metadata ?? {},
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('exp_admin_notifications')
    .upsert(rows, {
      onConflict: 'source_type,source_id,event_type',
      ignoreDuplicates: false,
    })

  if (error) {
    console.error('[admin:notifications:upsert]', error.message)
  }
}

export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = getSupabaseAdmin()

  const { count, error } = await supabase
    .from('exp_admin_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false)

  if (error) {
    console.error('[admin:notifications:unread-count]', error.message)
    return 0
  }

  return count ?? 0
}
