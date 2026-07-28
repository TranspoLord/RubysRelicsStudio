import { describe, expect, it } from 'vitest'
import { computeCanonicalLine, findMatchingBulkTier, type PricingContext } from './engine'

const BASE_PRODUCT: PricingContext = {
  id: 'product-1',
  title: 'Custom Mug',
  base_price: 10,
  is_active: true,
  is_archived: false,
  variants: [
    { id: 'variant-large', label: 'Large', price_delta: 2, is_enabled: true },
  ],
  options: [
    {
      option_key: 'finish',
      label: 'Finish',
      option_type: 'select',
      is_required: true,
      values: [
        { label: 'Gloss', value: 'gloss', price_delta: 1, is_enabled: true },
      ],
    },
  ],
  bulk_discounts: [
    {
      min_qty: 5,
      max_qty: 9,
      discount_type: 'percent',
      discount_value: 10,
      step_qty: null,
      label: '10% off',
      sort_order: 10,
      is_enabled: true,
    },
  ],
}

describe('findMatchingBulkTier', () => {
  it('returns matching enabled tier for quantity', () => {
    const tier = findMatchingBulkTier(BASE_PRODUCT.bulk_discounts, 6)
    expect(tier?.label).toBe('10% off')
  })
})

describe('computeCanonicalLine', () => {
  it('calculates subtotal, discount, and total with variant/options/tier', () => {
    const line = computeCanonicalLine(
      BASE_PRODUCT,
      5,
      'variant-large',
      [{ key: 'finish', value: 'gloss' }]
    )

    expect(line).not.toBeNull()
    expect(line?.unitPriceBeforeDiscount).toBe(13)
    expect(line?.lineSubtotal).toBe(65)
    expect(line?.lineDiscount).toBe(6.5)
    expect(line?.lineTotal).toBe(58.5)
  })

  it('returns null when required option is missing', () => {
    const line = computeCanonicalLine(BASE_PRODUCT, 1, 'variant-large', [])
    expect(line).toBeNull()
  })

  it('returns null for invalid variant id', () => {
    const line = computeCanonicalLine(
      BASE_PRODUCT,
      1,
      'variant-missing',
      [{ key: 'finish', value: 'gloss' }]
    )
    expect(line).toBeNull()
  })
})

// ─── Stepped discount type ───────────────────────────────────────────────────

const STEPPED_PRODUCT: PricingContext = {
  id: 'product-stepped',
  title: 'Bulk Stickers',
  base_price: 5,
  is_active: true,
  is_archived: false,
  variants: [],
  options: [],
  bulk_discounts: [
    {
      // For every 10 items, $0.50 off per unit
      min_qty: 10,
      max_qty: null,
      discount_type: 'stepped',
      discount_value: 0.50,
      step_qty: 10,
      label: 'Volume pricing',
      sort_order: 0,
      is_enabled: true,
    },
  ],
}

describe('computeCanonicalLine — stepped discount', () => {
  it('applies 1 step discount at exactly step_qty', () => {
    // Qty 10: 1 step × $0.50 = $0.50/unit off → $5.00 total discount
    const line = computeCanonicalLine(STEPPED_PRODUCT, 10, null, [])
    expect(line).not.toBeNull()
    expect(line?.unitPriceBeforeDiscount).toBe(5)
    expect(line?.lineSubtotal).toBe(50)
    expect(line?.lineDiscount).toBe(5) // 0.50 × 10
    expect(line?.lineTotal).toBe(45)
  })

  it('applies 2 steps at 2× step_qty', () => {
    // Qty 20: 2 steps × $0.50 = $1.00/unit off → $20.00 total discount
    const line = computeCanonicalLine(STEPPED_PRODUCT, 20, null, [])
    expect(line).not.toBeNull()
    expect(line?.lineDiscount).toBe(20) // 1.00 × 20
    expect(line?.lineTotal).toBe(80) // 100 - 20
  })

  it('applies partial steps (floor) for quantities between steps', () => {
    // Qty 25: floor(25/10) = 2 steps × $0.50 = $1.00/unit off → $25.00 total discount
    const line = computeCanonicalLine(STEPPED_PRODUCT, 25, null, [])
    expect(line).not.toBeNull()
    expect(line?.lineDiscount).toBe(25) // 1.00 × 25
    expect(line?.lineTotal).toBe(100) // 125 - 25
  })

  it('applies 3 steps at 3× step_qty', () => {
    // Qty 30: 3 steps × $0.50 = $1.50/unit off → $45.00 total discount
    const line = computeCanonicalLine(STEPPED_PRODUCT, 30, null, [])
    expect(line).not.toBeNull()
    expect(line?.lineDiscount).toBe(45) // 1.50 × 30
    expect(line?.lineTotal).toBe(105) // 150 - 45
  })

  it('does not apply stepped discount below min_qty', () => {
    // Qty 5: below min_qty of 10, no tier matches
    const line = computeCanonicalLine(STEPPED_PRODUCT, 5, null, [])
    expect(line).not.toBeNull()
    expect(line?.lineDiscount).toBe(0)
    expect(line?.lineTotal).toBe(25) // 5 × 5
  })

  it('caps per-unit discount at unit price (free items)', () => {
    // With a very high step count, per-unit discount would exceed unit price.
    // The cap ensures the discount never makes the line go negative.
    const productWithBigSteps: PricingContext = {
      ...STEPPED_PRODUCT,
      bulk_discounts: [
        {
          min_qty: 10,
          max_qty: null,
          discount_type: 'stepped',
          discount_value: 2.00, // $2/step, unit price is $5
          step_qty: 10,
          label: 'Aggressive volume',
          sort_order: 0,
          is_enabled: true,
        },
      ],
    }
    // Qty 30: 3 steps × $2.00 = $6.00/unit, but capped at $5.00
    // Discount = $5.00 × 30 = $150, subtotal = $150, lineTotal = $0
    const line = computeCanonicalLine(productWithBigSteps, 30, null, [])
    expect(line).not.toBeNull()
    expect(line?.lineDiscount).toBe(150) // 5.00 × 30 (capped)
    expect(line?.lineTotal).toBe(0)
  })

  it('handles stepped discount with no step_qty gracefully (no discount)', () => {
    const productNoStep: PricingContext = {
      ...STEPPED_PRODUCT,
      bulk_discounts: [
        {
          min_qty: 10,
          max_qty: null,
          discount_type: 'stepped',
          discount_value: 0.50,
          step_qty: null, // missing — should produce no discount
          label: 'Broken tier',
          sort_order: 0,
          is_enabled: true,
        },
      ],
    }
    const line = computeCanonicalLine(productNoStep, 20, null, [])
    expect(line).not.toBeNull()
    expect(line?.lineDiscount).toBe(0)
  })
})
