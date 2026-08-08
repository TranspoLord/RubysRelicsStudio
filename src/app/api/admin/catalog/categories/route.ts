import { NextResponse } from 'next/server'

import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { sanitizeSearchQuery } from '@/lib/validate'

interface CategoryBody {
  key?: unknown
  display_name?: unknown
  slug?: unknown
  visible?: unknown
  sort_order?: unknown
  emoji?: unknown
  gradient?: unknown
  tagline?: unknown
  parent_key?: unknown
}

function asString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

function asInt(value: unknown, fallback = 0): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.trunc(n)
}

function asBoolean(value: unknown, fallback = true): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120)
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
    const url = new URL(request.url)
    const query = sanitizeSearchQuery(asString(url.searchParams.get('q'), 80)) ?? ''

    let builder = supabase
      .from('exp_taxonomy')
      .select('key, display_name, slug, parent_key, visible, sort_order, emoji, gradient, tagline, updated_at')
      .eq('type', 'category')
      .order('sort_order', { ascending: true })
      .order('display_name', { ascending: true })

    if (query.length > 0) {
      builder = builder.or(`display_name.ilike.%${query}%,slug.ilike.%${query}%,key.ilike.%${query}%`)
    }

    const { data, error } = await builder

    if (error) {
      console.error('[admin:catalog:categories:get]', error.message)
      return NextResponse.json({ error: 'Failed to load categories.' }, { status: 500 })
    }

    return NextResponse.json({ categories: data ?? [] })
  } catch (error) {
    console.error('[admin:catalog:categories:get:uncaught]', error)
    return NextResponse.json({ error: 'Unexpected error while loading categories.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApiSession(request)
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as CategoryBody

    const displayName = asString(body.display_name, 120)
    const key = normalizeKey(asString(body.key, 120) || displayName)
    const slug = normalizeSlug(asString(body.slug, 120) || displayName)
    const visible = asBoolean(body.visible, true)
    const sortOrder = asInt(body.sort_order, 0)
    const emoji = asString(body.emoji, 24)
    const gradient = asString(body.gradient, 80)
    const tagline = asString(body.tagline, 200)
    const parentKey = asString(body.parent_key, 120)

    if (!displayName) {
      return NextResponse.json({ error: 'display_name is required.' }, { status: 400 })
    }
    if (!key) {
      return NextResponse.json({ error: 'key is required.' }, { status: 400 })
    }
    if (!slug) {
      return NextResponse.json({ error: 'slug is required.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const payload = {
      key,
      display_name: displayName,
      slug,
      type: 'category',
      visible,
      sort_order: sortOrder,
      emoji: emoji || null,
      gradient: gradient || null,
      tagline: tagline || null,
      parent_key: parentKey || null,
    }

    const { data, error } = await supabase
      .from('exp_taxonomy')
      .insert(payload)
      .select('key, display_name, slug, parent_key, visible, sort_order, emoji, gradient, tagline, updated_at')
      .single()

    if (error) {
      const message = error.code === '23505' ? 'Category key or slug already exists.' : 'Failed to create category.'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    await writeAdminAuditLog({
      action: 'catalog.category.create',
      entityType: 'category',
      entityId: data.key,
      route: '/api/admin/catalog/categories',
      request,
      status: 'success',
      details: { key: data.key, slug: data.slug },
    })

    return NextResponse.json({ category: data }, { status: 201 })
  } catch (error) {
    console.error('[admin:catalog:categories:post:uncaught]', error)
    return NextResponse.json({ error: 'Unexpected error while creating category.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAdminApiSession(request)
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as CategoryBody

    const key = normalizeKey(asString(body.key, 120))
    const displayName = asString(body.display_name, 120)
    const slug = normalizeSlug(asString(body.slug, 120))
    const visible = asBoolean(body.visible, true)
    const sortOrder = asInt(body.sort_order, 0)
    const emoji = asString(body.emoji, 24)
    const gradient = asString(body.gradient, 80)
    const tagline = asString(body.tagline, 200)
    const parentKey = asString(body.parent_key, 120)

    if (!key) {
      return NextResponse.json({ error: 'key is required.' }, { status: 400 })
    }
    if (!displayName) {
      return NextResponse.json({ error: 'display_name is required.' }, { status: 400 })
    }
    if (!slug) {
      return NextResponse.json({ error: 'slug is required.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_taxonomy')
      .update({
        display_name: displayName,
        slug,
        visible,
        sort_order: sortOrder,
        emoji: emoji || null,
        gradient: gradient || null,
        tagline: tagline || null,
        parent_key: parentKey || null,
      })
      .eq('key', key)
      .eq('type', 'category')
      .select('key, display_name, slug, parent_key, visible, sort_order, emoji, gradient, tagline, updated_at')
      .single()

    if (error) {
      const message = error.code === '23505' ? 'Category slug already exists.' : 'Failed to update category.'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    await writeAdminAuditLog({
      action: 'catalog.category.update',
      entityType: 'category',
      entityId: data.key,
      route: '/api/admin/catalog/categories',
      request,
      status: 'success',
      details: { key: data.key, slug: data.slug, visible: data.visible },
    })

    return NextResponse.json({ category: data })
  } catch (error) {
    console.error('[admin:catalog:categories:put:uncaught]', error)
    return NextResponse.json({ error: 'Unexpected error while updating category.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAdminApiSession(request)
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as { key?: unknown; confirmAction?: unknown }
    const key = normalizeKey(asString(body.key, 120))
    const confirmAction = asString(body.confirmAction, 40)

    if (!key) {
      return NextResponse.json({ error: 'key is required.' }, { status: 400 })
    }
    if (confirmAction !== 'delete_category') {
      return NextResponse.json({ error: 'confirmAction=delete_category is required.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { count: productCount, error: countError } = await supabase
      .from('exp_products')
      .select('id', { count: 'exact', head: true })
      .eq('category_key', key)

    if (countError) {
      return NextResponse.json({ error: 'Failed to verify category usage.' }, { status: 500 })
    }

    if ((productCount ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Category has assigned products. Reassign products before deletion.' },
        { status: 409 }
      )
    }

    // Remove category reference from gallery entries before deleting
    await supabase
      .from('exp_gallery')
      .update({ category_key: null })
      .eq('category_key', key)

    const { error } = await supabase
      .from('exp_taxonomy')
      .delete()
      .eq('key', key)
      .eq('type', 'category')

    if (error) {
      return NextResponse.json({ error: 'Failed to delete category.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'catalog.category.delete',
      entityType: 'category',
      entityId: key,
      route: '/api/admin/catalog/categories',
      request,
      status: 'success',
      details: { key },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[admin:catalog:categories:delete:uncaught]', error)
    return NextResponse.json({ error: 'Unexpected error while deleting category.' }, { status: 500 })
  }
}
