import { NextResponse } from 'next/server'

import { requireAdminApiSession } from '@/lib/admin/auth'
import { getSupabaseAdmin } from '@/lib/supabase/client'

export async function GET(request: Request) {
  try {
    const auth = await requireAdminApiSession(request)
    if (!auth.ok) return auth.response

    const supabase = getSupabaseAdmin()

    // Get product stats
    const { data: products, error: productsError } = await supabase
      .from('exp_products')
      .select('id, is_active, is_archived', { count: 'exact' })

    if (productsError) throw productsError

    const totalProducts = products?.length ?? 0
    const activeProducts = products?.filter((p) => p.is_active && !p.is_archived).length ?? 0
    const draftProducts = products?.filter((p) => !p.is_active && !p.is_archived).length ?? 0
    const archivedProducts = products?.filter((p) => p.is_archived).length ?? 0

    // Get category stats
    const { data: categories, error: categoriesError } = await supabase
      .from('exp_taxonomy')
      .select('key, visible', { count: 'exact' })
      .eq('type', 'category')

    if (categoriesError) throw categoriesError

    const totalCategories = categories?.length ?? 0
    const visibleCategories = categories?.filter((c) => c.visible).length ?? 0

    let activeDeals = 0
    let activePromoCodes = 0

    const [promoCountResult, dealsCountResult] = await Promise.all([
      supabase
        .from('exp_promo_codes')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),
      supabase
        .from('exp_bundle_deals')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),
    ])

    if (!promoCountResult.error) {
      activePromoCodes = promoCountResult.count ?? 0
    }

    if (!dealsCountResult.error) {
      activeDeals = dealsCountResult.count ?? 0
    }

    return NextResponse.json({
      totalProducts,
      activeProducts,
      draftProducts,
      archivedProducts,
      totalCategories,
      visibleCategories,
      activeDeals,
      activePromoCodes,
    })
  } catch (error) {
    console.error('Failed to fetch catalog stats:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch stats' },
      { status: 500 }
    )
  }
}
