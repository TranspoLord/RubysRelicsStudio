import { NextResponse } from 'next/server'

import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getSupabaseAdmin } from '@/lib/supabase/client'

interface ProductUpdateBody {
  title?: unknown
  slug?: unknown
  category_key?: unknown
  base_price?: unknown
  sort_order?: unknown
  production_estimate_band?: unknown
  short_description?: unknown
  description?: unknown
  is_ready_made?: unknown
  is_customizable?: unknown
}

function asString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

function asNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function isValidSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdminApiSession(request)
    if (!auth.ok) return auth.response

    const { id } = await context.params
    const productId = asString(id, 80)
    if (!productId) {
      return NextResponse.json({ error: 'Invalid product id.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const [productResult, categoryResult] = await Promise.all([
      supabase
        .from('exp_products')
        .select(
          'id,title,slug,category_key,base_price,sort_order,production_estimate_band,short_description,description,is_ready_made,is_customizable,is_active,is_archived,updated_at'
        )
        .eq('id', productId)
        .single(),
      supabase
        .from('exp_taxonomy')
        .select('key,display_name')
        .eq('type', 'category')
        .order('sort_order', { ascending: true }),
    ])

    if (productResult.error || !productResult.data) {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 })
    }

    if (categoryResult.error) {
      return NextResponse.json({ error: 'Failed to load categories.' }, { status: 500 })
    }

    return NextResponse.json({
      product: productResult.data,
      categories: categoryResult.data ?? [],
    })
  } catch (error) {
    console.error('[admin:catalog:products:id:get]', error)
    return NextResponse.json({ error: 'Unexpected error while loading product.' }, { status: 500 })
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdminApiSession(request)
    if (!auth.ok) return auth.response

    const { id } = await context.params
    const productId = asString(id, 80)
    if (!productId) {
      return NextResponse.json({ error: 'Invalid product id.' }, { status: 400 })
    }

    const body = (await request.json().catch(() => ({}))) as ProductUpdateBody

    const title = asString(body.title, 140)
    const slug = asString(body.slug, 120)
    const categoryKey = asString(body.category_key, 120)
    const productionEstimateBand = asString(body.production_estimate_band, 80)
    const shortDescription = asString(body.short_description, 220)
    const description = asString(body.description, 5000)

    const basePrice = asNumber(body.base_price)
    const sortOrder = asNumber(body.sort_order)
    const isReadyMade = asBoolean(body.is_ready_made, false)
    const isCustomizable = asBoolean(body.is_customizable, true)

    if (title.length < 2) {
      return NextResponse.json({ error: 'Title must be at least 2 characters.' }, { status: 400 })
    }
    if (!isValidSlug(slug)) {
      return NextResponse.json({ error: 'Slug must be lowercase-hyphen format.' }, { status: 400 })
    }
    if (!categoryKey) {
      return NextResponse.json({ error: 'Category is required.' }, { status: 400 })
    }
    if (basePrice === null || basePrice < 0) {
      return NextResponse.json({ error: 'Base price must be zero or higher.' }, { status: 400 })
    }
    if (sortOrder === null || sortOrder < 0) {
      return NextResponse.json({ error: 'Sort order must be zero or higher.' }, { status: 400 })
    }
    if (productionEstimateBand.length < 3) {
      return NextResponse.json({ error: 'Production estimate band is required.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_products')
      .update({
        title,
        slug,
        category_key: categoryKey,
        base_price: basePrice,
        sort_order: sortOrder,
        production_estimate_band: productionEstimateBand,
        short_description: shortDescription,
        description,
        is_ready_made: isReadyMade,
        is_customizable: isCustomizable,
      })
      .eq('id', productId)
      .select(
        'id,title,slug,category_key,base_price,sort_order,production_estimate_band,short_description,description,is_ready_made,is_customizable,is_active,is_archived,updated_at'
      )
      .single()

    if (error) {
      const isUniqueViolation = error.code === '23505'
      return NextResponse.json(
        { error: isUniqueViolation ? 'A product with this slug already exists.' : 'Could not update product.' },
        { status: 400 }
      )
    }

    await writeAdminAuditLog({
      action: 'catalog.product.update',
      entityType: 'product',
      entityId: data.id,
      route: '/api/admin/catalog/products/[id]',
      request,
      status: 'success',
      details: {
        category_key: data.category_key,
        base_price: data.base_price,
        is_ready_made: data.is_ready_made,
        is_customizable: data.is_customizable,
      },
    })

    return NextResponse.json({ product: data })
  } catch (error) {
    console.error('[admin:catalog:products:id:put]', error)
    return NextResponse.json({ error: 'Unexpected error while updating product.' }, { status: 500 })
  }
}
