import { getSupabaseAdmin } from '@/lib/supabase/client'

/**
 * Maximum package weight accepted for shipping quotes (pounds).
 * Prevents abuse and protects against unrealistic catalog data.
 */
export const MAX_PACKAGE_WEIGHT_LB = 150

/**
 * Minimum package weight for a non-empty cart (pounds).
 */
export const MIN_PACKAGE_WEIGHT_LB = 0.01

export interface CartItemWeightInput {
  productId: string
  variantId?: string | null
  quantity: number
}

export interface PackageWeightResult {
  weight: number
  itemWeights: Array<{ productId: string; variantId: string | null; weight: number }>
}

/**
 * Derive a shipping package weight from the cart's catalog records.
 *
 * Product weight comes from `exp_products.weight_lb`. If a variant is supplied
 * and `exp_product_variants.weight_lb` exists, it overrides the product weight.
 * Weights are multiplied by quantity and clamped to a safe ceiling.
 *
 * This is a remediation for SEC-047 / M-1: the client must never be trusted to
 * supply package weight for a paid shipping-rate lookup.
 */
export async function derivePackageWeight(
  items: CartItemWeightInput[]
): Promise<PackageWeightResult | null> {
  if (!Array.isArray(items) || items.length === 0) return null

  const supabase = getSupabaseAdmin()

  const itemWeights = await Promise.all(
    items.map(async (item) => {
      const quantity = Math.max(1, Math.min(999, Number(item.quantity) || 1))

      const { data: product } = await supabase
        .from('exp_products')
        .select('weight_lb')
        .eq('id', item.productId)
        .maybeSingle()

      let unitWeight = Number(product?.weight_lb ?? 1)

      if (item.variantId) {
        const { data: variant } = await supabase
          .from('exp_product_variants')
          .select('weight_lb')
          .eq('id', item.variantId)
          .maybeSingle()

        if (variant && typeof variant.weight_lb === 'number') {
          unitWeight = Number(variant.weight_lb)
        }
      }

      const safeUnitWeight = Math.max(
        MIN_PACKAGE_WEIGHT_LB,
        Math.min(MAX_PACKAGE_WEIGHT_LB, unitWeight)
      )

      return {
        productId: item.productId,
        variantId: item.variantId ?? null,
        weight: safeUnitWeight * quantity,
      }
    })
  )

  const totalWeight = itemWeights.reduce((sum, iw) => sum + iw.weight, 0)
  const clampedWeight = Math.min(MAX_PACKAGE_WEIGHT_LB, Math.max(MIN_PACKAGE_WEIGHT_LB, totalWeight))

  return { weight: clampedWeight, itemWeights }
}

/**
 * Clamp a client-supplied weight to a sane range. Used only for routes that do
 * not have catalog items (e.g., the admin shipping debug tool).
 */
export function clampPackageWeight(weight: unknown): number {
  const value = Number(weight)
  if (!Number.isFinite(value) || value <= 0) return 1
  return Math.min(MAX_PACKAGE_WEIGHT_LB, Math.max(MIN_PACKAGE_WEIGHT_LB, value))
}
