import { NextResponse } from 'next/server'

import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getSupabaseAdmin } from '@/lib/supabase/client'

type LaborStage = 'design' | 'setup' | 'production' | 'finishing' | 'packing'

interface LaborCreateBody {
  orderId?: unknown
  orderItemId?: unknown
  stage?: unknown
  minutes?: unknown
  hourlyRate?: unknown
  note?: unknown
}

function asString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

function asOptionalString(value: unknown, maxLen: number): string | null {
  const s = asString(value, maxLen)
  return s.length > 0 ? s : null
}

function asInt(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const intValue = Math.trunc(n)
  return intValue
}

function asRate(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return Number(n.toFixed(2))
}

function isLaborStage(value: string): value is LaborStage {
  return ['design', 'setup', 'production', 'finishing', 'packing'].includes(value)
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdminApiSession(request)
    if (!auth.ok) return auth.response

    const supabase = getSupabaseAdmin()
    const url = new URL(request.url)

    const orderId = asString(url.searchParams.get('orderId'), 64)
    const fromRaw = asString(url.searchParams.get('from'), 40)
    const toRaw = asString(url.searchParams.get('to'), 40)

    let query = supabase
      .from('exp_labor_time_entries')
      .select('id, order_id, order_item_id, stage, minutes, hourly_rate, note, logged_by, logged_at, created_at')
      .order('logged_at', { ascending: false })
      .limit(120)

    if (orderId) {
      query = query.eq('order_id', orderId)
    }

    if (fromRaw) {
      query = query.gte('logged_at', new Date(fromRaw).toISOString())
    }

    if (toRaw) {
      query = query.lte('logged_at', new Date(toRaw).toISOString())
    }

    const { data, error } = await query

    if (error) {
      console.error('[admin:labor:get]', error.message)
      return NextResponse.json({ error: 'Could not load labor entries.' }, { status: 500 })
    }

    return NextResponse.json({ entries: data ?? [] }, { status: 200 })
  } catch (error) {
    console.error('[admin:labor:get]', error)
    return NextResponse.json({ error: 'Could not load labor entries.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-labor-write',
      maxRequests: 120,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as LaborCreateBody

    const orderId = asOptionalString(body.orderId, 64)
    const orderItemId = asOptionalString(body.orderItemId, 64)
    const stageRaw = asString(body.stage, 24)
    const minutes = asInt(body.minutes)
    const hourlyRate = asRate(body.hourlyRate)
    const note = asOptionalString(body.note, 1000)

    if (!isLaborStage(stageRaw)) {
      return NextResponse.json({ error: 'Valid labor stage is required.' }, { status: 400 })
    }

    if (!minutes || minutes <= 0) {
      return NextResponse.json({ error: 'Minutes must be greater than zero.' }, { status: 400 })
    }

    if (hourlyRate === null) {
      return NextResponse.json({ error: 'Hourly rate must be zero or greater.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    if (orderId) {
      const { data: order, error: orderError } = await supabase
        .from('exp_orders')
        .select('id')
        .eq('id', orderId)
        .single()

      if (orderError || !order) {
        return NextResponse.json({ error: 'Order not found for labor entry.' }, { status: 404 })
      }
    }

    if (orderItemId) {
      const { data: orderItem, error: orderItemError } = await supabase
        .from('exp_order_items')
        .select('id, order_id')
        .eq('id', orderItemId)
        .single()

      if (orderItemError || !orderItem) {
        return NextResponse.json({ error: 'Order item not found for labor entry.' }, { status: 404 })
      }

      if (orderId && orderItem.order_id !== orderId) {
        return NextResponse.json(
          { error: 'Order item does not belong to provided order id.' },
          { status: 400 }
        )
      }
    }

    const { data, error } = await supabase
      .from('exp_labor_time_entries')
      .insert({
        order_id: orderId,
        order_item_id: orderItemId,
        stage: stageRaw,
        minutes,
        hourly_rate: hourlyRate,
        note,
        logged_by: 'admin',
      })
      .select('id, order_id, order_item_id, stage, minutes, hourly_rate, note, logged_by, logged_at, created_at')
      .single()

    if (error || !data) {
      console.error('[admin:labor:post]', error?.message ?? 'insert_failed')
      await writeAdminAuditLog({
        action: 'labor.create',
        entityType: 'labor_time_entry',
        route: '/api/admin/labor',
        request,
        status: 'failure',
        details: { orderId, orderItemId, stage: stageRaw, minutes, hourlyRate, message: error?.message },
      })
      return NextResponse.json({ error: 'Could not create labor entry.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'labor.create',
      entityType: 'labor_time_entry',
      entityId: data.id,
      route: '/api/admin/labor',
      request,
      status: 'success',
      details: { orderId, orderItemId, stage: stageRaw, minutes, hourlyRate },
    })

    return NextResponse.json({ entry: data }, { status: 201 })
  } catch (error) {
    console.error('[admin:labor:post]', error)
    await writeAdminAuditLog({
      action: 'labor.create',
      entityType: 'labor_time_entry',
      route: '/api/admin/labor',
      request,
      status: 'failure',
      details: { reason: 'unexpected_error' },
    })
    return NextResponse.json({ error: 'Could not create labor entry.' }, { status: 500 })
  }
}
