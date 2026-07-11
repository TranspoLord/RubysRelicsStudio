import { NextResponse } from 'next/server'

import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getSupabaseAdmin } from '@/lib/supabase/client'

interface ProcessTypeRow {
  key: string
  display_name: string
  slug: string
  emoji: string | null
  visible: boolean
  sort_order: number
}

interface ProcessTypeCreateBody {
  key?: unknown
  display_name?: unknown
  slug?: unknown
  emoji?: unknown
  visible?: unknown
  sort_order?: unknown
}

function asString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

function asBoolean(value: unknown, fallback = true): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isInteger(n) ? n : null
}

function normalizeKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
}

function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdminApiSession(request)
    if (!auth.ok) return auth.response

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_taxonomy')
      .select('key, display_name, slug, emoji, visible, sort_order')
      .eq('type', 'process_type')
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('[admin:catalog:processes:get]', error.message)
      return NextResponse.json({ error: 'Could not load process types.' }, { status: 500 })
    }

    return NextResponse.json({ processTypes: data ?? [] })
  } catch (error) {
    console.error('[admin:catalog:processes:get]', error)
    return NextResponse.json({ error: 'Could not load process types.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-processes-write',
      maxRequests: 30,
      windowMs: 60_000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as ProcessTypeCreateBody
    const keyInput = asString(body.key, 80)
    const displayName = asString(body.display_name, 180)
    const slugInput = asString(body.slug, 120)
    const emoji = asString(body.emoji, 10)
    const visible = asBoolean(body.visible, true)
    const sortOrder = asNumber(body.sort_order)

    const key = normalizeKey(keyInput || displayName)
    const slug = normalizeSlug(slugInput || displayName)

    if (key.length < 2) {
      return NextResponse.json({ error: 'Process key must be at least 2 characters.' }, { status: 400 })
    }

    if (!displayName || displayName.length < 2) {
      return NextResponse.json({ error: 'Display name is required.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Check for duplicate key
    const { data: existingKey } = await supabase
      .from('exp_taxonomy')
      .select('key')
      .eq('key', key)
      .single()

    if (existingKey) {
      return NextResponse.json({ error: 'A process type with this key already exists.' }, { status: 409 })
    }

    const { data, error } = await supabase
      .from('exp_taxonomy')
      .insert({
        key,
        display_name: displayName,
        slug,
        emoji: emoji.length > 0 ? emoji : null,
        visible,
        sort_order: sortOrder ?? 0,
        type: 'process_type',
      })
      .select('key, display_name, slug, emoji, visible, sort_order')
      .single()

    if (error) {
      console.error('[admin:catalog:processes:post]', error.message)
      await writeAdminAuditLog({
        action: 'catalog.process_type.create',
        entityType: 'taxonomy',
        route: '/api/admin/catalog/processes',
        request,
        status: 'failure',
        details: { error: error.message, key, display_name: displayName },
      })
      return NextResponse.json({ error: 'Could not create process type.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'catalog.process_type.create',
      entityType: 'taxonomy',
      entityId: key,
      route: '/api/admin/catalog/processes',
      request,
      status: 'success',
      details: { key, display_name: displayName, slug },
    })

    return NextResponse.json({ processType: data }, { status: 201 })
  } catch (error) {
    console.error('[admin:catalog:processes:post]', error)
    return NextResponse.json({ error: 'Could not create process type.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-processes-write',
      maxRequests: 30,
      windowMs: 60_000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as ProcessTypeCreateBody
    const key = asString(body.key, 80)
    const displayName = asString(body.display_name, 180)
    const slugInput = asString(body.slug, 120)
    const emoji = asString(body.emoji, 10)
    const visible = asBoolean(body.visible, true)
    const sortOrder = asNumber(body.sort_order)

    if (!key) {
      return NextResponse.json({ error: 'Process type key is required.' }, { status: 400 })
    }

    const slug = normalizeSlug(slugInput || displayName)

    const supabase = getSupabaseAdmin()

    const update: Record<string, unknown> = {
      display_name: displayName,
      slug,
      emoji: emoji.length > 0 ? emoji : null,
      visible,
    }

    if (sortOrder !== null) {
      update.sort_order = sortOrder
    }

    const { data, error } = await supabase
      .from('exp_taxonomy')
      .update(update)
      .eq('key', key)
      .eq('type', 'process_type')
      .select('key, display_name, slug, emoji, visible, sort_order')
      .single()

    if (error) {
      console.error('[admin:catalog:processes:put]', error.message)
      await writeAdminAuditLog({
        action: 'catalog.process_type.update',
        entityType: 'taxonomy',
        entityId: key,
        route: '/api/admin/catalog/processes',
        request,
        status: 'failure',
        details: { error: error.message },
      })
      return NextResponse.json({ error: 'Could not update process type.' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Process type not found.' }, { status: 404 })
    }

    await writeAdminAuditLog({
      action: 'catalog.process_type.update',
      entityType: 'taxonomy',
      entityId: key,
      route: '/api/admin/catalog/processes',
      request,
      status: 'success',
      details: { key, display_name: displayName, slug },
    })

    return NextResponse.json({ processType: data })
  } catch (error) {
    console.error('[admin:catalog:processes:put]', error)
    return NextResponse.json({ error: 'Could not update process type.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-processes-write',
      maxRequests: 30,
      windowMs: 60_000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as { key?: unknown; confirmAction?: unknown }
    const key = asString(body.key, 80)
    const confirmAction = asString(body.confirmAction, 40)

    if (!key) {
      return NextResponse.json({ error: 'Process type key is required.' }, { status: 400 })
    }

    if (confirmAction !== 'delete_process_type') {
      return NextResponse.json({ error: 'Missing confirmation for delete action.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Check if any products use this process type
    const { data: linkedProducts, error: linkError } = await supabase
      .from('exp_product_process_types')
      .select('product_id')
      .eq('process_type_key', key)
      .limit(1)

    if (linkError) {
      console.error('[admin:catalog:processes:delete:check]', linkError.message)
      return NextResponse.json({ error: 'Could not check product assignments.' }, { status: 500 })
    }

    if (linkedProducts && linkedProducts.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete: This process type is assigned to products. Reassign before deleting.' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('exp_taxonomy')
      .delete()
      .eq('key', key)
      .eq('type', 'process_type')

    if (error) {
      console.error('[admin:catalog:processes:delete]', error.message)
      await writeAdminAuditLog({
        action: 'catalog.process_type.delete',
        entityType: 'taxonomy',
        entityId: null,
        route: '/api/admin/catalog/processes',
        request,
        status: 'failure',
        details: { error: error.message },
      })
      return NextResponse.json({ error: 'Could not delete process type.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'catalog.process_type.delete',
      entityType: 'taxonomy',
      entityId: key,
      route: '/api/admin/catalog/processes',
      request,
      status: 'success',
      details: { key },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[admin:catalog:processes:delete]', error)
    return NextResponse.json({ error: 'Could not delete process type.' }, { status: 500 })
  }
}