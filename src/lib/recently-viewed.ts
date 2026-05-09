import { getSupabaseAdmin } from '@/lib/supabase/client'

const RECENTLY_VIEWED_KEY = 'rrs_recently_viewed'
const MAX_ITEMS = 20

/**
 * Get recently viewed items for a guest (localStorage)
 */
export function getGuestRecentlyViewed(): string[] {
  if (typeof window === 'undefined') return []

  try {
    const data = localStorage.getItem(RECENTLY_VIEWED_KEY)
    if (!data) return []

    const items = JSON.parse(data) as string[]
    return Array.isArray(items) ? items : []
  } catch (error) {
    console.error('[recently-viewed]', error)
    return []
  }
}

/**
 * Add a product to guest's recently viewed list
 */
export function addGuestRecentlyViewed(productId: string): void {
  if (typeof window === 'undefined') return

  try {
    let items = getGuestRecentlyViewed()

    // Remove duplicate if exists
    items = items.filter((id) => id !== productId)

    // Add to front
    items.unshift(productId)

    // Keep only max items
    items = items.slice(0, MAX_ITEMS)

    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(items))
  } catch (error) {
    console.error('[recently-viewed]', error)
  }
}

/**
 * Clear guest's recently viewed list
 */
export function clearGuestRecentlyViewed(): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.removeItem(RECENTLY_VIEWED_KEY)
  } catch (error) {
    console.error('[recently-viewed]', error)
  }
}

/**
 * Track product view for authenticated customer
 */
export async function trackProductView(customerId: string, productId: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()

    // Upsert to update timestamp if already viewed
    await supabase
      .from('exp_recently_viewed')
      .upsert(
        {
          customer_id: customerId,
          product_id: productId,
          viewed_at: new Date().toISOString(),
        },
        {
          onConflict: 'customer_id,product_id',
        }
      )

    // Delete old entries beyond limit
    const { data: recent } = await supabase
      .from('exp_recently_viewed')
      .select('id')
      .eq('customer_id', customerId)
      .order('viewed_at', { ascending: false })
      .limit(MAX_ITEMS + 1)

    if (recent && recent.length > MAX_ITEMS) {
      const idsToDelete = recent.slice(MAX_ITEMS).map((item) => item.id)
      await supabase
        .from('exp_recently_viewed')
        .delete()
        .in('id', idsToDelete)
    }
  } catch (error) {
    console.error('[track-product-view]', error)
  }
}

/**
 * Get customer's recently viewed products
 */
export async function getRecentlyViewed(customerId: string) {
  try {
    const supabase = getSupabaseAdmin()

    const { data: items, error } = await supabase
      .from('exp_recently_viewed')
      .select(`
        id,
        product_id,
        viewed_at,
        exp_products (
          id,
          title,
          slug,
          base_price,
          thumbnail_url,
          exp_product_categories (
            category_key,
            display_name
          )
        )
      `)
      .eq('customer_id', customerId)
      .order('viewed_at', { ascending: false })
      .limit(MAX_ITEMS)

    if (error) {
      console.error('[get-recently-viewed]', error)
      return []
    }

    return (items || []).map((item: any) => ({
      id: item.id,
      productId: item.product_id,
      title: item.exp_products?.title,
      slug: item.exp_products?.slug,
      price: item.exp_products?.base_price,
      thumbnail: item.exp_products?.thumbnail_url,
      category: item.exp_products?.exp_product_categories?.display_name,
      categoryKey: item.exp_products?.exp_product_categories?.category_key,
      viewedAt: item.viewed_at,
    }))
  } catch (error) {
    console.error('[get-recently-viewed]', error)
    return []
  }
}
