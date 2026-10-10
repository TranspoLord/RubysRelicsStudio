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

export interface PricingProcessPricing {
  id: string
  product_id: string
  process_type_key: string
  price_delta: number
  is_enabled: boolean
}

export interface PricingComboDiscount {
  id: string
  product_id: string
  min_processes: number
  discount_type: 'percent' | 'fixed_amount' | 'cheapest_free'
  discount_value: number | null
  label: string | null
  is_enabled: boolean
}

export interface PricingContext {
  id: string
  title: string
  base_price: number
  is_active: boolean
  is_archived: boolean
  categoryKey?: string | null
  variants: PricingVariant[]
  options: PricingOption[]
  bulk_discounts: PricingBulkTier[]
  /** OCT #5: process add-ons (`exp_product_process_pricing`). */
  process_pricing?: PricingProcessPricing[]
  /** OCT #5: multi-process combo discounts (`exp_product_combo_discounts`). */
  combo_discounts?: PricingComboDiscount[]
  /** OCT #5: the NFC tag add-on price. Defaults to $1 when unset. */
  nfc_price_delta?: number | null
}

export interface PricingSelectedOption {
  key: string
  value: string
}

/**
 * OCT #5: limits for the pricing payload. `MAX_LINE_QUANTITY` matches the
 * storefront's quantity stepper and the `exp_order_items` quantity range;
 * `MAX_OPTION_VALUE_CHARS` bounds free-text option values.
 */
export const MAX_LINE_QUANTITY = 999
const MAX_OPTION_VALUE_CHARS = 500

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
  /** OCT #35: the UNDISCOUNTED unit price in integer cents (exact). */
  unitCents: number
  /** OCT #35: `unitCents * quantity` (exact). */
  lineSubtotalCents: number
  /** OCT #35: the whole line's discount in cents, rounded exactly once. */
  lineDiscountCents: number
  /** OCT #35: `lineSubtotalCents - lineDiscountCents` (exact). */
  lineTotalCents: number
  appliedTier: PricingBulkTier | null
  description: string | undefined
  /** OCT #5: the process add-ons that were priced into this line. */
  selectedProcessKeys: string[]
  /** OCT #5: the per-unit combo discount applied to the process add-ons. */
  processDiscount: number
  /** OCT #5: the combo discount that produced `processDiscount`, if any. */
  appliedCombo: PricingComboDiscount | null
  /** OCT #5: whether the NFC tag add-on was priced into this line. */
  nfcEnabled: boolean
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
 * OCT #5: find the combo discount that applies to a given number of selected
 * process add-ons. Mirrors the storefront's helper: a combo needs at least two
 * processes, and the highest `min_processes` the selection satisfies wins.
 * Disabled combos are ignored (the old client helper applied them).
 */
export function findMatchingComboDiscount(
  combos: PricingComboDiscount[],
  selectedProcessCount: number
): PricingComboDiscount | null {
  if (selectedProcessCount < 2) return null

  const sorted = [...combos]
    .filter((combo) => combo.is_enabled)
    .sort((a, b) => b.min_processes - a.min_processes)

  return sorted.find((combo) => selectedProcessCount >= combo.min_processes) ?? null
}

/**
 * Compute a canonical priced line item from a product context + cart inputs.
 *
 * Returns `null` if:
 * - The quantity is not an integer in 1–999.
 * - The product is inactive or archived.
 * - A variantId was specified but the variant is disabled or not found.
 * - A required option has no value selected.
 * - An option entry is malformed (not a `{key, value}` string pair), names an
 *   unknown or repeated key, exceeds the value length cap, or — for a select or
 *   a checkbox that defines values — names a value that is missing or disabled.
 *   (OCT #5)
 */
export function computeCanonicalLine(
  product: PricingContext,
  quantity: number,
  variantId: string | null,
  selectedOptions: PricingSelectedOption[],
  selectedProcessKeys: string[] = [],
  nfc?: { enabled: boolean } | null,
  options?: { allowIncomplete?: boolean }
): CanonicalLineResult | null {
  // OCT #5: the storefront's live preview prices a selection the customer has
  // not finished making (a required option may still be empty). Checkout never
  // sets this, so the strict behaviour below is what protects the money.
  const allowIncomplete = options?.allowIncomplete === true
  // OCT #5: the quantity must be a real integer in range. The route used to clamp
  // `1.5` to `1` and then send `"1.5"` to Square, and accepted 0 and 1000.
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
    return null
  }

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

  // OCT #5: validate the option payload *before* pricing it. The old code indexed
  // `selected.key` blindly, so a non-string value threw a 500, an unknown key was
  // silently ignored, and a repeated key summed every delta while recording only
  // the last value.
  const selectedMap = new Map<string, string>()
  for (const selected of selectedOptions) {
    if (
      !selected ||
      typeof selected !== 'object' ||
      typeof selected.key !== 'string' ||
      typeof selected.value !== 'string'
    ) {
      return null
    }
    if (selected.value.length > MAX_OPTION_VALUE_CHARS) return null
    if (selectedMap.has(selected.key)) return null
    selectedMap.set(selected.key, selected.value)
  }

  // Enforce required option fields
  for (const opt of product.options) {
    if (!opt.is_required) continue
    const selected = selectedMap.get(opt.option_key)
    if (!selected || selected.trim().length === 0) {
      if (!allowIncomplete) return null
      continue
    }
  }

  const descriptionParts: string[] = []
  if (variant?.label) descriptionParts.push(variant.label)
  const resolvedOptions: Record<string, string> = {}

  for (const [key, value] of selectedMap) {
    const def = optionMap.get(key)
    // An unknown option key is a tampering attempt, not something to ignore.
    if (!def) return null

    const optionType = (def.option_type ?? '').toLowerCase()
    if (optionType === 'number' && !Number.isFinite(Number(value))) return null

    const valueMeta = def.values.find((v) => v.value === value && v.is_enabled)

    // A select — or a checkbox that defines values — must name an *enabled*
    // value. This is the money hole: an unmatched or disabled value used to price
    // at +$0 and be stored verbatim (e.g. "Walnut" vs "walnut" +$25).
    const mustMatchValue =
      (optionType === 'select' || optionType === 'checkbox') && def.values.length > 0
    if (mustMatchValue && !valueMeta) return null

    if (valueMeta) {
      unitPrice += Number(valueMeta.price_delta)
      descriptionParts.push(`${def.label}: ${valueMeta.label}`)
      resolvedOptions[def.option_key] = valueMeta.value
    } else {
      // Free text, numbers and anything else are accepted as typed, no delta.
      descriptionParts.push(`${def.label}: ${value}`)
      resolvedOptions[def.option_key] = value
    }
  }

  // OCT #5: process add-ons are part of the price. The engine ignored them
  // entirely, so a "+$12 UV print" shown at $37 was charged at $25 by Square.
  const processPricing = product.process_pricing ?? []
  const resolvedProcesses: PricingProcessPricing[] = []
  const seenProcessKeys = new Set<string>()
  for (const key of selectedProcessKeys) {
    if (typeof key !== 'string' || seenProcessKeys.has(key)) return null
    seenProcessKeys.add(key)

    const process = processPricing.find((p) => p.process_type_key === key && p.is_enabled)
    // An unknown or disabled process key is a tampering attempt.
    if (!process) return null

    resolvedProcesses.push(process)
    unitPrice += Number(process.price_delta)
    descriptionParts.push(`Process: ${process.process_type_key}`)
  }

  // OCT #5: the NFC tag add-on. The storefront showed "adds $1.00" but never
  // charged or stored it. The delta comes from the product (`nfc_price_delta`,
  // defaulting to $1) so the owner can change the price without a deploy.
  const nfcEnabled = Boolean(nfc?.enabled)
  if (nfcEnabled) {
    unitPrice += Number(product.nfc_price_delta ?? 1)
    descriptionParts.push('NFC tag')
  }

  const subtotal = unitPrice * quantity
  const appliedTier = findMatchingBulkTier(product.bulk_discounts, quantity)
  const appliedCombo = findMatchingComboDiscount(
    product.combo_discounts ?? [],
    resolvedProcesses.length
  )

  // A combo discount reduces the process add-ons only (matching the storefront),
  // and is a per-unit amount multiplied by the quantity.
  let processDiscount = 0
  if (appliedCombo) {
    const processTotal = resolvedProcesses.reduce((sum, p) => sum + Number(p.price_delta), 0)
    if (appliedCombo.discount_type === 'percent') {
      processDiscount = processTotal * (Number(appliedCombo.discount_value ?? 0) / 100)
    } else if (appliedCombo.discount_type === 'fixed_amount') {
      processDiscount = Number(appliedCombo.discount_value ?? 0)
    } else if (appliedCombo.discount_type === 'cheapest_free') {
      const cheapest = resolvedProcesses.reduce(
        (min, p) => Math.min(min, Number(p.price_delta)),
        Number.POSITIVE_INFINITY
      )
      processDiscount = Number.isFinite(cheapest) ? cheapest : 0
    }
  }

  let discount = processDiscount * quantity
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

  // OCT #35: money is integer cents, rounded exactly once.
  //   - `unitCents` is the UNDISCOUNTED unit price and is exact (every stored
  //     delta is cent-exact), so `unitCents * quantity` is exact.
  //   - The only fraction in the pipeline is a percentage discount; it is rounded
  //     here, once. Rounding a per-unit amount and multiplying it back is what
  //     made the charge differ from the display ($0.35 × 500 at 17% showed
  //     $145.25 and charged $145.00).
  const unitCents = Math.max(1, Math.round(unitPrice * 100))
  const lineSubtotalCents = unitCents * quantity
  const lineDiscountCents = Math.min(lineSubtotalCents, Math.max(0, Math.round(discount * 100)))
  const lineTotalCents = lineSubtotalCents - lineDiscountCents

  const lineTotal = lineTotalCents / 100
  const unitAmountCents = unitCents

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
    unitPriceBeforeDiscount: unitCents / 100,
    lineSubtotal: lineSubtotalCents / 100,
    lineDiscount: lineDiscountCents / 100,
    lineTotal,
    quantity,
    unitAmountCents,
    /** OCT #35: exact integer cents — the values Square and the DB are built from. */
    unitCents,
    lineSubtotalCents,
    lineDiscountCents,
    lineTotalCents,
    appliedTier,
    description,
    selectedProcessKeys: resolvedProcesses.map((p) => p.process_type_key),
    processDiscount,
    appliedCombo,
    nfcEnabled,
  }
}