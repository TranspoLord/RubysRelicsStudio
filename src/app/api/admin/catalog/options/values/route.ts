import { NextResponse } from 'next/server'

import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getSupabaseAdmin } from '@/lib/supabase/client'

interface OptionValueBody {
  optionId?: unknown
  optionValueId?: unknown
  label?: unknown
  value?: unknown
  price_delta?: unknown
  is_enabled?: unknown
  sort_order?: unknown
  confirmAction?: unknown
}

function asString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
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

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-option-value-write',
      maxRequests: 80,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as OptionValueBody
    const optionId = asString(body.optionId, 64)
    const label = asString(body.label, 120)
    const value = asString(body.value, 120)
    const priceDeltaRaw = asNumber(body.price_delta)
    const isEnabled = asBoolean(body.is_enabled, true)
    const sortOrderRaw = asNumber(body.sort_order)

    if (!optionId) {
      return NextResponse.json({ error: 'Option id is required.' }, { status: 400 })
    }

    if (!label || label.length < 1) {
      return NextResponse.json({ error: 'Option value label is required.' }, { status: 400 })
    }

    if (!value || value.length < 1) {
      return NextResponse.json({ error: 'Option value is required.' }, { status: 400 })
    }

    if (priceDeltaRaw === null || priceDeltaRaw < -100000 || priceDeltaRaw > 100000) {
      return NextResponse.json({ error: 'Price delta must be between -100000 and 100000.' }, { status: 400 })
    }

    if (sortOrderRaw === null || sortOrderRaw < -10000 || sortOrderRaw > 10000) {
      return NextResponse.json({ error: 'Sort order must be between -10000 and 10000.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: existingRows, error: existingError } = await supabase
      .from('exp_product_option_values')
      .select('id')
      .eq('option_id', optionId)
      .eq('value', value)
      .limit(1)

    if (existingError) {
      console.error('[admin:catalog:option-values:post:value-check]', existingError.message)
      return NextResponse.json({ error: 'Could not validate option value uniqueness.' }, { status: 500 })
    }

    if ((existingRows ?? []).length > 0) {
      return NextResponse.json({ error: 'Option value already exists for this option.' }, { status: 409 })
    }

    const { data, error } = await supabase
      .from('exp_product_option_values')
      .insert({
        option_id: optionId,
        label,
        value,
        price_delta: Math.round(priceDeltaRaw * 100) / 100,
        is_enabled: isEnabled,
        sort_order: Math.trunc(sortOrderRaw),
      })
      .select('id, option_id, label, value, price_delta, is_enabled, sort_order')
      .single()

    if (error || !data) {
      console.error('[admin:catalog:option-values:post]', error?.message)
      await writeAdminAuditLog({
        action: 'catalog.option_value.create',
        entityType: 'product_option_value',
        route: '/api/admin/catalog/options/values',
        request,
        status: 'failure',
        details: { reason: 'insert_failed', message: error?.message ?? null, optionId },
      })
      return NextResponse.json({ error: 'Could not create option value.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'catalog.option_value.create',
      entityType: 'product_option_value',
      entityId: data.id,
      route: '/api/admin/catalog/options/values',
      request,
      status: 'success',
      details: { optionId: data.option_id, value: data.value },
    })

    return NextResponse.json({ optionValue: data }, { status: 201 })
  } catch (error) {
    console.error('[admin:catalog:option-values:post]', error)
    await writeAdminAuditLog({
      action: 'catalog.option_value.create',
      entityType: 'product_option_value',
      route: '/api/admin/catalog/options/values',
      request,
      status: 'failure',
      details: { reason: 'unexpected_error' },
    })
    return NextResponse.json({ error: 'Could not create option value.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-option-value-write',
      maxRequests: 80,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as OptionValueBody
    const optionValueId = asString(body.optionValueId, 64)
    const label = asString(body.label, 120)
    const value = asString(body.value, 120)
    const priceDeltaRaw = asNumber(body.price_delta)
    const isEnabled = asBoolean(body.is_enabled, true)
    const sortOrderRaw = asNumber(body.sort_order)

    if (!optionValueId) {
      return NextResponse.json({ error: 'Option value id is required.' }, { status: 400 })
    }

    if (!label || label.length < 1) {
      return NextResponse.json({ error: 'Option value label is required.' }, { status: 400 })
    }

    if (!value || value.length < 1) {
      return NextResponse.json({ error: 'Option value is required.' }, { status: 400 })
    }

    if (priceDeltaRaw === null || priceDeltaRaw < -100000 || priceDeltaRaw > 100000) {
      return NextResponse.json({ error: 'Price delta must be between -100000 and 100000.' }, { status: 400 })
    }

    if (sortOrderRaw === null || sortOrderRaw < -10000 || sortOrderRaw > 10000) {
      return NextResponse.json({ error: 'Sort order must be between -10000 and 10000.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: currentRow, error: currentRowError } = await supabase
      .from('exp_product_option_values')
      .select('id, option_id')
      .eq('id', optionValueId)
      .single()

    if (currentRowError || !currentRow) {
      return NextResponse.json({ error: 'Option value was not found.' }, { status: 404 })
    }

    const { data: existingRows, error: existingError } = await supabase
      .from('exp_product_option_values')
      .select('id')
      .eq('option_id', currentRow.option_id)
      .eq('value', value)
      .neq('id', optionValueId)
      .limit(1)

    if (existingError) {
      console.error('[admin:catalog:option-values:put:value-check]', existingError.message)
      return NextResponse.json({ error: 'Could not validate option value uniqueness.' }, { status: 500 })
    }

    if ((existingRows ?? []).length > 0) {
      return NextResponse.json({ error: 'Option value already exists for this option.' }, { status: 409 })
    }

    const { data, error } = await supabase
      .from('exp_product_option_values')
      .update({
        label,
        value,
        price_delta: Math.round(priceDeltaRaw * 100) / 100,
        is_enabled: isEnabled,
        sort_order: Math.trunc(sortOrderRaw),
      })
      .eq('id', optionValueId)
      .select('id, option_id, label, value, price_delta, is_enabled, sort_order')
      .single()

    if (error || !data) {
      console.error('[admin:catalog:option-values:put]', error?.message)
      await writeAdminAuditLog({
        action: 'catalog.option_value.edit',
        entityType: 'product_option_value',
        entityId: optionValueId,
        route: '/api/admin/catalog/options/values',
        request,
        status: 'failure',
        details: { reason: 'update_failed', message: error?.message ?? null },
      })
      return NextResponse.json({ error: 'Could not update option value.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'catalog.option_value.edit',
      entityType: 'product_option_value',
      entityId: data.id,
      route: '/api/admin/catalog/options/values',
      request,
      status: 'success',
      details: { optionId: data.option_id, value: data.value },
    })

    return NextResponse.json({ optionValue: data }, { status: 200 })
  } catch (error) {
    console.error('[admin:catalog:option-values:put]', error)
    await writeAdminAuditLog({
      action: 'catalog.option_value.edit',
      entityType: 'product_option_value',
      route: '/api/admin/catalog/options/values',
      request,
      status: 'failure',
      details: { reason: 'unexpected_error' },
    })
    return NextResponse.json({ error: 'Could not update option value.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-option-value-write',
      maxRequests: 80,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as OptionValueBody
    const optionValueId = asString(body.optionValueId, 64)
    const confirmAction = asString(body.confirmAction, 80)

    if (!optionValueId) {
      return NextResponse.json({ error: 'Option value id is required.' }, { status: 400 })
    }

    if (confirmAction !== 'delete_option_value') {
      return NextResponse.json({ error: 'Missing destructive action confirmation.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_product_option_values')
      .delete()
      .eq('id', optionValueId)
      .select('id, option_id, value')
      .single()

    if (error || !data) {
      console.error('[admin:catalog:option-values:delete]', error?.message)
      await writeAdminAuditLog({
        action: 'catalog.option_value.delete',
        entityType: 'product_option_value',
        entityId: optionValueId,
        route: '/api/admin/catalog/options/values',
        request,
        status: 'failure',
        details: { reason: 'delete_failed', message: error?.message ?? null },
      })
      return NextResponse.json({ error: 'Could not delete option value.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'catalog.option_value.delete',
      entityType: 'product_option_value',
      entityId: data.id,
      route: '/api/admin/catalog/options/values',
      request,
      status: 'success',
      details: { optionId: data.option_id, value: data.value },
    })

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('[admin:catalog:option-values:delete]', error)
    await writeAdminAuditLog({
      action: 'catalog.option_value.delete',
      entityType: 'product_option_value',
      route: '/api/admin/catalog/options/values',
      request,
      status: 'failure',
      details: { reason: 'unexpected_error' },
    })
    return NextResponse.json({ error: 'Could not delete option value.' }, { status: 500 })
  }
}
