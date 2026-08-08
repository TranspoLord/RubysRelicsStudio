import { NextResponse } from 'next/server'

import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { sanitizeSearchQuery } from '@/lib/validate'

const TRIGGER_TYPES = ['automatic', 'code'] as const

type BundleTriggerType = (typeof TRIGGER_TYPES)[number]

interface BundleDealBody {
  dealId?: unknown
  name?: unknown
  description?: unknown
  trigger_type?: unknown
  code?: unknown
  conditions_json?: unknown
  rewards_json?: unknown
  is_active?: unknown
  is_stackable?: unknown
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

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  return fallback
}

function asOptionalInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null
  return n
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

function isTriggerType(value: unknown): value is BundleTriggerType {
  return typeof value === 'string' && (TRIGGER_TYPES as readonly string[]).includes(value)
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

const SELECT_COLUMNS =
  'id, name, description, trigger_type, code, conditions_json, rewards_json, is_active, is_stackable, usage_limit, usage_count, valid_from, valid_to, created_at, updated_at'

export async function GET(request: Request) {
  try {
    const auth = await requireAdminApiSession(request)
    if (!auth.ok) return auth.response

    const url = new URL(request.url)
    const query = sanitizeSearchQuery(asString(url.searchParams.get('q'), 80)) ?? ''

    const supabase = getSupabaseAdmin()
    let builder = supabase
      .from('exp_bundle_deals')
      .select(SELECT_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(250)

    if (query.length > 0) {
      builder = builder.or(`name.ilike.%${query}%,description.ilike.%${query}%,code.ilike.%${query}%`)
    }

    const { data, error } = await builder

    if (error) {
      console.error('[admin:catalog:bundle-deals:get]', error.message)
      return NextResponse.json({ error: 'Could not load bundle deals.' }, { status: 500 })
    }

    return NextResponse.json({ bundleDeals: data ?? [] }, { status: 200 })
  } catch (error) {
    console.error('[admin:catalog:bundle-deals:get]', error)
    return NextResponse.json({ error: 'Could not load bundle deals.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-bundle-deal-write',
      maxRequests: 60,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as BundleDealBody
    const name = asString(body.name, 140)
    const description = asString(body.description, 500)
    const triggerType = body.trigger_type
    const code = normalizeCode(asString(body.code, 40))
    const conditions = asObject(body.conditions_json)
    const rewards = asObject(body.rewards_json)
    const isActive = asBoolean(body.is_active, true)
    const isStackable = asBoolean(body.is_stackable, true)
    const usageLimit = asOptionalInt(body.usage_limit)
    const validFrom = asIsoOrNull(body.valid_from)
    const validTo = asIsoOrNull(body.valid_to)

    if (name.length < 2) {
      return NextResponse.json({ error: 'Deal name is required.' }, { status: 400 })
    }

    if (!isTriggerType(triggerType)) {
      return NextResponse.json({ error: 'Invalid trigger type.' }, { status: 400 })
    }

    if (triggerType === 'code' && !code) {
      return NextResponse.json({ error: 'Code is required when trigger type is code.' }, { status: 400 })
    }

    if (usageLimit !== null && usageLimit < 1) {
      return NextResponse.json({ error: 'Usage limit must be null or at least 1.' }, { status: 400 })
    }

    if (validFrom && validTo && new Date(validFrom).getTime() > new Date(validTo).getTime()) {
      return NextResponse.json({ error: 'valid_from must be before valid_to.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_bundle_deals')
      .insert({
        name,
        description,
        trigger_type: triggerType,
        code: triggerType === 'code' ? code : null,
        conditions_json: conditions,
        rewards_json: rewards,
        is_active: isActive,
        is_stackable: isStackable,
        usage_limit: usageLimit,
        valid_from: validFrom,
        valid_to: validTo,
      })
      .select(SELECT_COLUMNS)
      .single()

    if (error || !data) {
      await writeAdminAuditLog({
        action: 'catalog.bundle_deal.create',
        entityType: 'bundle_deal',
        route: '/api/admin/catalog/bundle-deals',
        request,
        status: 'failure',
        details: { reason: 'insert_failed', message: error?.message ?? null, name },
      })
      const isUniqueViolation = error?.code === '23505'
      return NextResponse.json({ error: isUniqueViolation ? 'Deal code already exists.' : 'Could not create bundle deal.' }, { status: isUniqueViolation ? 409 : 500 })
    }

    await writeAdminAuditLog({
      action: 'catalog.bundle_deal.create',
      entityType: 'bundle_deal',
      entityId: data.id,
      route: '/api/admin/catalog/bundle-deals',
      request,
      status: 'success',
      details: { trigger_type: data.trigger_type, code: data.code, name: data.name },
    })

    return NextResponse.json({ bundleDeal: data }, { status: 201 })
  } catch (error) {
    console.error('[admin:catalog:bundle-deals:post]', error)
    await writeAdminAuditLog({
      action: 'catalog.bundle_deal.create',
      entityType: 'bundle_deal',
      route: '/api/admin/catalog/bundle-deals',
      request,
      status: 'failure',
      details: { reason: 'unexpected_error' },
    })
    return NextResponse.json({ error: 'Could not create bundle deal.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-bundle-deal-write',
      maxRequests: 60,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as BundleDealBody
    const dealId = asString(body.dealId, 64)
    const name = asString(body.name, 140)
    const description = asString(body.description, 500)
    const triggerType = body.trigger_type
    const code = normalizeCode(asString(body.code, 40))
    const conditions = asObject(body.conditions_json)
    const rewards = asObject(body.rewards_json)
    const isActive = asBoolean(body.is_active, true)
    const isStackable = asBoolean(body.is_stackable, true)
    const usageLimit = asOptionalInt(body.usage_limit)
    const validFrom = asIsoOrNull(body.valid_from)
    const validTo = asIsoOrNull(body.valid_to)

    if (!dealId) {
      return NextResponse.json({ error: 'Deal id is required.' }, { status: 400 })
    }

    if (name.length < 2) {
      return NextResponse.json({ error: 'Deal name is required.' }, { status: 400 })
    }

    if (!isTriggerType(triggerType)) {
      return NextResponse.json({ error: 'Invalid trigger type.' }, { status: 400 })
    }

    if (triggerType === 'code' && !code) {
      return NextResponse.json({ error: 'Code is required when trigger type is code.' }, { status: 400 })
    }

    if (usageLimit !== null && usageLimit < 1) {
      return NextResponse.json({ error: 'Usage limit must be null or at least 1.' }, { status: 400 })
    }

    if (validFrom && validTo && new Date(validFrom).getTime() > new Date(validTo).getTime()) {
      return NextResponse.json({ error: 'valid_from must be before valid_to.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_bundle_deals')
      .update({
        name,
        description,
        trigger_type: triggerType,
        code: triggerType === 'code' ? code : null,
        conditions_json: conditions,
        rewards_json: rewards,
        is_active: isActive,
        is_stackable: isStackable,
        usage_limit: usageLimit,
        valid_from: validFrom,
        valid_to: validTo,
      })
      .eq('id', dealId)
      .select(SELECT_COLUMNS)
      .single()

    if (error || !data) {
      await writeAdminAuditLog({
        action: 'catalog.bundle_deal.edit',
        entityType: 'bundle_deal',
        entityId: dealId,
        route: '/api/admin/catalog/bundle-deals',
        request,
        status: 'failure',
        details: { reason: 'update_failed', message: error?.message ?? null },
      })
      const isUniqueViolation = error?.code === '23505'
      return NextResponse.json({ error: isUniqueViolation ? 'Deal code already exists.' : 'Could not update bundle deal.' }, { status: isUniqueViolation ? 409 : 500 })
    }

    await writeAdminAuditLog({
      action: 'catalog.bundle_deal.edit',
      entityType: 'bundle_deal',
      entityId: data.id,
      route: '/api/admin/catalog/bundle-deals',
      request,
      status: 'success',
      details: { trigger_type: data.trigger_type, code: data.code, name: data.name, is_active: data.is_active },
    })

    return NextResponse.json({ bundleDeal: data }, { status: 200 })
  } catch (error) {
    console.error('[admin:catalog:bundle-deals:put]', error)
    await writeAdminAuditLog({
      action: 'catalog.bundle_deal.edit',
      entityType: 'bundle_deal',
      route: '/api/admin/catalog/bundle-deals',
      request,
      status: 'failure',
      details: { reason: 'unexpected_error' },
    })
    return NextResponse.json({ error: 'Could not update bundle deal.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-bundle-deal-write',
      maxRequests: 60,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as BundleDealBody
    const dealId = asString(body.dealId, 64)
    const confirmAction = asString(body.confirmAction, 80)

    if (!dealId) {
      return NextResponse.json({ error: 'Deal id is required.' }, { status: 400 })
    }

    if (confirmAction !== 'delete_bundle_deal') {
      return NextResponse.json({ error: 'Missing destructive action confirmation.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_bundle_deals')
      .delete()
      .eq('id', dealId)
      .select('id, name, code')
      .single()

    if (error || !data) {
      await writeAdminAuditLog({
        action: 'catalog.bundle_deal.delete',
        entityType: 'bundle_deal',
        entityId: dealId,
        route: '/api/admin/catalog/bundle-deals',
        request,
        status: 'failure',
        details: { reason: 'delete_failed', message: error?.message ?? null },
      })
      return NextResponse.json({ error: 'Could not delete bundle deal.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'catalog.bundle_deal.delete',
      entityType: 'bundle_deal',
      entityId: data.id,
      route: '/api/admin/catalog/bundle-deals',
      request,
      status: 'success',
      details: { name: data.name, code: data.code },
    })

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('[admin:catalog:bundle-deals:delete]', error)
    await writeAdminAuditLog({
      action: 'catalog.bundle_deal.delete',
      entityType: 'bundle_deal',
      route: '/api/admin/catalog/bundle-deals',
      request,
      status: 'failure',
      details: { reason: 'unexpected_error' },
    })
    return NextResponse.json({ error: 'Could not delete bundle deal.' }, { status: 500 })
  }
}
