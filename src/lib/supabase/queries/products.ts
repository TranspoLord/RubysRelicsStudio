import { getSupabaseAdmin } from '../client'
import { evaluateInventoryState, type InventoryAvailabilityOverride } from '@/lib/inventory/state'
import { getRecommendationSettings } from '@/lib/storefront-settings'

const supabase = getSupabaseAdmin()

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DbCategory {
  key: string
  display_name: string
  slug: string
  emoji: string | null
  gradient: string | null
  tagline?: string | null
  how_it_works_anchor?: string | null
}

export interface DbProduct {
  id: string
  title: string
  slug: string
  short_description: string
  description: string
  category_key: string
  base_price: number
  is_ready_made: boolean
  is_customizable: boolean
  is_active: boolean
  sort_order: number
  production_estimate_band: string
  how_it_works_anchor: string | null
  seo_title: string | null
  seo_description: string | null
  // Joined from exp_taxonomy via category_key
  category_display_name?: string
  category_slug?: string
  category_emoji?: string | null
  category_gradient?: string | null
  // First featured media (if any)
  featured_media?: DbProductMedia | null
  // Inventory state for ready-made products
  inventory_qty?: number | null
  low_stock_threshold?: number | null
  availability_override?: InventoryAvailabilityOverride | null
  is_track_inventory?: boolean | null
  is_in_stock?: boolean
  is_low_stock?: boolean
  inventory_status?:
    | 'forced_in_stock'
    | 'forced_out_of_stock'
    | 'in_stock'
    | 'low_stock'
    | 'out_of_stock'
    | 'untracked'
}

export interface DbProductVariant {
  id: string
  product_id: string
  label: string
  sku: string | null
  price_delta: number
  is_enabled: boolean
  sort_order: number
}

export interface DbProductMedia {
  id: string
  product_id: string
  url: string
  alt: string
  emoji: string | null
  gradient: string | null
  is_featured: boolean
  sort_order: number
}

export interface DbProductOption {
  id: string
  product_id: string
  option_key: string
  label: string
  option_type: 'select' | 'text' | 'textarea' | 'file' | 'checkbox' | 'number'
  placeholder: string | null
  help_text: string | null
  is_required: boolean
  sort_order: number
  values?: DbProductOptionValue[]
}

export interface DbProductOptionValue {
  id: string
  option_id: string
  label: string
  value: string
  price_delta: number
  is_enabled: boolean
  sort_order: number
}

export interface DbProductBulkDiscount {
  id: string
  product_id: string
  min_qty: number
  max_qty: number | null
  discount_type: 'percent' | 'fixed_amount' | 'unit_price'
  discount_value: number
  label: string | null
  is_enabled: boolean
  sort_order: number
}

export interface DbProductDetail extends DbProduct {
  variants: DbProductVariant[]
  media: DbProductMedia[]
  options: DbProductOption[]
  bulk_discounts: DbProductBulkDiscount[]
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Fetch all active products for a category (by taxonomy slug).
 * Returns products with their featured media item and category display data.
 */
export async function getProductsByCategory(
  categorySlug: string
): Promise<{ category: DbCategory | null; products: DbProduct[] }> {
  // Step 1: resolve slug → taxonomy entry
  const { data: tax, error: taxError } = await supabase
    .from('exp_taxonomy')
    .select('key, display_name, slug, emoji, gradient, tagline, how_it_works_anchor')
    .eq('slug', categorySlug)
    .eq('type', 'category')
    .single()

  if (taxError || !tax) {
    if (taxError?.code !== 'PGRST116') {
      console.error('[getProductsByCategory:taxonomy]', taxError?.message)
    }
    return { category: null, products: [] }
  }

  // Step 2: fetch products by category_key
  const { data, error } = await supabase
    .from('exp_products')
    .select(`
      id, title, slug, short_description, description,
      category_key, base_price, is_ready_made, is_customizable,
      is_active, sort_order, production_estimate_band,
      how_it_works_anchor, seo_title, seo_description,
      media:exp_product_media (
        id, product_id, url, alt, emoji, gradient, is_featured, sort_order
      )
    `)
    .eq('category_key', tax.key)
    .eq('is_active', true)
    .eq('is_archived', false)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[getProductsByCategory:products]', error.message)
    return { category: tax as DbCategory, products: [] }
  }

  // Attach category data to each product row so normalizeProduct can use it
  const enriched = (data ?? []).map((row) => ({
    ...row,
    category: tax,
  }))

  return {
    category: tax as DbCategory,
    products: enriched.map(normalizeProduct),
  }
}

/**
 * Fetch all active products across all categories.
 * When `processKey` is supplied only products tagged to that process type are returned.
 * Used by the shop/all page and the homepage process-pick tiles.
 */
export async function getAllActiveProducts(processKey?: string): Promise<DbProduct[]> {
  // When a process filter is requested, resolve the matching product IDs first
  let allowedProductIds: string[] | null = null
  if (processKey) {
    const { data: links, error: linkErr } = await supabase
      .from('exp_product_process_types')
      .select('product_id')
      .eq('process_type_key', processKey)

    if (linkErr) {
      console.error('[getAllActiveProducts:processFilter]', linkErr.message)
    }

    allowedProductIds = (links ?? []).map((r) => r.product_id)
    // Return early if no products are tagged yet — avoids an unfiltered fallback
    if (allowedProductIds.length === 0) return []
  }

  // Fetch products and categories separately for efficiency
  const [productsResult, categoriesResult] = await Promise.all([
    (() => {
      let q = supabase
        .from('exp_products')
        .select(`
          id, title, slug, short_description, description,
          category_key, base_price, is_ready_made, is_customizable,
          is_active, sort_order, production_estimate_band,
          how_it_works_anchor, seo_title, seo_description,
          media:exp_product_media (
            id, product_id, url, alt, emoji, gradient, is_featured, sort_order
          )
        `)
        .eq('is_active', true)
        .eq('is_archived', false)
        .order('sort_order', { ascending: true })

      if (allowedProductIds !== null) {
        q = q.in('id', allowedProductIds)
      }

      return q
    })(),

    supabase
      .from('exp_taxonomy')
      .select('key, display_name, slug, emoji, gradient')
      .eq('type', 'category'),
  ])

  if (productsResult.error) {
    console.error('[getAllActiveProducts]', productsResult.error.message)
    return []
  }

  const catMap = Object.fromEntries(
    (categoriesResult.data ?? []).map((c) => [c.key, c])
  )

  return (productsResult.data ?? []).map((row) =>
    normalizeProduct({ ...row, category: catMap[row.category_key] ?? null })
  )
}

/**
 * Fetch only active ready-made products across all categories.
 */
export async function getReadyMadeProducts(): Promise<DbProduct[]> {
  const [productsResult, categoriesResult] = await Promise.all([
    supabase
      .from('exp_products')
      .select(`
        id, title, slug, short_description, description,
        category_key, base_price, is_ready_made, is_customizable,
        is_active, sort_order, production_estimate_band,
        how_it_works_anchor, seo_title, seo_description,
        media:exp_product_media (
          id, product_id, url, alt, emoji, gradient, is_featured, sort_order
        )
      `)
      .eq('is_active', true)
      .eq('is_archived', false)
      .eq('is_ready_made', true)
      .order('sort_order', { ascending: true }),

    supabase
      .from('exp_taxonomy')
      .select('key, display_name, slug, emoji, gradient')
      .eq('type', 'category'),
  ])

  if (productsResult.error) {
    console.error('[getReadyMadeProducts]', productsResult.error.message)
    return []
  }

  const catMap = Object.fromEntries(
    (categoriesResult.data ?? []).map((c) => [c.key, c])
  )

  return (productsResult.data ?? []).map((row) =>
    normalizeProduct({ ...row, category: catMap[row.category_key] ?? null })
  )
}

/**
 * Fetch full product detail including variants, all media, and options with values.
 */
export async function getProductBySlug(
  productSlug: string
): Promise<DbProductDetail | null> {
  const { data: product, error: productError } = await supabase
    .from('exp_products')
    .select(`
      id, title, slug, short_description, description,
      category_key, base_price, is_ready_made, is_customizable,
      is_active, sort_order, production_estimate_band,
      how_it_works_anchor, seo_title, seo_description
    `)
    .eq('slug', productSlug)
    .eq('is_active', true)
    .eq('is_archived', false)
    .single()

  if (productError || !product) {
    if (productError?.code !== 'PGRST116') {
      console.error('[getProductBySlug:product]', productError?.message)
    }
    return null
  }

  const productId = product.id

  const [categoryResult, variantsResult, mediaResult, optionsResult, bulkDiscountsResult, inventoryResult] = await Promise.all([
    supabase
      .from('exp_taxonomy')
      .select('key, display_name, slug, emoji, gradient, tagline, how_it_works_anchor')
      .eq('key', product.category_key)
      .single(),

    supabase
      .from('exp_product_variants')
      .select('id, product_id, label, sku, price_delta, is_enabled, sort_order')
      .eq('product_id', productId)
      .eq('is_enabled', true)
      .order('sort_order', { ascending: true }),

    supabase
      .from('exp_product_media')
      .select('id, product_id, url, alt, emoji, gradient, is_featured, sort_order')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true }),

    supabase
      .from('exp_product_options')
      .select(`
        id, product_id, option_key, label, option_type,
        placeholder, help_text, is_required, sort_order,
        values:exp_product_option_values (
          id, option_id, label, value, price_delta, is_enabled, sort_order
        )
      `)
      .eq('product_id', productId)
      .order('sort_order', { ascending: true }),

    supabase
      .from('exp_product_bulk_discounts')
      .select('id, product_id, min_qty, max_qty, discount_type, discount_value, label, is_enabled, sort_order')
      .eq('product_id', productId)
      .eq('is_enabled', true)
      .order('sort_order', { ascending: true }),

    supabase
      .from('exp_product_inventory')
      .select('available_qty, low_stock_threshold, availability_override, is_track_inventory')
      .eq('product_id', productId)
      .maybeSingle(),
  ])

  if (variantsResult.error) {
    console.error('[getProductBySlug:variants]', variantsResult.error.message)
  }
  if (mediaResult.error) {
    console.error('[getProductBySlug:media]', mediaResult.error.message)
  }
  if (optionsResult.error) {
    console.error('[getProductBySlug:options]', optionsResult.error.message)
  }
  if (bulkDiscountsResult.error) {
    console.error('[getProductBySlug:bulkDiscounts]', bulkDiscountsResult.error.message)
  }
  if (inventoryResult.error) {
    console.error('[getProductBySlug:inventory]', inventoryResult.error.message)
  }

  const base = normalizeProduct({
    ...product,
    category: categoryResult.data ?? null,
  } as RawProductRow)

  const options: DbProductOption[] = (optionsResult.data ?? []).map((o) => ({
    id: o.id,
    product_id: o.product_id,
    option_key: o.option_key,
    label: o.label,
    option_type: o.option_type as DbProductOption['option_type'],
    placeholder: o.placeholder,
    help_text: o.help_text,
    is_required: o.is_required,
    sort_order: o.sort_order,
    values: ((o.values ?? []) as DbProductOptionValue[])
      .filter((v) => v.is_enabled)
      .sort((a, b) => a.sort_order - b.sort_order),
  }))

  const inventoryRow = inventoryResult.data
  const inventoryState = evaluateInventoryState({
    available_qty: inventoryRow?.available_qty ?? null,
    low_stock_threshold: inventoryRow?.low_stock_threshold ?? null,
    availability_override: (inventoryRow?.availability_override as InventoryAvailabilityOverride | null) ?? null,
    is_track_inventory: inventoryRow?.is_track_inventory ?? null,
  })

  return {
    ...base,
    inventory_qty: inventoryRow?.available_qty ?? null,
    low_stock_threshold: inventoryRow?.low_stock_threshold ?? null,
    availability_override: (inventoryRow?.availability_override as InventoryAvailabilityOverride | null) ?? null,
    is_track_inventory: inventoryRow?.is_track_inventory ?? null,
    is_in_stock: inventoryState.isInStock,
    is_low_stock: inventoryState.isLowStock,
    inventory_status: inventoryState.status,
    variants: (variantsResult.data ?? []) as DbProductVariant[],
    media: (mediaResult.data ?? []) as DbProductMedia[],
    options,
    bulk_discounts: (bulkDiscountsResult.data ?? []) as DbProductBulkDiscount[],
  }
}

/**
 * Count active products per category key.
 * Returns a map of { [categoryKey]: count }.
 */
export async function getProductCountsByCategory(): Promise<
  Record<string, number>
> {
  const { data, error } = await supabase
    .from('exp_products')
    .select('category_key')
    .eq('is_active', true)
    .eq('is_archived', false)

  if (error) {
    console.error('[getProductCountsByCategory]', error.message)
    return {}
  }

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    counts[row.category_key] = (counts[row.category_key] ?? 0) + 1
  }
  return counts
}

/**
 * Fetch related product recommendations for a product detail page.
 * Prioritizes same-category items and falls back to global active products.
 */
export async function getRecommendedProducts(
  currentProductId: string,
  categoryKey: string,
  currentBasePrice: number,
  currentIsReadyMade: boolean,
  currentIsCustomizable: boolean,
  limit: number = 4
): Promise<DbProduct[]> {
  const [categoriesResult, candidateResult, recommendationSettings] = await Promise.all([
    supabase
      .from('exp_taxonomy')
      .select('key, display_name, slug, emoji, gradient')
      .eq('type', 'category'),

    supabase
      .from('exp_products')
      .select(`
        id, title, slug, short_description, description,
        category_key, base_price, is_ready_made, is_customizable,
        is_active, sort_order, production_estimate_band,
        how_it_works_anchor, seo_title, seo_description,
        media:exp_product_media (
          id, product_id, url, alt, emoji, gradient, is_featured, sort_order
        )
      `)
      .eq('category_key', categoryKey)
      .eq('is_active', true)
      .eq('is_archived', false)
      .neq('id', currentProductId)
      .order('sort_order', { ascending: true })
      .limit(120),

    getRecommendationSettings(),
  ])

  const catMap = Object.fromEntries(
    (categoriesResult.data ?? []).map((c) => [c.key, c])
  )

  if (candidateResult.error) {
    console.error('[getRecommendedProducts:candidates]', candidateResult.error.message)
    return []
  }

  const pinnedIds = new Set<string>([
    ...recommendationSettings.pinned_global,
    ...(recommendationSettings.pinned_by_category[categoryKey] ?? []),
  ])

  const ranked = (candidateResult.data ?? [])
    .map((row) => {
      const normalizedPrice = Math.max(1, Number(currentBasePrice ?? 0))
      const priceDelta = Math.abs(Number(row.base_price ?? 0) - normalizedPrice)
      const priceSimilarity = Math.max(0, 1 - Math.min(1, priceDelta / normalizedPrice))

      const sameCategoryScore = row.category_key === categoryKey ? 4 : 0
      const readyMadeScore = row.is_ready_made === currentIsReadyMade ? 1.5 : 0
      const customizableScore = row.is_customizable === currentIsCustomizable ? 1 : 0
      const priceScore = priceSimilarity * 2
      const sortScore = 1 / (1 + Math.max(0, Number(row.sort_order ?? 0)))
      const pinScore = recommendationSettings.enabled && pinnedIds.has(row.id) ? 100 : 0

      const score = pinScore + sameCategoryScore + readyMadeScore + customizableScore + priceScore + sortScore

      return { row, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  const selected = ranked.map((entry) => entry.row)

  const primary = selected.map((row) =>
    normalizeProduct({ ...row, category: catMap[row.category_key] ?? null })
  )

  return primary
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface RawProductRow {
  id: string
  title: string
  slug: string
  short_description: string
  description: string
  category_key: string
  base_price: number
  is_ready_made: boolean
  is_customizable: boolean
  is_active: boolean
  sort_order: number
  production_estimate_band: string
  how_it_works_anchor: string | null
  seo_title: string | null
  seo_description: string | null
  // Supabase returns joined tables as objects or arrays
  category?: { display_name: string; slug: string; emoji: string | null; gradient: string | null } | null
  media?: Array<{ id: string; product_id: string; url: string; alt: string; emoji: string | null; gradient: string | null; is_featured: boolean; sort_order: number }> | null
}

function normalizeProduct(row: RawProductRow): DbProduct {
  const cat = Array.isArray(row.category) ? row.category[0] : row.category
  const mediaRows = (row.media ?? []) as DbProductMedia[]
  const featuredMedia =
    mediaRows.find((m) => m.is_featured) ?? mediaRows[0] ?? null

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    short_description: row.short_description,
    description: row.description,
    category_key: row.category_key,
    base_price: row.base_price,
    is_ready_made: row.is_ready_made,
    is_customizable: row.is_customizable,
    is_active: row.is_active,
    sort_order: row.sort_order,
    production_estimate_band: row.production_estimate_band,
    how_it_works_anchor: row.how_it_works_anchor,
    seo_title: row.seo_title,
    seo_description: row.seo_description,
    category_display_name: cat?.display_name,
    category_slug: cat?.slug,
    category_emoji: cat?.emoji,
    category_gradient: cat?.gradient,
    featured_media: featuredMedia,
  }
}
