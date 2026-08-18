import { NextResponse } from 'next/server'

import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { safeLogError } from '@/lib/security/logger'
import { getSupabaseAdmin } from '@/lib/supabase/client'

function asString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

function asBoolean(value: unknown, fallback = true): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asInt(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdminApiSession(request)
    if (!auth.ok) return auth.response

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_future_product_statuses')
      .select('id, label, color, sort_order, is_default, is_visible, created_at, updated_at')
      .order('sort_order', { ascending: true })

    if (error) {
      safeLogError('[admin:catalog:future-product-statuses:get]', error)
      return NextResponse.json({ error: 'Could not load future product statuses.' }, { status: 500 })
    }

    return NextResponse.json({ statuses: data ?? [] })
  } catch (error) {
    safeLogError('[admin:catalog:future-product-statuses:get]', error)
    return NextResponse.json({ error: 'Could not load future product statuses.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-future-product-statuses-write',
      maxRequests: 30,
      windowMs: 60_000,
    })
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))
    const label = asString(body?.label, 120)
    const color = asString(body?.color, 24)
    const sortOrder = asInt(body?.sort_order, 0)
    const isDefault = asBoolean(body?.is_default, false)
    const isVisible = asBoolean(body?.is_visible, true)

    if (!label) {
      return NextResponse.json({ error: 'Label is required.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_future_product_statuses')
      .insert({
        label,
        color: color || '#6A7AC4',
        sort_order: sortOrder,
        is_default: isDefault,
        is_visible: isVisible,
      })
      .select('id, label, color, sort_order, is_default, is_visible, created_at, updated_at')
      .single()

    if (error) {
      safeLogError('[admin:catalog:future-product-statuses:post]', error)
      await writeAdminAuditLog({
        action: 'catalog.future_product_status.create',
        entityType: 'future_product_status',
        route: '/api/admin/catalog/future-product-statuses',
        request,
        status: 'failure',
        details: { error: error.message, label },
      })
      return NextResponse.json({ error: 'Could not create status.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'catalog.future_product_status.create',
      entityType: 'future_product_status',
      entityId: data?.id ?? null,
      route: '/api/admin/catalog/future-product-statuses',
      request,
      status: 'success',
      details: { label, is_default: isDefault, is_visible: isVisible },
    })

    return NextResponse.json({ status: data }, { status: 201 })
  } catch (error) {
    safeLogError('[admin:catalog:future-product-statuses:post]', error)
    return NextResponse.json({ error: 'Could not create status.' }, { status: 500 })
  }
}
