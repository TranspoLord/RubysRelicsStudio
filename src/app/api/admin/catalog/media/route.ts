import { NextResponse } from 'next/server'

import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getSupabaseAdmin } from '@/lib/supabase/client'

interface MediaBody {
  productId?: unknown
  mediaId?: unknown
  url?: unknown
  alt?: unknown
  emoji?: unknown
  gradient?: unknown
  is_featured?: unknown
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

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  return fallback
}

function asNumber(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return n
}

function isLikelySafeMediaUrl(value: string): boolean {
  return value.startsWith('https://') || value.startsWith('/')
}

async function clearFeaturedForProduct(productId: string, exceptId: string | null) {
  const supabase = getSupabaseAdmin()
  let builder = supabase
    .from('exp_product_media')
    .update({ is_featured: false })
    .eq('product_id', productId)

  if (exceptId) {
    builder = builder.neq('id', exceptId)
  }

  const { error } = await builder
  if (error) {
    console.error('[admin:catalog:media:featured-reset]', error.message)
  }
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
      .from('exp_product_media')
      .select('id, product_id, url, alt, emoji, gradient, is_featured, sort_order, created_at')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('[admin:catalog:media:get]', error.message)
      return NextResponse.json({ error: 'Could not load product media.' }, { status: 500 })
    }

    return NextResponse.json({ media: data ?? [] }, { status: 200 })
  } catch (error) {
    console.error('[admin:catalog:media:get]', error)
    return NextResponse.json({ error: 'Could not load product media.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-media-write',
      maxRequests: 60,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as MediaBody
    const productId = asString(body.productId, 64)
    const mediaUrl = asString(body.url, 2000)
    const alt = asString(body.alt, 300)
    const emoji = asOptionalString(body.emoji, 16)
    const gradient = asOptionalString(body.gradient, 120)
    const isFeatured = asBoolean(body.is_featured, false)
    const sortOrderRaw = asNumber(body.sort_order)

    if (!productId) {
      return NextResponse.json({ error: 'Product id is required.' }, { status: 400 })
    }

    if (!mediaUrl || mediaUrl.length < 2 || !isLikelySafeMediaUrl(mediaUrl)) {
      return NextResponse.json({ error: 'Media URL must be an https URL or absolute path.' }, { status: 400 })
    }

    if (!alt || alt.length < 2) {
      return NextResponse.json({ error: 'Alt text is required.' }, { status: 400 })
    }

    if (sortOrderRaw === null || sortOrderRaw < -10000 || sortOrderRaw > 10000) {
      return NextResponse.json({ error: 'Sort order must be between -10000 and 10000.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_product_media')
      .insert({
        product_id: productId,
        url: mediaUrl,
        alt,
        emoji,
        gradient,
        is_featured: isFeatured,
        sort_order: Math.trunc(sortOrderRaw),
      })
      .select('id, product_id, url, alt, emoji, gradient, is_featured, sort_order, created_at')
      .single()

    if (error || !data) {
      console.error('[admin:catalog:media:post]', error?.message)
      await writeAdminAuditLog({
        action: 'catalog.media.create',
        entityType: 'product_media',
        route: '/api/admin/catalog/media',
        request,
        status: 'failure',
        details: { reason: 'insert_failed', message: error?.message ?? null, productId },
      })
      return NextResponse.json({ error: 'Could not create media item.' }, { status: 500 })
    }

    if (isFeatured) {
      await clearFeaturedForProduct(productId, data.id)
    }

    await writeAdminAuditLog({
      action: 'catalog.media.create',
      entityType: 'product_media',
      entityId: data.id,
      route: '/api/admin/catalog/media',
      request,
      status: 'success',
      details: { productId, is_featured: data.is_featured, sort_order: data.sort_order },
    })

    return NextResponse.json({ media: data }, { status: 201 })
  } catch (error) {
    console.error('[admin:catalog:media:post]', error)
    await writeAdminAuditLog({
      action: 'catalog.media.create',
      entityType: 'product_media',
      route: '/api/admin/catalog/media',
      request,
      status: 'failure',
      details: { reason: 'unexpected_error' },
    })
    return NextResponse.json({ error: 'Could not create media item.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-media-write',
      maxRequests: 60,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as MediaBody
    const mediaId = asString(body.mediaId, 64)
    const mediaUrl = asString(body.url, 2000)
    const alt = asString(body.alt, 300)
    const emoji = asOptionalString(body.emoji, 16)
    const gradient = asOptionalString(body.gradient, 120)
    const isFeatured = asBoolean(body.is_featured, false)
    const sortOrderRaw = asNumber(body.sort_order)

    if (!mediaId) {
      return NextResponse.json({ error: 'Media id is required.' }, { status: 400 })
    }

    if (!mediaUrl || mediaUrl.length < 2 || !isLikelySafeMediaUrl(mediaUrl)) {
      return NextResponse.json({ error: 'Media URL must be an https URL or absolute path.' }, { status: 400 })
    }

    if (!alt || alt.length < 2) {
      return NextResponse.json({ error: 'Alt text is required.' }, { status: 400 })
    }

    if (sortOrderRaw === null || sortOrderRaw < -10000 || sortOrderRaw > 10000) {
      return NextResponse.json({ error: 'Sort order must be between -10000 and 10000.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_product_media')
      .update({
        url: mediaUrl,
        alt,
        emoji,
        gradient,
        is_featured: isFeatured,
        sort_order: Math.trunc(sortOrderRaw),
      })
      .eq('id', mediaId)
      .select('id, product_id, url, alt, emoji, gradient, is_featured, sort_order, created_at')
      .single()

    if (error || !data) {
      console.error('[admin:catalog:media:put]', error?.message)
      await writeAdminAuditLog({
        action: 'catalog.media.edit',
        entityType: 'product_media',
        entityId: mediaId,
        route: '/api/admin/catalog/media',
        request,
        status: 'failure',
        details: { reason: 'update_failed', message: error?.message ?? null },
      })
      return NextResponse.json({ error: 'Could not update media item.' }, { status: 500 })
    }

    if (isFeatured) {
      await clearFeaturedForProduct(data.product_id, data.id)
    }

    await writeAdminAuditLog({
      action: 'catalog.media.edit',
      entityType: 'product_media',
      entityId: data.id,
      route: '/api/admin/catalog/media',
      request,
      status: 'success',
      details: { productId: data.product_id, is_featured: data.is_featured, sort_order: data.sort_order },
    })

    return NextResponse.json({ media: data }, { status: 200 })
  } catch (error) {
    console.error('[admin:catalog:media:put]', error)
    await writeAdminAuditLog({
      action: 'catalog.media.edit',
      entityType: 'product_media',
      route: '/api/admin/catalog/media',
      request,
      status: 'failure',
      details: { reason: 'unexpected_error' },
    })
    return NextResponse.json({ error: 'Could not update media item.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-catalog-media-write',
      maxRequests: 60,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as MediaBody
    const mediaId = asString(body.mediaId, 64)
    const confirmAction = asString(body.confirmAction, 80)

    if (!mediaId) {
      return NextResponse.json({ error: 'Media id is required.' }, { status: 400 })
    }

    if (confirmAction !== 'delete_media') {
      return NextResponse.json({ error: 'Missing destructive action confirmation.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_product_media')
      .delete()
      .eq('id', mediaId)
      .select('id, product_id, alt')
      .single()

    if (error || !data) {
      console.error('[admin:catalog:media:delete]', error?.message)
      await writeAdminAuditLog({
        action: 'catalog.media.delete',
        entityType: 'product_media',
        entityId: mediaId,
        route: '/api/admin/catalog/media',
        request,
        status: 'failure',
        details: { reason: 'delete_failed', message: error?.message ?? null },
      })
      return NextResponse.json({ error: 'Could not delete media item.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'catalog.media.delete',
      entityType: 'product_media',
      entityId: data.id,
      route: '/api/admin/catalog/media',
      request,
      status: 'success',
      details: { productId: data.product_id, alt: data.alt },
    })

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('[admin:catalog:media:delete]', error)
    await writeAdminAuditLog({
      action: 'catalog.media.delete',
      entityType: 'product_media',
      route: '/api/admin/catalog/media',
      request,
      status: 'failure',
      details: { reason: 'unexpected_error' },
    })
    return NextResponse.json({ error: 'Could not delete media item.' }, { status: 500 })
  }
}
