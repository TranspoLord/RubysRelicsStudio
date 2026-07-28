import { NextResponse } from 'next/server'

import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getSupabaseAdmin } from '@/lib/supabase/client'

const DISCOUNT_TYPES = ['percent', 'fixed_amount', 'unit_price', 'stepped'] as const
type DiscountType = (typeof DISCOUNT_TYPES)[number]

interface DiscountBody {
  productId?: unknown
  discountId?: unknown
  min_qty?: unknown
  max_qty?: unknown
  discount_type?: unknown
  discount_value?: unknown
  step_qty?: unknown
  label?: unknown
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

function asOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return n
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  return fallback
}

function isDiscountType(value: unknown): value is DiscountType {
  return typeof value === 'string' && (DISCOUNT_TYPES as readonly string[]).includes(value)
}

const SELECT_COLUMNS =
  'id, product_id, min_qty, max_qty, discount_type, discount_value, step_qty, label, is_enabled, sort_order, updated_at'

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
      .from('exp_product_bulk_discounts')
      .select(SELECT_COLUMNS)
      .eq('product_id', productId)
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('[admin:catalog:discounts:get]', error.message)
      return NextResponse.json({ error: 'Could not load bulk discounts.' }, { status: 500 })
    }

    return NextResponse.json({ discounts: data ?? [] }, { status: 200 })
  } catch (error) {
    console.error('[admin:catalog:discounts:get]', error)
    return NextResponse.json({ error: 'Could not load bulk discounts.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-discount-write',
      maxRequests: 60,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as DiscountBody
    const productId = asString(body.productId, 64)
    const minQtyRaw = asNumber(body.min_qty)
    const maxQtyRaw = asOptionalNumber(body.max_qty)
    const discountType = body.discount_type
    const discountValueRaw = asNumber(body.discount_value)
    const stepQtyRaw = asOptionalNumber(body.step_qty)
    const label = asOptionalString(body.label, 120)
    const isEnabled = asBoolean(body.is_enabled, true)
    const sortOrderRaw = asNumber(body.sort_order)

    if (!productId) {
      return NextResponse.json({ error: 'Product id is required.' }, { status: 400 })
    }

    if (minQtyRaw === null || !Number.isInteger(minQtyRaw) || minQtyRaw < 1) {
      return NextResponse.json({ error: 'Min quantity must be a positive integer.' }, { status: 400 })
    }

    if (maxQtyRaw !== null && (!Number.isInteger(maxQtyRaw) || maxQtyRaw < minQtyRaw)) {
      return NextResponse.json(
        { error: 'Max quantity must be a positive integer >= min quantity.' },
        { status: 400 }
      )
    }

    if (!isDiscountType(discountType)) {
      return NextResponse.json(
        { error: 'Discount type must be percent, fixed_amount, unit_price, or stepped.' },
        { status: 400 }
      )
    }

    if (discountValueRaw === null || discountValueRaw < 0 || discountValueRaw > 1000000) {
      return NextResponse.json(
        { error: 'Discount value must be between 0 and 1,000,000.' },
        { status: 400 }
      )
    }

    if (discountType === 'percent' && discountValueRaw > 100) {
      return NextResponse.json(
        { error: 'Percent discount cannot exceed 100.' },
        { status: 400 }
      )
    }

    if (discountType === 'stepped') {
      if (stepQtyRaw === null || !Number.isInteger(stepQtyRaw) || stepQtyRaw < 1) {
        return NextResponse.json(
          { error: 'Step quantity must be a positive integer for stepped discounts.' },
          { status: 400 }
        )
      }
    }

    if (sortOrderRaw === null || sortOrderRaw < -10000 || sortOrderRaw > 10000) {
      return NextResponse.json({ error: 'Sort order must be between -10000 and 10000.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_product_bulk_discounts')
      .insert({
        product_id: productId,
        min_qty: minQtyRaw,
        max_qty: maxQtyRaw,
        discount_type: discountType,
        discount_value: Math.round(discountValueRaw * 100) / 100,
        step_qty: discountType === 'stepped' ? Math.trunc(stepQtyRaw!) : null,
        label,
        is_enabled: isEnabled,
        sort_order: Math.trunc(sortOrderRaw),
        updated_at: new Date().toISOString(),
      })
      .select(SELECT_COLUMNS)
      .single()

    if (error || !data) {
      console.error('[admin:catalog:discounts:post]', error?.message)
      await writeAdminAuditLog({
        action: 'catalog.discount.create',
        entityType: 'product_bulk_discount',
        entityId: null,
        route: '/api/admin/catalog/discounts',
        request,
        status: 'failure',
        details: { reason: 'insert_failed', message: error?.message ?? null, productId },
      })
      return NextResponse.json({ error: 'Could not create bulk discount.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'catalog.discount.create',
      entityType: 'product_bulk_discount',
      entityId: data.id,
      route: '/api/admin/catalog/discounts',
      request,
      status: 'success',
      details: { productId, min_qty: data.min_qty, discount_type: data.discount_type },
    })

    return NextResponse.json({ discount: data }, { status: 201 })
  } catch (error) {
    console.error('[admin:catalog:discounts:post]', error)
    await writeAdminAuditLog({
      action: 'catalog.discount.create',
      entityType: 'product_bulk_discount',
      route: '/api/admin/catalog/discounts',
      request,
      status: 'failure',
      details: { reason: 'unexpected_error' },
    })
    return NextResponse.json({ error: 'Could not create bulk discount.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-discount-write',
      maxRequests: 60,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as DiscountBody
    const discountId = asString(body.discountId, 64)
    const minQtyRaw = asNumber(body.min_qty)
    const maxQtyRaw = asOptionalNumber(body.max_qty)
    const discountType = body.discount_type
    const discountValueRaw = asNumber(body.discount_value)
    const stepQtyRaw = asOptionalNumber(body.step_qty)
    const label = asOptionalString(body.label, 120)
    const isEnabled = asBoolean(body.is_enabled, true)
    const sortOrderRaw = asNumber(body.sort_order)

    if (!discountId) {
      return NextResponse.json({ error: 'Discount id is required.' }, { status: 400 })
    }

    if (minQtyRaw === null || !Number.isInteger(minQtyRaw) || minQtyRaw < 1) {
      return NextResponse.json({ error: 'Min quantity must be a positive integer.' }, { status: 400 })
    }

    if (maxQtyRaw !== null && (!Number.isInteger(maxQtyRaw) || maxQtyRaw < minQtyRaw)) {
      return NextResponse.json(
        { error: 'Max quantity must be a positive integer >= min quantity.' },
        { status: 400 }
      )
    }

    if (!isDiscountType(discountType)) {
      return NextResponse.json(
        { error: 'Discount type must be percent, fixed_amount, unit_price, or stepped.' },
        { status: 400 }
      )
    }

    if (discountValueRaw === null || discountValueRaw < 0 || discountValueRaw > 1000000) {
      return NextResponse.json(
        { error: 'Discount value must be between 0 and 1,000,000.' },
        { status: 400 }
      )
    }

    if (discountType === 'percent' && discountValueRaw > 100) {
      return NextResponse.json(
        { error: 'Percent discount cannot exceed 100.' },
        { status: 400 }
      )
    }

    if (discountType === 'stepped') {
      if (stepQtyRaw === null || !Number.isInteger(stepQtyRaw) || stepQtyRaw < 1) {
        return NextResponse.json(
          { error: 'Step quantity must be a positive integer for stepped discounts.' },
          { status: 400 }
        )
      }
    }

    if (sortOrderRaw === null || sortOrderRaw < -10000 || sortOrderRaw > 10000) {
      return NextResponse.json({ error: 'Sort order must be between -10000 and 10000.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_product_bulk_discounts')
      .update({
        min_qty: minQtyRaw,
        max_qty: maxQtyRaw,
        discount_type: discountType,
        discount_value: Math.round(discountValueRaw * 100) / 100,
        step_qty: discountType === 'stepped' ? Math.trunc(stepQtyRaw!) : null,
        label,
        is_enabled: isEnabled,
        sort_order: Math.trunc(sortOrderRaw),
        updated_at: new Date().toISOString(),
      })
      .eq('id', discountId)
      .select(SELECT_COLUMNS)
      .single()

    if (error || !data) {
      console.error('[admin:catalog:discounts:put]', error?.message)
      await writeAdminAuditLog({
        action: 'catalog.discount.edit',
        entityType: 'product_bulk_discount',
        entityId: discountId,
        route: '/api/admin/catalog/discounts',
        request,
        status: 'failure',
        details: { reason: 'update_failed', message: error?.message ?? null },
      })
      return NextResponse.json({ error: 'Could not update bulk discount.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'catalog.discount.edit',
      entityType: 'product_bulk_discount',
      entityId: data.id,
      route: '/api/admin/catalog/discounts',
      request,
      status: 'success',
      details: { productId: data.product_id, min_qty: data.min_qty, discount_type: data.discount_type },
    })

    return NextResponse.json({ discount: data }, { status: 200 })
  } catch (error) {
    console.error('[admin:catalog:discounts:put]', error)
    await writeAdminAuditLog({
      action: 'catalog.discount.edit',
      entityType: 'product_bulk_discount',
      route: '/api/admin/catalog/discounts',
      request,
      status: 'failure',
      details: { reason: 'unexpected_error' },
    })
    return NextResponse.json({ error: 'Could not update bulk discount.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-discount-write',
      maxRequests: 60,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as DiscountBody
    const discountId = asString(body.discountId, 64)
    const confirmAction = asString(body.confirmAction, 60)

    if (!discountId) {
      return NextResponse.json({ error: 'Discount id is required.' }, { status: 400 })
    }

    if (confirmAction !== 'delete_discount') {
      return NextResponse.json({ error: 'Missing destructive action confirmation.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_product_bulk_discounts')
      .delete()
      .eq('id', discountId)
      .select('id, product_id, min_qty, discount_type')
      .single()

    if (error) {
      console.error('[admin:catalog:discounts:delete]', error.message)
      await writeAdminAuditLog({
        action: 'catalog.discount.delete',
        entityType: 'product_bulk_discount',
        entityId: discountId,
        route: '/api/admin/catalog/discounts',
        request,
        status: 'failure',
        details: { reason: 'delete_failed', message: error.message },
      })
      return NextResponse.json({ error: 'Could not delete bulk discount.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'catalog.discount.delete',
      entityType: 'product_bulk_discount',
      entityId: discountId,
      route: '/api/admin/catalog/discounts',
      request,
      status: 'success',
      details: {
        productId: data?.product_id ?? null,
        min_qty: data?.min_qty ?? null,
        discount_type: data?.discount_type ?? null,
      },
    })

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('[admin:catalog:discounts:delete]', error)
    await writeAdminAuditLog({
      action: 'catalog.discount.delete',
      entityType: 'product_bulk_discount',
      route: '/api/admin/catalog/discounts',
      request,
      status: 'failure',
      details: { reason: 'unexpected_error' },
    })
    return NextResponse.json({ error: 'Could not delete bulk discount.' }, { status: 500 })
  }
}
