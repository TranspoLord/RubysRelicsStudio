import { NextResponse } from 'next/server'

import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getSupabaseAdmin } from '@/lib/supabase/client'

const DISCOUNT_TYPES = ['percent', 'fixed_amount', 'free_shipping'] as const

type PromoDiscountType = (typeof DISCOUNT_TYPES)[number]

interface PromoBody {
  promoId?: unknown
  code?: unknown
  description?: unknown
  discount_type?: unknown
  discount_value?: unknown
  is_active?: unknown
  usage_limit?: unknown
  valid_from?: unknown
  valid_to?: unknown
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

function asOptionalInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null
  return n
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  return fallback
}

function asIsoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 40)
}

function isDiscountType(value: unknown): value is PromoDiscountType {
  return typeof value === 'string' && (DISCOUNT_TYPES as readonly string[]).includes(value)
}

const SELECT_COLUMNS =
  'id, code, description, discount_type, discount_value, is_active, usage_limit, usage_count, valid_from, valid_to, created_at, updated_at'

export async function GET(request: Request) {
  try {
    const auth = await requireAdminApiSession(request)
    if (!auth.ok) return auth.response

    const url = new URL(request.url)
    const query = asString(url.searchParams.get('q'), 80)

    const supabase = getSupabaseAdmin()
    let builder = supabase
      .from('exp_promo_codes')
      .select(SELECT_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(250)

    if (query.length > 0) {
      builder = builder.or(`code.ilike.%${query}%,description.ilike.%${query}%`)
    }

    const { data, error } = await builder

    if (error) {
      console.error('[admin:catalog:promo-codes:get]', error.message)
      return NextResponse.json({ error: 'Could not load promo codes.' }, { status: 500 })
    }

    return NextResponse.json({ promoCodes: data ?? [] }, { status: 200 })
  } catch (error) {
    console.error('[admin:catalog:promo-codes:get]', error)
    return NextResponse.json({ error: 'Could not load promo codes.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-promo-write',
      maxRequests: 60,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as PromoBody
    const code = normalizeCode(asString(body.code, 40))
    const description = asString(body.description, 280)
    const discountType = body.discount_type
    const discountValueRaw = asNumber(body.discount_value)
    const isActive = asBoolean(body.is_active, true)
    const usageLimit = asOptionalInt(body.usage_limit)
    const validFrom = asIsoOrNull(body.valid_from)
    const validTo = asIsoOrNull(body.valid_to)

    if (!code) {
      return NextResponse.json({ error: 'Promo code is required.' }, { status: 400 })
    }

    if (!isDiscountType(discountType)) {
      return NextResponse.json({ error: 'Invalid discount type.' }, { status: 400 })
    }

    if (discountValueRaw === null || discountValueRaw < 0 || discountValueRaw > 1000000) {
      return NextResponse.json({ error: 'Discount value must be between 0 and 1,000,000.' }, { status: 400 })
    }

    if (discountType === 'percent' && discountValueRaw > 100) {
      return NextResponse.json({ error: 'Percent discount cannot exceed 100.' }, { status: 400 })
    }

    if (usageLimit !== null && usageLimit < 1) {
      return NextResponse.json({ error: 'Usage limit must be null or at least 1.' }, { status: 400 })
    }

    if (validFrom && validTo && new Date(validFrom).getTime() > new Date(validTo).getTime()) {
      return NextResponse.json({ error: 'valid_from must be before valid_to.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_promo_codes')
      .insert({
        code,
        description,
        discount_type: discountType,
        discount_value: Math.round(discountValueRaw * 100) / 100,
        is_active: isActive,
        usage_limit: usageLimit,
        valid_from: validFrom,
        valid_to: validTo,
      })
      .select(SELECT_COLUMNS)
      .single()

    if (error || !data) {
      await writeAdminAuditLog({
        action: 'catalog.promo_code.create',
        entityType: 'promo_code',
        route: '/api/admin/catalog/promo-codes',
        request,
        status: 'failure',
        details: { reason: 'insert_failed', message: error?.message ?? null, code },
      })
      const isUniqueViolation = error?.code === '23505'
      return NextResponse.json({ error: isUniqueViolation ? 'Promo code already exists.' : 'Could not create promo code.' }, { status: isUniqueViolation ? 409 : 500 })
    }

    await writeAdminAuditLog({
      action: 'catalog.promo_code.create',
      entityType: 'promo_code',
      entityId: data.id,
      route: '/api/admin/catalog/promo-codes',
      request,
      status: 'success',
      details: { code: data.code, discount_type: data.discount_type },
    })

    return NextResponse.json({ promoCode: data }, { status: 201 })
  } catch (error) {
    console.error('[admin:catalog:promo-codes:post]', error)
    await writeAdminAuditLog({
      action: 'catalog.promo_code.create',
      entityType: 'promo_code',
      route: '/api/admin/catalog/promo-codes',
      request,
      status: 'failure',
      details: { reason: 'unexpected_error' },
    })
    return NextResponse.json({ error: 'Could not create promo code.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-promo-write',
      maxRequests: 60,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as PromoBody
    const promoId = asString(body.promoId, 64)
    const code = normalizeCode(asString(body.code, 40))
    const description = asString(body.description, 280)
    const discountType = body.discount_type
    const discountValueRaw = asNumber(body.discount_value)
    const isActive = asBoolean(body.is_active, true)
    const usageLimit = asOptionalInt(body.usage_limit)
    const validFrom = asIsoOrNull(body.valid_from)
    const validTo = asIsoOrNull(body.valid_to)

    if (!promoId) {
      return NextResponse.json({ error: 'Promo id is required.' }, { status: 400 })
    }

    if (!code) {
      return NextResponse.json({ error: 'Promo code is required.' }, { status: 400 })
    }

    if (!isDiscountType(discountType)) {
      return NextResponse.json({ error: 'Invalid discount type.' }, { status: 400 })
    }

    if (discountValueRaw === null || discountValueRaw < 0 || discountValueRaw > 1000000) {
      return NextResponse.json({ error: 'Discount value must be between 0 and 1,000,000.' }, { status: 400 })
    }

    if (discountType === 'percent' && discountValueRaw > 100) {
      return NextResponse.json({ error: 'Percent discount cannot exceed 100.' }, { status: 400 })
    }

    if (usageLimit !== null && usageLimit < 1) {
      return NextResponse.json({ error: 'Usage limit must be null or at least 1.' }, { status: 400 })
    }

    if (validFrom && validTo && new Date(validFrom).getTime() > new Date(validTo).getTime()) {
      return NextResponse.json({ error: 'valid_from must be before valid_to.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_promo_codes')
      .update({
        code,
        description,
        discount_type: discountType,
        discount_value: Math.round(discountValueRaw * 100) / 100,
        is_active: isActive,
        usage_limit: usageLimit,
        valid_from: validFrom,
        valid_to: validTo,
      })
      .eq('id', promoId)
      .select(SELECT_COLUMNS)
      .single()

    if (error || !data) {
      await writeAdminAuditLog({
        action: 'catalog.promo_code.edit',
        entityType: 'promo_code',
        entityId: promoId,
        route: '/api/admin/catalog/promo-codes',
        request,
        status: 'failure',
        details: { reason: 'update_failed', message: error?.message ?? null },
      })
      const isUniqueViolation = error?.code === '23505'
      return NextResponse.json({ error: isUniqueViolation ? 'Promo code already exists.' : 'Could not update promo code.' }, { status: isUniqueViolation ? 409 : 500 })
    }

    await writeAdminAuditLog({
      action: 'catalog.promo_code.edit',
      entityType: 'promo_code',
      entityId: data.id,
      route: '/api/admin/catalog/promo-codes',
      request,
      status: 'success',
      details: { code: data.code, discount_type: data.discount_type, is_active: data.is_active },
    })

    return NextResponse.json({ promoCode: data }, { status: 200 })
  } catch (error) {
    console.error('[admin:catalog:promo-codes:put]', error)
    await writeAdminAuditLog({
      action: 'catalog.promo_code.edit',
      entityType: 'promo_code',
      route: '/api/admin/catalog/promo-codes',
      request,
      status: 'failure',
      details: { reason: 'unexpected_error' },
    })
    return NextResponse.json({ error: 'Could not update promo code.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-promo-write',
      maxRequests: 60,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as PromoBody
    const promoId = asString(body.promoId, 64)
    const confirmAction = asString(body.confirmAction, 80)

    if (!promoId) {
      return NextResponse.json({ error: 'Promo id is required.' }, { status: 400 })
    }

    if (confirmAction !== 'delete_promo_code') {
      return NextResponse.json({ error: 'Missing destructive action confirmation.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_promo_codes')
      .delete()
      .eq('id', promoId)
      .select('id, code')
      .single()

    if (error || !data) {
      await writeAdminAuditLog({
        action: 'catalog.promo_code.delete',
        entityType: 'promo_code',
        entityId: promoId,
        route: '/api/admin/catalog/promo-codes',
        request,
        status: 'failure',
        details: { reason: 'delete_failed', message: error?.message ?? null },
      })
      return NextResponse.json({ error: 'Could not delete promo code.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'catalog.promo_code.delete',
      entityType: 'promo_code',
      entityId: data.id,
      route: '/api/admin/catalog/promo-codes',
      request,
      status: 'success',
      details: { code: data.code },
    })

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('[admin:catalog:promo-codes:delete]', error)
    await writeAdminAuditLog({
      action: 'catalog.promo_code.delete',
      entityType: 'promo_code',
      route: '/api/admin/catalog/promo-codes',
      request,
      status: 'failure',
      details: { reason: 'unexpected_error' },
    })
    return NextResponse.json({ error: 'Could not delete promo code.' }, { status: 500 })
  }
}
