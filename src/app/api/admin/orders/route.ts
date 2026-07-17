import { NextResponse } from 'next/server'

import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getSupabaseAdmin } from '@/lib/supabase/client'

type OrderStatus =
  | 'awaiting_payment'
  | 'paid'
  | 'in_production'
  | 'ready_to_ship'
  | 'shipped'
  | 'delivered'
  | 'cancelled'

type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'

type HookStage = 'design' | 'setup' | 'production' | 'finishing' | 'packing'

interface OrdersPatchBody {
  action?: unknown
  orderId?: unknown
  nextStatus?: unknown
  note?: unknown
  isPinned?: unknown
  stage?: unknown
  scheduledFor?: unknown
  estimatedHours?: unknown
  assignee?: unknown
  hookId?: unknown
  trackingNumber?: unknown
  shippingCarrier?: unknown
}

function asString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

function asOptionalString(value: unknown, maxLen: number): string | null {
  const s = asString(value, maxLen)
  return s.length > 0 ? s : null
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asNumber(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return n
}

function isOrderStatus(value: string): value is OrderStatus {
  return [
    'awaiting_payment',
    'paid',
    'in_production',
    'ready_to_ship',
    'shipped',
    'delivered',
    'cancelled',
  ].includes(value)
}

function isHookStage(value: string): value is HookStage {
  return ['design', 'setup', 'production', 'finishing', 'packing'].includes(value)
}

function transitionAllowed(from: OrderStatus, to: OrderStatus): boolean {
  const allowed: Record<OrderStatus, OrderStatus[]> = {
    awaiting_payment: ['paid', 'cancelled'],
    paid: ['in_production', 'cancelled'],
    in_production: ['ready_to_ship', 'cancelled'],
    ready_to_ship: ['shipped', 'cancelled'],
    shipped: ['delivered', 'cancelled'],
    delivered: [],
    cancelled: [],
  }

  return allowed[from]?.includes(to) ?? false
}

async function loadOrderForUpdate(supabase: ReturnType<typeof getSupabaseAdmin>, orderId: string) {
  const { data, error } = await supabase
    .from('exp_orders')
    .select('id, status, payment_status, inventory_reserved_at, inventory_released_at, paid_at')
    .eq('id', orderId)
    .single()

  if (error || !data) {
    return null
  }

  return data as {
    id: string
    status: OrderStatus
    payment_status: PaymentStatus
    inventory_reserved_at: string | null
    inventory_released_at: string | null
    paid_at: string | null
  }
}

async function insertOrderEvent(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  input: {
    orderId: string
    actionType: 'status_transition' | 'cancel' | 'refund_marked' | 'note' | 'schedule_hook' | 'hook_completed' | 'tracking_update'
    previousStatus?: string | null
    nextStatus?: string | null
    previousPaymentStatus?: string | null
    nextPaymentStatus?: string | null
    note?: string | null
    metadata?: Record<string, unknown>
  }
) {
  await supabase.from('exp_order_status_events').insert({
    order_id: input.orderId,
    action_type: input.actionType,
    previous_status: input.previousStatus ?? null,
    next_status: input.nextStatus ?? null,
    previous_payment_status: input.previousPaymentStatus ?? null,
    next_payment_status: input.nextPaymentStatus ?? null,
    note: input.note ?? null,
    metadata: input.metadata ?? {},
    created_by: 'admin',
  })
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdminApiSession(request)
    if (!auth.ok) return auth.response

    const supabase = getSupabaseAdmin()
    const url = new URL(request.url)
    const orderId = asString(url.searchParams.get('orderId'), 64)
    const status = asString(url.searchParams.get('status'), 40)
    const payment = asString(url.searchParams.get('payment'), 40)
    const q = asString(url.searchParams.get('q'), 120).toLowerCase()

    if (orderId) {
      const [orderResult, itemsResult, notesResult, hooksResult, eventsResult] = await Promise.all([
        supabase
          .from('exp_orders')
          .select(`
            id, order_path, payment_mode, payment_status, status,
            stripe_session_id, stripe_payment_intent_id, stripe_payment_link_id,
            subtotal, discount_amount, shipping_cost, order_total,
            shipping_method, shipping_address, production_estimate_band,
            paid_at, cancelled_at, refunded_at, shipping_carrier, tracking_number,
            guest_tracking_token, branch, created_at, updated_at
          `)
          .eq('id', orderId)
          .single(),

        supabase
          .from('exp_order_items')
          .select('id, product_id, product_title, variant_label, selected_options, option_snapshot, unit_price, quantity, line_subtotal, line_discount, line_total, created_at')
          .eq('order_id', orderId)
          .order('created_at', { ascending: true }),

        supabase
          .from('exp_order_internal_notes')
          .select('id, note, is_pinned, created_by, created_at')
          .eq('order_id', orderId)
          .order('created_at', { ascending: false }),

        supabase
          .from('exp_order_production_hooks')
          .select('id, stage, scheduled_for, estimated_hours, assignee, note, is_completed, completed_at, created_by, created_at, updated_at')
          .eq('order_id', orderId)
          .order('created_at', { ascending: false }),

        supabase
          .from('exp_order_status_events')
          .select('id, action_type, previous_status, next_status, previous_payment_status, next_payment_status, note, metadata, created_by, created_at')
          .eq('order_id', orderId)
          .order('created_at', { ascending: false })
          .limit(80),
      ])

      if (orderResult.error || !orderResult.data) {
        return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
      }

      return NextResponse.json(
        {
          order: orderResult.data,
          items: itemsResult.data ?? [],
          notes: notesResult.data ?? [],
          hooks: hooksResult.data ?? [],
          events: eventsResult.data ?? [],
        },
        { status: 200 }
      )
    }

    let query = supabase
      .from('exp_orders')
      .select(`
        id, order_path, payment_mode, payment_status, status,
        subtotal, discount_amount, shipping_cost, order_total,
        shipping_method, production_estimate_band,
        paid_at, cancelled_at, refunded_at,
        created_at, updated_at
      `)
      .order('created_at', { ascending: false })
      .limit(120)

    if (status.length > 0 && isOrderStatus(status)) {
      query = query.eq('status', status)
    }
    if (payment.length > 0 && ['pending', 'paid', 'failed', 'refunded'].includes(payment)) {
      query = query.eq('payment_status', payment)
    }

    const { data, error } = await query

    if (error) {
      console.error('[admin:orders:get:list]', error.message)
      return NextResponse.json({ error: 'Could not load orders.' }, { status: 500 })
    }

    const rows = (data ?? []).filter((row) => {
      if (!q) return true
      return (
        String(row.id).toLowerCase().includes(q) ||
        String(row.order_path).toLowerCase().includes(q) ||
        String(row.status).toLowerCase().includes(q)
      )
    })

    return NextResponse.json({ orders: rows }, { status: 200 })
  } catch (error) {
    console.error('[admin:orders:get]', error)
    return NextResponse.json({ error: 'Could not load orders.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-orders-write',
      maxRequests: 80,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const supabase = getSupabaseAdmin()
    const body = (await request.json().catch(() => ({}))) as OrdersPatchBody
    const action = asString(body.action, 40)
    const orderId = asString(body.orderId, 64)

    if (!orderId) {
      return NextResponse.json({ error: 'Order id is required.' }, { status: 400 })
    }

    const order = await loadOrderForUpdate(supabase, orderId)
    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
    }

    if (action === 'transition') {
      const nextStatusRaw = asString(body.nextStatus, 40)
      if (!isOrderStatus(nextStatusRaw)) {
        return NextResponse.json({ error: 'Invalid next status.' }, { status: 400 })
      }

      if (!transitionAllowed(order.status, nextStatusRaw)) {
        return NextResponse.json(
          { error: `Transition not allowed: ${order.status} -> ${nextStatusRaw}.` },
          { status: 400 }
        )
      }

      if (
        ['in_production', 'ready_to_ship', 'shipped', 'delivered'].includes(nextStatusRaw) &&
        order.payment_status !== 'paid'
      ) {
        return NextResponse.json(
          { error: 'Order must be paid before production/shipping transitions.' },
          { status: 400 }
        )
      }

      const patch: Record<string, unknown> = {
        status: nextStatusRaw,
        updated_at: new Date().toISOString(),
      }

      if (nextStatusRaw === 'paid') {
        patch.payment_status = 'paid'
        patch.paid_at = order.paid_at ?? new Date().toISOString()
      }

      if (nextStatusRaw === 'cancelled') {
        patch.cancelled_at = new Date().toISOString()
      }

      const { error } = await supabase
        .from('exp_orders')
        .update(patch)
        .eq('id', orderId)

      if (error) {
        console.error('[admin:orders:transition]', error.message)
        await writeAdminAuditLog({
          action: 'orders.transition',
          entityType: 'order',
          entityId: orderId,
          route: '/api/admin/orders',
          request,
          status: 'failure',
          details: { from: order.status, to: nextStatusRaw, message: error.message },
        })
        return NextResponse.json({ error: 'Could not update order status.' }, { status: 500 })
      }

      await insertOrderEvent(supabase, {
        orderId,
        actionType: 'status_transition',
        previousStatus: order.status,
        nextStatus: nextStatusRaw,
        previousPaymentStatus: order.payment_status,
        nextPaymentStatus: nextStatusRaw === 'paid' ? 'paid' : order.payment_status,
      })

      await writeAdminAuditLog({
        action: 'orders.transition',
        entityType: 'order',
        entityId: orderId,
        route: '/api/admin/orders',
        request,
        status: 'success',
        details: { from: order.status, to: nextStatusRaw },
      })

      return NextResponse.json({ ok: true }, { status: 200 })
    }

    if (action === 'cancel') {
      if (order.status === 'cancelled' || order.status === 'delivered') {
        return NextResponse.json({ error: 'Order cannot be cancelled in current state.' }, { status: 400 })
      }

      const note = asOptionalString(body.note, 500)

      const { error } = await supabase
        .from('exp_orders')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId)

      if (error) {
        console.error('[admin:orders:cancel]', error.message)
        return NextResponse.json({ error: 'Could not cancel order.' }, { status: 500 })
      }

      if (order.payment_status !== 'paid') {
        await supabase.rpc('exp_release_order_inventory', {
          p_order_id: orderId,
          p_note: note ?? 'Order cancelled before payment; inventory released.',
        })
      }

      await insertOrderEvent(supabase, {
        orderId,
        actionType: 'cancel',
        previousStatus: order.status,
        nextStatus: 'cancelled',
        previousPaymentStatus: order.payment_status,
        nextPaymentStatus: order.payment_status,
        note,
      })

      if (note) {
        await supabase.from('exp_order_internal_notes').insert({
          order_id: orderId,
          note,
          created_by: 'admin',
        })
      }

      await writeAdminAuditLog({
        action: 'orders.cancel',
        entityType: 'order',
        entityId: orderId,
        route: '/api/admin/orders',
        request,
        status: 'success',
        details: { from: order.status, payment_status: order.payment_status },
      })

      return NextResponse.json({ ok: true }, { status: 200 })
    }

    if (action === 'mark_refunded') {
      if (order.payment_status !== 'paid') {
        return NextResponse.json({ error: 'Only paid orders can be marked refunded.' }, { status: 400 })
      }

      const note = asOptionalString(body.note, 500)
      const nextStatus: OrderStatus = order.status === 'delivered' ? 'delivered' : 'cancelled'

      const { error } = await supabase
        .from('exp_orders')
        .update({
          payment_status: 'refunded',
          status: nextStatus,
          refunded_at: new Date().toISOString(),
          cancelled_at: nextStatus === 'cancelled' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId)

      if (error) {
        console.error('[admin:orders:refunded]', error.message)
        return NextResponse.json({ error: 'Could not mark order refunded.' }, { status: 500 })
      }

      await insertOrderEvent(supabase, {
        orderId,
        actionType: 'refund_marked',
        previousStatus: order.status,
        nextStatus,
        previousPaymentStatus: order.payment_status,
        nextPaymentStatus: 'refunded',
        note,
      })

      if (note) {
        await supabase.from('exp_order_internal_notes').insert({
          order_id: orderId,
          note,
          created_by: 'admin',
        })
      }

      await writeAdminAuditLog({
        action: 'orders.refund.marked',
        entityType: 'order',
        entityId: orderId,
        route: '/api/admin/orders',
        request,
        status: 'success',
        details: { previous_payment_status: order.payment_status, next_payment_status: 'refunded' },
      })

      return NextResponse.json({ ok: true }, { status: 200 })
    }

    if (action === 'add_note') {
      const note = asString(body.note, 1000)
      const isPinned = asBoolean(body.isPinned, false)

      if (note.length < 2) {
        return NextResponse.json({ error: 'Note must be at least 2 characters.' }, { status: 400 })
      }

      const { data, error } = await supabase
        .from('exp_order_internal_notes')
        .insert({
          order_id: orderId,
          note,
          is_pinned: isPinned,
          created_by: 'admin',
        })
        .select('id, order_id, note, is_pinned, created_by, created_at')
        .single()

      if (error || !data) {
        console.error('[admin:orders:add-note]', error?.message)
        return NextResponse.json({ error: 'Could not save note.' }, { status: 500 })
      }

      await insertOrderEvent(supabase, {
        orderId,
        actionType: 'note',
        previousStatus: order.status,
        nextStatus: order.status,
        previousPaymentStatus: order.payment_status,
        nextPaymentStatus: order.payment_status,
        note,
        metadata: { note_id: data.id, is_pinned: isPinned },
      })

      await writeAdminAuditLog({
        action: 'orders.note.add',
        entityType: 'order',
        entityId: orderId,
        route: '/api/admin/orders',
        request,
        status: 'success',
        details: { note_id: data.id, is_pinned: isPinned },
      })

      return NextResponse.json({ note: data }, { status: 201 })
    }

    if (action === 'add_hook') {
      const stageRaw = asString(body.stage, 40)
      const scheduledFor = asOptionalString(body.scheduledFor, 80)
      const estimatedHoursRaw = asNumber(body.estimatedHours)
      const assignee = asOptionalString(body.assignee, 120)
      const note = asOptionalString(body.note, 500)

      if (!isHookStage(stageRaw)) {
        return NextResponse.json({ error: 'Invalid hook stage.' }, { status: 400 })
      }

      if (estimatedHoursRaw !== null && (estimatedHoursRaw < 0 || estimatedHoursRaw > 1000)) {
        return NextResponse.json({ error: 'Estimated hours must be between 0 and 1000.' }, { status: 400 })
      }

      const { data, error } = await supabase
        .from('exp_order_production_hooks')
        .insert({
          order_id: orderId,
          stage: stageRaw,
          scheduled_for: scheduledFor,
          estimated_hours: estimatedHoursRaw,
          assignee,
          note,
          created_by: 'admin',
        })
        .select('id, order_id, stage, scheduled_for, estimated_hours, assignee, note, is_completed, completed_at, created_by, created_at, updated_at')
        .single()

      if (error || !data) {
        console.error('[admin:orders:add-hook]', error?.message)
        return NextResponse.json({ error: 'Could not create production hook.' }, { status: 500 })
      }

      await insertOrderEvent(supabase, {
        orderId,
        actionType: 'schedule_hook',
        previousStatus: order.status,
        nextStatus: order.status,
        previousPaymentStatus: order.payment_status,
        nextPaymentStatus: order.payment_status,
        note,
        metadata: { hook_id: data.id, stage: data.stage, scheduled_for: data.scheduled_for, assignee: data.assignee },
      })

      await writeAdminAuditLog({
        action: 'orders.hook.add',
        entityType: 'order',
        entityId: orderId,
        route: '/api/admin/orders',
        request,
        status: 'success',
        details: { hook_id: data.id, stage: data.stage },
      })

      return NextResponse.json({ hook: data }, { status: 201 })
    }

    if (action === 'complete_hook') {
      const hookId = asString(body.hookId, 64)
      if (!hookId) {
        return NextResponse.json({ error: 'Hook id is required.' }, { status: 400 })
      }

      const { data: hook, error: hookError } = await supabase
        .from('exp_order_production_hooks')
        .update({ is_completed: true, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', hookId)
        .eq('order_id', orderId)
        .select('id, stage, is_completed, completed_at')
        .single()

      if (hookError || !hook) {
        console.error('[admin:orders:complete-hook]', hookError?.message)
        return NextResponse.json({ error: 'Could not complete hook.' }, { status: 500 })
      }

      await insertOrderEvent(supabase, {
        orderId,
        actionType: 'hook_completed',
        previousStatus: order.status,
        nextStatus: order.status,
        previousPaymentStatus: order.payment_status,
        nextPaymentStatus: order.payment_status,
        metadata: { hook_id: hook.id, stage: hook.stage },
      })

      await writeAdminAuditLog({
        action: 'orders.hook.complete',
        entityType: 'order',
        entityId: orderId,
        route: '/api/admin/orders',
        request,
        status: 'success',
        details: { hook_id: hook.id, stage: hook.stage },
      })

      return NextResponse.json({ hook }, { status: 200 })
    }

    if (action === 'update_tracking') {
      const trackingNumber = asString(body.trackingNumber, 64)
      const shippingCarrier = asString(body.shippingCarrier, 40)

      if (!trackingNumber) {
        return NextResponse.json({ error: 'Tracking number is required.' }, { status: 400 })
      }

      if (!shippingCarrier) {
        return NextResponse.json({ error: 'Shipping carrier is required.' }, { status: 400 })
      }

      const { error } = await supabase
        .from('exp_orders')
        .update({
          tracking_number: trackingNumber,
          shipping_carrier: shippingCarrier,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId)

      if (error) {
        console.error('[admin:orders:update-tracking]', error.message)
        return NextResponse.json({ error: 'Could not update tracking info.' }, { status: 500 })
      }

      await insertOrderEvent(supabase, {
        orderId,
        actionType: 'tracking_update',
        previousStatus: order.status,
        nextStatus: order.status,
        previousPaymentStatus: order.payment_status,
        nextPaymentStatus: order.payment_status,
        metadata: { tracking_number: trackingNumber, shipping_carrier: shippingCarrier },
      })

      await writeAdminAuditLog({
        action: 'orders.tracking.update',
        entityType: 'order',
        entityId: orderId,
        route: '/api/admin/orders',
        request,
        status: 'success',
        details: { tracking_number: trackingNumber, shipping_carrier: shippingCarrier },
      })

      return NextResponse.json({ ok: true }, { status: 200 })
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 })
  } catch (error) {
    console.error('[admin:orders:patch]', error)
    return NextResponse.json({ error: 'Could not apply order operation.' }, { status: 500 })
  }
}
