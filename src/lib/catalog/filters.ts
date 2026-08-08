export interface ShopAllFilterState {
  category?: string
  priceMin?: number
  priceMax?: number
  showReadyMade?: boolean
  showCustomizable?: boolean
  search?: string
}

export interface ShopAllProductLike {
  id: string
  title: string
  short_description?: string | null
  description?: string | null
  category_key?: string | null
  base_price: number
  is_ready_made?: boolean | null
  is_customizable?: boolean | null
}

export function filterProductsForShopAll<T extends ShopAllProductLike>(
  products: T[],
  filters: ShopAllFilterState
): T[] {
  const search = filters.search?.trim().toLowerCase() ?? ''
  const category = filters.category?.trim() ?? ''
  const priceMin = Number.isFinite(filters.priceMin) ? filters.priceMin! : undefined
  const priceMax = Number.isFinite(filters.priceMax) ? filters.priceMax! : undefined
  const showReadyMade = filters.showReadyMade !== false
  const showCustomizable = filters.showCustomizable !== false

  return products.filter((product) => {
    if (category && product.category_key !== category) return false
    if (priceMin !== undefined && product.base_price < priceMin) return false
    if (priceMax !== undefined && product.base_price > priceMax) return false
    if (!showReadyMade && product.is_ready_made) return false
    if (!showCustomizable && product.is_customizable) return false

    if (search) {
      const haystack = `${product.title} ${product.short_description ?? ''} ${product.description ?? ''}`.toLowerCase()
      if (!haystack.includes(search)) return false
    }

    return true
  })
}
