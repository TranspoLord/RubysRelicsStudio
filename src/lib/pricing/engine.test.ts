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
