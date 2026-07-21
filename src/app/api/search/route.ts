import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { rateLimit, rateLimitResponse, getClientIp } from '@/lib/rate-limit'
import { sanitizeSearchQuery } from '@/lib/validate'

interface SearchProductRow {
  id: string
  title: string
  slug: string
  short_description: string | null
  description: string | null
  base_price: number | null
  category_key: string
  media?: Array<{
    url: string
    is_featured: boolean
    sort_order: number
  }> | null
}

export async function GET(request: Request) {
  try {
    const ip = getClientIp(request)
    const rl = await rateLimit(`search:${ip}`, 30, 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter!)

    const { searchParams } = new URL(request.url)
    const rawQuery = searchParams.get('q')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50)

    const query = sanitizeSearchQuery(rawQuery)
    if (!query) {
      return NextResponse.json({ results: [] }, { status: 200 })
    }

    const supabase = getSupabaseAdmin()

    // Search products across key catalog text fields.
    const { data: products, error } = await supabase
      .from('exp_products')
      .select(`
        id,
        title,
        slug,
        short_description,
        description,
        category_key,
        base_price,
        media:exp_product_media (
          url,
          is_featured,
          sort_order
        )
      `)
      .or(
        [
          `title.ilike.%${query}%`,
          `slug.ilike.%${query}%`,
          `short_description.ilike.%${query}%`,
          `description.ilike.%${query}%`,
          `category_key.ilike.%${query}%`,
        ].join(',')
      )
      .eq('is_active', true)
      .eq('is_archived', false)
      .limit(limit)

    if (error) {
      console.error('[search]', error.message)
      return NextResponse.json({ results: [] }, { status: 200 })
    }

    const rows = (products ?? []) as SearchProductRow[]
    const categoryKeys = Array.from(new Set(rows.map((row) => row.category_key).filter(Boolean)))

    let categoryByKey = new Map<string, { display_name: string; slug: string }>()

    if (categoryKeys.length > 0) {
      const { data: categories, error: categoriesError } = await supabase
        .from('exp_taxonomy')
        .select('key, display_name, slug')
        .eq('type', 'category')
        .in('key', categoryKeys)

      if (categoriesError) {
        console.error('[search:categories]', categoriesError.message)
      } else {
        categoryByKey = new Map(
          (categories ?? []).map((category) => [
            category.key,
            { display_name: category.display_name, slug: category.slug },
          ])
        )
      }
    }

    // Format results with category grouping
    const results = rows.map((product) => {
      const category = categoryByKey.get(product.category_key)
      const media = [...(product.media ?? [])].sort((a, b) => {
        if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1
        return a.sort_order - b.sort_order
      })

      return {
      id: product.id,
      title: product.title,
      slug: product.slug,
      description: (product.short_description || product.description || '').substring(0, 100),
      price: Number(product.base_price ?? 0),
      thumbnail: media[0]?.url,
      category: category?.display_name || 'Uncategorized',
      categoryKey: product.category_key,
      categorySlug: category?.slug || product.category_key,
      }
    })

    return NextResponse.json({ results }, { status: 200 })
  } catch (error) {
    console.error('[search]', error)
    return NextResponse.json({ results: [] }, { status: 200 })
  }
}
