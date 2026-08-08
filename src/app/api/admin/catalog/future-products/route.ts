import { NextResponse } from 'next/server'

import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
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
      .from('exp_future_products')
      .select('id, title, description, estimated_release, category_key, status_id, is_visible, sort_order, created_at, updated_at')
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('[admin:catalog:future-products:get]', error.message)
      return NextResponse.json({ error: 'Could not load future products.' }, { status: 500 })
    }

    return NextResponse.json({ products: data ?? [] })
  } catch (error) {
    console.error('[admin:catalog:future-products:get]', error)
    return NextResponse.json({ error: 'Could not load future products.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-future-products-write',
      maxRequests: 30,
      windowMs: 60_000,
    })
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))
    const title = asString(body?.title, 180)
    const description = asString(body?.description, 2000)
    const estimatedRelease = asString(body?.estimated_release, 30)
    const categoryKey = asString(body?.category_key, 120)
    const statusId = asString(body?.status_id, 80)
    const isVisible = asBoolean(body?.is_visible, true)
    const sortOrder = asInt(body?.sort_order, 0)
    const mediaUrl = asString(body?.media_url, 500)
    const mediaAlt = asString(body?.media_alt, 200)

    if (!title) {
      return NextResponse.json({ error: 'Title is required.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_future_products')
      .insert({
        title,
        description: description || null,
        estimated_release: estimatedRelease || null,
        category_key: categoryKey || null,
        media_url: mediaUrl || null,
        media_alt: mediaAlt || null,
        status_id: statusId || null,
        is_visible: isVisible,
        sort_order: sortOrder,
      })
      .select('id, title, description, estimated_release, category_key, status_id, is_visible, sort_order, created_at, updated_at')
      .single()

    if (error) {
      console.error('[admin:catalog:future-products:post]', error.message)
      await writeAdminAuditLog({
        action: 'catalog.future_products.create',
        entityType: 'future_product',
        route: '/api/admin/catalog/future-products',
        request,
        status: 'failure',
        details: { error: error.message, title },
      })
      return NextResponse.json({ error: 'Could not create future product.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'catalog.future_products.create',
      entityType: 'future_product',
      entityId: data?.id ?? null,
      route: '/api/admin/catalog/future-products',
      request,
      status: 'success',
      details: { title, is_visible: isVisible, sort_order: sortOrder },
    })

    return NextResponse.json({ product: data }, { status: 201 })
  } catch (error) {
    console.error('[admin:catalog:future-products:post]', error)
    return NextResponse.json({ error: 'Could not create future product.' }, { status: 500 })
  }
}
