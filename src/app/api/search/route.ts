import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { rateLimit, rateLimitResponse, getClientIp } from '@/lib/rate-limit'
import { sanitizeSearchQuery } from '@/lib/validate'

export async function GET(request: Request) {
  try {
    const ip = getClientIp(request)
    const rl = rateLimit(`search:${ip}`, 30, 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter!)

    const { searchParams } = new URL(request.url)
    const rawQuery = searchParams.get('q')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50)

    const query = sanitizeSearchQuery(rawQuery)
    if (!query) {
      return NextResponse.json({ results: [] }, { status: 200 })
    }

    const supabase = getSupabaseAdmin()

    // Search products by title or description
    const { data: products, error } = await supabase
      .from('exp_products')
      .select(`
        id,
        title,
        slug,
        description,
        base_price,
        thumbnail_url,
        exp_product_categories (
          category_key,
          display_name
        )
      `)
      .or(
        `title.ilike.%${query}%,description.ilike.%${query}%`
      )
      .limit(limit)

    if (error) {
      console.error('[search]', error.message)
      return NextResponse.json({ results: [] }, { status: 200 })
    }

    // Format results with category grouping
    const results = (products || []).map((product: any) => ({
      id: product.id,
      title: product.title,
      slug: product.slug,
      description: product.description?.substring(0, 100),
      price: product.base_price,
      thumbnail: product.thumbnail_url,
      category: product.exp_product_categories?.display_name || 'Uncategorized',
      categoryKey: product.exp_product_categories?.category_key,
    }))

    return NextResponse.json({ results }, { status: 200 })
  } catch (error) {
    console.error('[search]', error)
    return NextResponse.json({ results: [] }, { status: 200 })
  }
}
