/**
 * Shared server-side pricing engine.
 *
 * This module is the single source of truth for price calculations. Both the
 * checkout session route and the admin pricing preview endpoint import from
 * here to guarantee that the same logic produces the same totals in both
 * contexts — preventing any cart/checkout mismatch.
 *
 * Rules (must match storefront ProductConfigurator exactly):
 * 1. unitPrice = base_price + variant.price_delta + sum(selected option value deltas)
 * 2. subtotal  = unitPrice * quantity
 * 3. bulkTier  = first enabled tier (by sort_order) where min_qty <= qty <= max_qty
 * 4. discount  = see DiscountType math below
 * 5. lineTotal = max(0, subtotal - discount)
 * 6. unitAmountCents = round((lineTotal / quantity) * 100), min 1
 */

export interface PricingVariant {
  id: string
  label: string
  price_delta: number
  is_enabled: boolean
}

export interface PricingOptionValue {
  label: string
  value: string
  price_delta: number
  is_enabled: boolean
}

export interface PricingOption {
  option_key: string
  label: string
  option_type: string
  is_required: boolean
  values: PricingOptionValue[]
}

export interface PricingBulkTier {
  min_qty: number
  max_qty: number | null
  discount_type: 'percent' | 'fixed_amount' | 'unit_price' | 'stepped'
  discount_value: number
  /** Step quantity for 'stepped' type — discount increases every step_qty items */
  step_qty: number | null
  label: string | null
  /** Customer-facing note shown under the price in the storefront */
  description: string | null
  sort_order: number
  is_enabled: boolean
}

export interface PricingContext {
  id: string
  title: string
  base_price: number
  is_active: boolean
  is_archived: boolean
  variants: PricingVariant[]
  options: PricingOption[]
  bulk_discounts: PricingBulkTier[]
}

export interface PricingSelectedOption {
  key: string
  value: string
}

export interface CanonicalLineResult {
  productId: string
  name: string
  variantId: string | null
  variantLabel: string | null
  selectedOptions: Record<string, string>
  unitPriceBeforeDiscount: number
  lineSubtotal: number
  lineDiscount: number
  lineTotal: number
  quantity: number
  unitAmountCents: number
  appliedTier: PricingBulkTier | null
  description: string | undefined
}

/**
 * Find the first matching enabled bulk-discount tier for a given quantity.
 * Tiers are sorted by `sort_order` ascending, and the first match wins.
 */
export function findMatchingBulkTier(
  tiers: PricingBulkTier[],
  quantity: number
): PricingBulkTier | null {
  const sorted = [...tiers]
    .filter((t) => t.is_enabled)
    .sort((a, b) => a.sort_order - b.sort_order)

  return (
    sorted.find((tier) => {
      const max = tier.max_qty ?? Number.POSITIVE_INFINITY
      return quantity >= tier.min_qty && quantity <= max
    }) ?? null
  )
}

/**
 * Compute a canonical priced line item from a product context + cart inputs.
 *
 * Returns `null` if:
 * - The product is inactive or archived.
 * - A variantId was specified but the variant is disabled or not found.
 * - A required option has no value selected.
 */
export function computeCanonicalLine(
  product: PricingContext,
  quantity: number,
  variantId: string | null,
  selectedOptions: PricingSelectedOption[]
): CanonicalLineResult | null {
  if (!product.is_active || product.is_archived) return null

  let unitPrice = Number(product.base_price)

  const variant = variantId
    ? product.variants.find((v) => v.id === variantId && v.is_enabled)
    : null

  if (variantId && !variant) return null

  if (variant) {
    unitPrice += Number(variant.price_delta)
  }

  const optionMap = new Map(product.options.map((opt) => [opt.option_key, opt]))
  const selectedMap = new Map(selectedOptions.map((opt) => [opt.key, opt.value]))

  // Enforce required option fields
  for (const opt of product.options) {
    if (!opt.is_required) continue
    const selected = selectedMap.get(opt.option_key)
    if (!selected || selected.trim().length === 0) return null
  }

  const descriptionParts: string[] = []
  if (variant?.label) descriptionParts.push(variant.label)
  const resolvedOptions: Record<string, string> = {}

  for (const selected of selectedOptions) {
    const def = optionMap.get(selected.key)
    if (!def) continue

    const valueMeta = def.values.find((v) => v.value === selected.value)
    if (valueMeta) {
      unitPrice += Number(valueMeta.price_delta)
      descriptionParts.push(`${def.label}: ${valueMeta.label}`)
      resolvedOptions[def.option_key] = valueMeta.value
    } else {
      descriptionParts.push(`${def.label}: ${selected.value}`)
      resolvedOptions[def.option_key] = selected.value
    }
  }

  const subtotal = unitPrice * quantity
  const appliedTier = findMatchingBulkTier(product.bulk_discounts, quantity)

  let discount = 0
  if (appliedTier) {
    if (appliedTier.discount_type === 'percent') {
      discount = subtotal * (Number(appliedTier.discount_value) / 100)
    } else if (appliedTier.discount_type === 'fixed_amount') {
      discount = Number(appliedTier.discount_value) * quantity
    } else if (appliedTier.discount_type === 'unit_price') {
      discount = Math.max(0, (unitPrice - Number(appliedTier.discount_value)) * quantity)
    } else if (appliedTier.discount_type === 'stepped') {
      // Stepped: for every step_qty items, the per-unit discount increases by
      // discount_value. The number of complete steps is floor(quantity / step_qty).
      // The per-unit discount = steps * discount_value, capped at unitPrice.
      // Total discount = perUnitDiscount * quantity.
      const stepQty = Number(appliedTier.step_qty ?? 0)
      if (stepQty > 0) {
        const steps = Math.floor(quantity / stepQty)
        const perUnitDiscount = Math.min(unitPrice, steps * Number(appliedTier.discount_value))
        discount = perUnitDiscount * quantity
      }
    }
  }

  const lineTotal = Math.max(0, subtotal - discount)
  const unitAmountCents = Math.max(1, Math.round((lineTotal / quantity) * 100))

  const description =
    descriptionParts.length > 0
      ? descriptionParts.join(' | ').slice(0, 240)
      : undefined

  return {
    productId: product.id,
    name: product.title,
    variantId,
    variantLabel: variant?.label ?? null,
    selectedOptions: resolvedOptions,
    unitPriceBeforeDiscount: unitPrice,
    lineSubtotal: subtotal,
    lineDiscount: discount,
    lineTotal,
    quantity,
    unitAmountCents,
    appliedTier,
    description,
  }
}