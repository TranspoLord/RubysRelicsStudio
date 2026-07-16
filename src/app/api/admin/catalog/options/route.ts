import { NextResponse } from 'next/server'

import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getSupabaseAdmin } from '@/lib/supabase/client'

type ProductOptionType = 'select' | 'text' | 'textarea' | 'file' | 'checkbox' | 'number'

interface OptionBody {
  productId?: unknown
  optionId?: unknown
  option_key?: unknown
  label?: unknown
  option_type?: unknown
  placeholder?: unknown
  help_text?: unknown
  is_required?: unknown
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

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return n
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  return fallback
}

function asOptionType(value: unknown): ProductOptionType | null {
  if (value === 'select' || value === 'text' || value === 'textarea' || value === 'file' || value === 'checkbox' || value === 'number') {
    return value
  }
  return null
}

function normalizeOptionKey(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
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
      .from('exp_product_options')
      .select(`
        id,
        product_id,
        option_key,
        label,
        option_type,
        placeholder,
        help_text,
        is_required,
        sort_order,
        values:exp_product_option_values (
          id,
          option_id,
          label,
          value,
          price_delta,
          is_enabled,
          sort_order
        )
      `)
      .eq('product_id', productId)
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('[admin:catalog:options:get]', error.message)
      return NextResponse.json({ error: 'Could not load product options.' }, { status: 500 })
    }

    const options = (data ?? []).map((option) => ({
      ...option,
      values: (option.values ?? []).slice().sort((a, b) => a.sort_order - b.sort_order),
    }))

    return NextResponse.json({ options }, { status: 200 })
  } catch (error) {
    console.error('[admin:catalog:options:get]', error)
    return NextResponse.json({ error: 'Could not load product options.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-option-write',
      maxRequests: 60,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as OptionBody
    const productId = asString(body.productId, 64)
    const optionKey = normalizeOptionKey(asString(body.option_key, 80))
    const label = asString(body.label, 120)
    const optionType = asOptionType(body.option_type)
    const placeholder = asOptionalString(body.placeholder, 180)
    const helpText = asOptionalString(body.help_text, 500)
    const isRequired = asBoolean(body.is_required, false)
    const sortOrder = Math.trunc(asNumber(body.sort_order ?? 0, 0))

    if (!productId) {
      return NextResponse.json({ error: 'Product id is required.' }, { status: 400 })
    }

    if (!optionKey || optionKey.length < 2) {
      return NextResponse.json({ error: 'Option key is required and must be at least 2 characters.' }, { status: 400 })
    }

    if (!label || label.length < 2) {
      return NextResponse.json({ error: 'Option label is required.' }, { status: 400 })
    }

    if (!optionType) {
      return NextResponse.json({ error: 'Option type is invalid.' }, { status: 400 })
    }

    if (sortOrder < -10000 || sortOrder > 10000) {
      return NextResponse.json({ error: 'Sort order must be between -10000 and 10000.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: existingRows, error: existingError } = await supabase
      .from('exp_product_options')
      .select('id')
      .eq('product_id', productId)
      .eq('option_key', optionKey)
      .limit(1)

    if (existingError) {
      console.error('[admin:catalog:options:post:key-check]', existingError.message)
      return NextResponse.json({ error: 'Could not validate option key uniqueness.' }, { status: 500 })
    }

    if ((existingRows ?? []).length > 0) {
      return NextResponse.json({ error: 'Option key is already in use for this product.' }, { status: 409 })
    }

    const { data, error } = await supabase
      .from('exp_product_options')
      .insert({
        product_id: productId,
        option_key: optionKey,
        label,
        option_type: optionType,
        placeholder: optionType === 'select' || optionType === 'checkbox' ? null : placeholder,
        help_text: helpText,
        is_required: isRequired,
        sort_order: sortOrder,
      })
      .select('id, product_id, option_key, label, option_type, placeholder, help_text, is_required, sort_order')
      .single()

    if (error || !data) {
      console.error('[admin:catalog:options:post]', error?.message)
      await writeAdminAuditLog({
        action: 'catalog.option.create',
        entityType: 'product_option',
        route: '/api/admin/catalog/options',
        request,
        status: 'failure',
        details: { reason: 'insert_failed', message: error?.message ?? null, productId, optionKey },
      })
      return NextResponse.json({ error: 'Could not create product option.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'catalog.option.create',
      entityType: 'product_option',
      entityId: data.id,
      route: '/api/admin/catalog/options',
      request,
      status: 'success',
      details: { productId: data.product_id, option_key: data.option_key, option_type: data.option_type },
    })

    return NextResponse.json({ option: data }, { status: 201 })
  } catch (error) {
    console.error('[admin:catalog:options:post]', error)
    await writeAdminAuditLog({
      action: 'catalog.option.create',
      entityType: 'product_option',
      route: '/api/admin/catalog/options',
      request,
      status: 'failure',
      details: { reason: 'unexpected_error' },
    })
    return NextResponse.json({ error: 'Could not create product option.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-option-write',
      maxRequests: 60,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as OptionBody
    const optionId = asString(body.optionId, 64)
    const optionKey = normalizeOptionKey(asString(body.option_key, 80))
    const label = asString(body.label, 120)
    const optionType = asOptionType(body.option_type)
    const placeholder = asOptionalString(body.placeholder, 180)
    const helpText = asOptionalString(body.help_text, 500)
    const isRequired = asBoolean(body.is_required, false)
    const sortOrder = Math.trunc(asNumber(body.sort_order ?? 0, 0))

    if (!optionId) {
      return NextResponse.json({ error: 'Option id is required.' }, { status: 400 })
    }

    if (!optionKey || optionKey.length < 2) {
      return NextResponse.json({ error: 'Option key is required and must be at least 2 characters.' }, { status: 400 })
    }

    if (!label || label.length < 2) {
      return NextResponse.json({ error: 'Option label is required.' }, { status: 400 })
    }

    if (!optionType) {
      return NextResponse.json({ error: 'Option type is invalid.' }, { status: 400 })
    }

    if (sortOrder < -10000 || sortOrder > 10000) {
      return NextResponse.json({ error: 'Sort order must be between -10000 and 10000.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: optionRow, error: optionRowError } = await supabase
      .from('exp_product_options')
      .select('id, product_id')
      .eq('id', optionId)
      .single()

    if (optionRowError || !optionRow) {
      return NextResponse.json({ error: 'Option was not found.' }, { status: 404 })
    }

    const { data: existingRows, error: existingError } = await supabase
      .from('exp_product_options')
      .select('id')
      .eq('product_id', optionRow.product_id)
      .eq('option_key', optionKey)
      .neq('id', optionId)
      .limit(1)

    if (existingError) {
      console.error('[admin:catalog:options:put:key-check]', existingError.message)
      return NextResponse.json({ error: 'Could not validate option key uniqueness.' }, { status: 500 })
    }

    if ((existingRows ?? []).length > 0) {
      return NextResponse.json({ error: 'Option key is already in use for this product.' }, { status: 409 })
    }

    const { data, error } = await supabase
      .from('exp_product_options')
      .update({
        option_key: optionKey,
        label,
        option_type: optionType,
        placeholder: optionType === 'select' || optionType === 'checkbox' ? null : placeholder,
        help_text: helpText,
        is_required: isRequired,
        sort_order: sortOrder,
      })
      .eq('id', optionId)
      .select('id, product_id, option_key, label, option_type, placeholder, help_text, is_required, sort_order')
      .single()

    if (error || !data) {
      console.error('[admin:catalog:options:put]', error?.message)
      await writeAdminAuditLog({
        action: 'catalog.option.edit',
        entityType: 'product_option',
        entityId: optionId,
        route: '/api/admin/catalog/options',
        request,
        status: 'failure',
        details: { reason: 'update_failed', message: error?.message ?? null },
      })
      return NextResponse.json({ error: 'Could not update product option.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'catalog.option.edit',
      entityType: 'product_option',
      entityId: data.id,
      route: '/api/admin/catalog/options',
      request,
      status: 'success',
      details: { productId: data.product_id, option_key: data.option_key, option_type: data.option_type },
    })

    return NextResponse.json({ option: data }, { status: 200 })
  } catch (error) {
    console.error('[admin:catalog:options:put]', error)
    await writeAdminAuditLog({
      action: 'catalog.option.edit',
      entityType: 'product_option',
      route: '/api/admin/catalog/options',
      request,
      status: 'failure',
      details: { reason: 'unexpected_error' },
    })
    return NextResponse.json({ error: 'Could not update product option.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-option-write',
      maxRequests: 60,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as OptionBody
    const optionId = asString(body.optionId, 64)
    const confirmAction = asString(body.confirmAction, 80)

    if (!optionId) {
      return NextResponse.json({ error: 'Option id is required.' }, { status: 400 })
    }

    if (confirmAction !== 'delete_option') {
      return NextResponse.json({ error: 'Missing destructive action confirmation.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_product_options')
      .delete()
      .eq('id', optionId)
      .select('id, product_id, option_key')
      .single()

    if (error || !data) {
      console.error('[admin:catalog:options:delete]', error?.message)
      await writeAdminAuditLog({
        action: 'catalog.option.delete',
        entityType: 'product_option',
        entityId: optionId,
        route: '/api/admin/catalog/options',
        request,
        status: 'failure',
        details: { reason: 'delete_failed', message: error?.message ?? null },
      })
      return NextResponse.json({ error: 'Could not delete product option.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'catalog.option.delete',
      entityType: 'product_option',
      entityId: data.id,
      route: '/api/admin/catalog/options',
      request,
      status: 'success',
      details: { productId: data.product_id, option_key: data.option_key },
    })

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('[admin:catalog:options:delete]', error)
    await writeAdminAuditLog({
      action: 'catalog.option.delete',
      entityType: 'product_option',
      route: '/api/admin/catalog/options',
      request,
      status: 'failure',
      details: { reason: 'unexpected_error' },
    })
    return NextResponse.json({ error: 'Could not delete product option.' }, { status: 500 })
  }
}