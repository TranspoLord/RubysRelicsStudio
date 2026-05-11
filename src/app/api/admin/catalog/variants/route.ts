import { NextResponse } from 'next/server'

import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getSupabaseAdmin } from '@/lib/supabase/client'

interface VariantBody {
  productId?: unknown
  variantId?: unknown
  label?: unknown
  sku?: unknown
  price_delta?: unknown
  capacity_weight?: unknown
  is_enabled?: unknown
  sort_order?: unknown
  confirmAction?: unknown
}

function asString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

function asOptionalString(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().slice(0, maxLen)
  return trimmed.length > 0 ? trimmed : null
}

function asNumber(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return n
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  return fallback
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdminApiSession(request)
    if (!auth.ok) return auth.response

    const url = new URL(request.url)
    const productId = asString(url.searchParams.get('productId'), 64)

    if (!productId) {
      return NextResponse.json({ error: 'Product id is required.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_product_variants')
      .select('id, product_id, label, sku, price_delta, capacity_weight, is_enabled, sort_order, updated_at')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('[admin:catalog:variants:get]', error.message)
      return NextResponse.json({ error: 'Could not load product variants.' }, { status: 500 })
    }

    return NextResponse.json({ variants: data ?? [] }, { status: 200 })
  } catch (error) {
    console.error('[admin:catalog:variants:get]', error)
    return NextResponse.json({ error: 'Could not load product variants.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-variant-write',
      maxRequests: 60,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as VariantBody
    const productId = asString(body.productId, 64)
    const label = asString(body.label, 120)
    const sku = asOptionalString(body.sku, 120)
    const priceDeltaRaw = asNumber(body.price_delta)
    const capacityWeightRaw = asNumber(body.capacity_weight)
    const isEnabled = asBoolean(body.is_enabled, true)
    const sortOrderRaw = asNumber(body.sort_order)

    if (!productId) {
      return NextResponse.json({ error: 'Product id is required.' }, { status: 400 })
    }

    if (!label || label.length < 1) {
      return NextResponse.json({ error: 'Variant label is required.' }, { status: 400 })
    }

    if (priceDeltaRaw === null || priceDeltaRaw < -100000 || priceDeltaRaw > 100000) {
      return NextResponse.json({ error: 'Price delta must be between -100000 and 100000.' }, { status: 400 })
    }

    if (sortOrderRaw === null || sortOrderRaw < -10000 || sortOrderRaw > 10000) {
      return NextResponse.json({ error: 'Sort order must be between -10000 and 10000.' }, { status: 400 })
    }

    if (capacityWeightRaw !== null && (capacityWeightRaw < 0 || capacityWeightRaw > 1000)) {
      return NextResponse.json({ error: 'Capacity weight must be between 0 and 1000.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_product_variants')
      .insert({
        product_id: productId,
        label,
        sku,
        price_delta: Math.round(priceDeltaRaw * 100) / 100,
        capacity_weight: capacityWeightRaw === null ? null : Math.round(capacityWeightRaw * 100) / 100,
        is_enabled: isEnabled,
        sort_order: Math.trunc(sortOrderRaw),
        updated_at: new Date().toISOString(),
      })
      .select('id, product_id, label, sku, price_delta, capacity_weight, is_enabled, sort_order, updated_at')
      .single()

    if (error || !data) {
      console.error('[admin:catalog:variants:post]', error?.message)
      await writeAdminAuditLog({
        action: 'catalog.variant.create',
        entityType: 'product_variant',
        entityId: null,
        route: '/api/admin/catalog/variants',
        request,
        status: 'failure',
        details: { reason: 'insert_failed', message: error?.message ?? null, productId },
      })
      return NextResponse.json({ error: 'Could not create product variant.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'catalog.variant.create',
      entityType: 'product_variant',
      entityId: data.id,
      route: '/api/admin/catalog/variants',
      request,
      status: 'success',
      details: { productId, label: data.label, sku: data.sku },
    })

    return NextResponse.json({ variant: data }, { status: 201 })
  } catch (error) {
    console.error('[admin:catalog:variants:post]', error)
    await writeAdminAuditLog({
      action: 'catalog.variant.create',
      entityType: 'product_variant',
      route: '/api/admin/catalog/variants',
      request,
      status: 'failure',
      details: { reason: 'unexpected_error' },
    })
    return NextResponse.json({ error: 'Could not create product variant.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-variant-write',
      maxRequests: 60,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as VariantBody
    const variantId = asString(body.variantId, 64)
    const label = asString(body.label, 120)
    const sku = asOptionalString(body.sku, 120)
    const priceDeltaRaw = asNumber(body.price_delta)
    const capacityWeightRaw = asNumber(body.capacity_weight)
    const isEnabled = asBoolean(body.is_enabled, true)
    const sortOrderRaw = asNumber(body.sort_order)

    if (!variantId) {
      return NextResponse.json({ error: 'Variant id is required.' }, { status: 400 })
    }

    if (!label || label.length < 1) {
      return NextResponse.json({ error: 'Variant label is required.' }, { status: 400 })
    }

    if (priceDeltaRaw === null || priceDeltaRaw < -100000 || priceDeltaRaw > 100000) {
      return NextResponse.json({ error: 'Price delta must be between -100000 and 100000.' }, { status: 400 })
    }

    if (sortOrderRaw === null || sortOrderRaw < -10000 || sortOrderRaw > 10000) {
      return NextResponse.json({ error: 'Sort order must be between -10000 and 10000.' }, { status: 400 })
    }

    if (capacityWeightRaw !== null && (capacityWeightRaw < 0 || capacityWeightRaw > 1000)) {
      return NextResponse.json({ error: 'Capacity weight must be between 0 and 1000.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_product_variants')
      .update({
        label,
        sku,
        price_delta: Math.round(priceDeltaRaw * 100) / 100,
        capacity_weight: capacityWeightRaw === null ? null : Math.round(capacityWeightRaw * 100) / 100,
        is_enabled: isEnabled,
        sort_order: Math.trunc(sortOrderRaw),
        updated_at: new Date().toISOString(),
      })
      .eq('id', variantId)
      .select('id, product_id, label, sku, price_delta, capacity_weight, is_enabled, sort_order, updated_at')
      .single()

    if (error || !data) {
      console.error('[admin:catalog:variants:put]', error?.message)
      await writeAdminAuditLog({
        action: 'catalog.variant.edit',
        entityType: 'product_variant',
        entityId: variantId,
        route: '/api/admin/catalog/variants',
        request,
        status: 'failure',
        details: { reason: 'update_failed', message: error?.message ?? null },
      })
      return NextResponse.json({ error: 'Could not update product variant.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'catalog.variant.edit',
      entityType: 'product_variant',
      entityId: data.id,
      route: '/api/admin/catalog/variants',
      request,
      status: 'success',
      details: { productId: data.product_id, label: data.label, sku: data.sku },
    })

    return NextResponse.json({ variant: data }, { status: 200 })
  } catch (error) {
    console.error('[admin:catalog:variants:put]', error)
    await writeAdminAuditLog({
      action: 'catalog.variant.edit',
      entityType: 'product_variant',
      route: '/api/admin/catalog/variants',
      request,
      status: 'failure',
      details: { reason: 'unexpected_error' },
    })
    return NextResponse.json({ error: 'Could not update product variant.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-variant-write',
      maxRequests: 60,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as VariantBody
    const variantId = asString(body.variantId, 64)
    const confirmAction = asString(body.confirmAction, 60)

    if (!variantId) {
      return NextResponse.json({ error: 'Variant id is required.' }, { status: 400 })
    }

    if (confirmAction !== 'delete_variant') {
      return NextResponse.json({ error: 'Missing destructive action confirmation.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_product_variants')
      .delete()
      .eq('id', variantId)
      .select('id, product_id, label, sku')
      .single()

    if (error || !data) {
      console.error('[admin:catalog:variants:delete]', error?.message)
      await writeAdminAuditLog({
        action: 'catalog.variant.delete',
        entityType: 'product_variant',
        entityId: variantId,
        route: '/api/admin/catalog/variants',
        request,
        status: 'failure',
        details: { reason: 'delete_failed', message: error?.message ?? null },
      })
      return NextResponse.json({ error: 'Could not delete product variant.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'catalog.variant.delete',
      entityType: 'product_variant',
      entityId: data.id,
      route: '/api/admin/catalog/variants',
      request,
      status: 'success',
      details: { productId: data.product_id, label: data.label, sku: data.sku },
    })

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('[admin:catalog:variants:delete]', error)
    await writeAdminAuditLog({
      action: 'catalog.variant.delete',
      entityType: 'product_variant',
      route: '/api/admin/catalog/variants',
      request,
      status: 'failure',
      details: { reason: 'unexpected_error' },
    })
    return NextResponse.json({ error: 'Could not delete product variant.' }, { status: 500 })
  }
}
