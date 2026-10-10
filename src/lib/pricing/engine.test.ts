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
      description: null,
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
      description: null,
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
          description: null,
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
          description: null,
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

// ── OCT #5: option / quantity validation ─────────────────────────────────────
// The engine used to accept a tampered payload: an unmatched value priced at +$0
// and was stored verbatim, a disabled value was priced, a repeated key summed its
// deltas, and a non-integer quantity reached Square as a string.
const OPTION_PRODUCT: PricingContext = {
  ...BASE_PRODUCT,
  options: [
    {
      option_key: 'finish',
      label: 'Finish',
      option_type: 'select',
      is_required: false,
      values: [
        { label: 'Gloss', value: 'gloss', price_delta: 1, is_enabled: true },
        { label: 'Matte', value: 'matte', price_delta: 3, is_enabled: false },
      ],
    },
    {
      option_key: 'engraving',
      label: 'Engraving',
      option_type: 'text',
      is_required: false,
      values: [],
    },
  ],
}

describe('computeCanonicalLine — OCT #5 validation', () => {
  it('rejects a case-mismatched option value instead of pricing it at +$0', () => {
    expect(
      computeCanonicalLine(OPTION_PRODUCT, 1, null, [{ key: 'finish', value: 'Gloss' }]),
    ).toBeNull()
  })

  it('rejects a disabled option value', () => {
    expect(
      computeCanonicalLine(OPTION_PRODUCT, 1, null, [{ key: 'finish', value: 'matte' }]),
    ).toBeNull()
  })

  it('rejects a repeated option key', () => {
    expect(
      computeCanonicalLine(OPTION_PRODUCT, 1, null, [
        { key: 'finish', value: 'gloss' },
        { key: 'finish', value: 'gloss' },
      ]),
    ).toBeNull()
  })

  it('rejects an unknown option key', () => {
    expect(computeCanonicalLine(OPTION_PRODUCT, 1, null, [{ key: 'nope', value: 'x' }])).toBeNull()
  })

  it('rejects a non-string option value without throwing', () => {
    expect(
      computeCanonicalLine(OPTION_PRODUCT, 1, null, [
        { key: 'finish', value: 5 as unknown as string },
      ]),
    ).toBeNull()
  })

  it('rejects an over-long option value', () => {
    expect(
      computeCanonicalLine(OPTION_PRODUCT, 1, null, [
        { key: 'engraving', value: 'x'.repeat(501) },
      ]),
    ).toBeNull()
  })

  it.each([1.5, 0, 1000, -1, Number.NaN])('rejects quantity %s', (quantity) => {
    expect(computeCanonicalLine(OPTION_PRODUCT, quantity, null, [])).toBeNull()
  })

  it('still accepts an enabled value and adds its delta', () => {
    const line = computeCanonicalLine(OPTION_PRODUCT, 1, null, [{ key: 'finish', value: 'gloss' }])
    expect(line?.unitPriceBeforeDiscount).toBe(11)
  })

  it('prices free text at +$0 and records the typed value', () => {
    const line = computeCanonicalLine(OPTION_PRODUCT, 1, null, [
      { key: 'engraving', value: 'For Ruby' },
    ])
    expect(line?.unitPriceBeforeDiscount).toBe(10)
    expect(line?.selectedOptions.engraving).toBe('For Ruby')
  })
})


// ── OCT #5: process add-ons and multi-process combo discounts ────────────────
// These are what the storefront charged but the engine ignored, so Square
// undercharged (processes) or overcharged (combos).
const PROCESS_PRODUCT: PricingContext = {
  ...BASE_PRODUCT,
  options: [],
  bulk_discounts: [],
  process_pricing: [
    { id: 'p1', product_id: 'product-1', process_type_key: 'uv_print', price_delta: 5, is_enabled: true },
    { id: 'p2', product_id: 'product-1', process_type_key: 'engrave', price_delta: 12, is_enabled: true },
    { id: 'p3', product_id: 'product-1', process_type_key: 'retired', price_delta: 99, is_enabled: false },
  ],
  combo_discounts: [
    {
      id: 'c1',
      product_id: 'product-1',
      min_processes: 2,
      discount_type: 'cheapest_free',
      discount_value: null,
      label: null,
      is_enabled: true,
    },
  ],
}

describe('computeCanonicalLine — OCT #5 processes and combos', () => {
  it('adds a +$5 process to the unit price and the cents', () => {
    const line = computeCanonicalLine(PROCESS_PRODUCT, 1, null, [], ['uv_print'])
    expect(line?.unitPriceBeforeDiscount).toBe(15)
    expect(line?.unitAmountCents).toBe(1500)
  })

  it('applies cheapest_free to the smaller process delta', () => {
    const line = computeCanonicalLine(PROCESS_PRODUCT, 1, null, [], ['uv_print', 'engrave'])
    expect(line?.processDiscount).toBe(5)
    expect(line?.lineTotal).toBe(22)
    expect(line?.appliedCombo?.id).toBe('c1')
  })

  it('multiplies the combo discount by the quantity', () => {
    const line = computeCanonicalLine(PROCESS_PRODUCT, 3, null, [], ['uv_print', 'engrave'])
    // (10 + 5 + 12) * 3 = 81, less 5 * 3 = 15
    expect(line?.lineTotal).toBe(66)
  })

  it('does not apply a combo below the two-process threshold', () => {
    const line = computeCanonicalLine(PROCESS_PRODUCT, 1, null, [], ['engrave'])
    expect(line?.processDiscount).toBe(0)
    expect(line?.lineTotal).toBe(22)
  })

  it('records the priced process keys on the line', () => {
    const line = computeCanonicalLine(PROCESS_PRODUCT, 1, null, [], ['uv_print', 'engrave'])
    expect(line?.selectedProcessKeys).toEqual(['uv_print', 'engrave'])
  })

  it('rejects an unknown process key', () => {
    expect(computeCanonicalLine(PROCESS_PRODUCT, 1, null, [], ['nope'])).toBeNull()
  })

  it('rejects a disabled process key', () => {
    expect(computeCanonicalLine(PROCESS_PRODUCT, 1, null, [], ['retired'])).toBeNull()
  })

  it('rejects a repeated process key', () => {
    expect(computeCanonicalLine(PROCESS_PRODUCT, 1, null, [], ['uv_print', 'uv_print'])).toBeNull()
  })
})

// ── OCT #5: the NFC tag add-on ───────────────────────────────────────────────
// The label always read "adds $1.00" but nothing priced or stored it.
describe('computeCanonicalLine — OCT #5 NFC add-on', () => {
  it('prices the NFC tag using the product delta', () => {
    const line = computeCanonicalLine(
      { ...PROCESS_PRODUCT, nfc_price_delta: 2.5 },
      1,
      null,
      [],
      [],
      { enabled: true }
    )
    expect(line?.unitPriceBeforeDiscount).toBe(12.5)
    expect(line?.nfcEnabled).toBe(true)
  })

  it('defaults the NFC delta to $1 when the product does not set one', () => {
    const line = computeCanonicalLine(PROCESS_PRODUCT, 1, null, [], [], { enabled: true })
    expect(line?.unitPriceBeforeDiscount).toBe(11)
  })

  it('does not price NFC when it is not enabled', () => {
    const line = computeCanonicalLine(PROCESS_PRODUCT, 1, null, [], [], { enabled: false })
    expect(line?.unitPriceBeforeDiscount).toBe(10)
    expect(line?.nfcEnabled).toBe(false)
  })

  it('multiplies the NFC delta by the quantity', () => {
    const line = computeCanonicalLine(PROCESS_PRODUCT, 3, null, [], [], { enabled: true })
    expect(line?.lineTotal).toBe(33)
  })
})

// ── OCT #35: the charge must equal the displayed amount ──────────────────────
// These three are the worked examples from the review. The old engine rounded a
// per-unit amount and multiplied it back, so the display, the stored row and the
// Square charge each landed on a different number.
describe('computeCanonicalLine — OCT #35 exact cents', () => {
  function priced(basePrice: number, quantity: number, percent: number) {
    const product: PricingContext = {
      ...BASE_PRODUCT,
      base_price: basePrice,
      variants: [],
      options: [],
      bulk_discounts: [
        {
          min_qty: 1,
          max_qty: null,
          discount_type: 'percent',
          discount_value: percent,
          step_qty: null,
          label: null,
          description: null,
          sort_order: 0,
          is_enabled: true,
        },
      ],
    }
    return computeCanonicalLine(product, quantity, null, [])
  }

  it('$1.99 × 7 at 15% charges $11.84', () => {
    const line = priced(1.99, 7, 15)
    expect(line?.lineTotalCents).toBe(1184)
    expect(line?.lineTotal).toBe(11.84)
  })

  it('$0.35 × 500 at 17% charges $145.25 (used to charge $145.00)', () => {
    const line = priced(0.35, 500, 17)
    expect(line?.lineTotalCents).toBe(14525)
    expect(line?.lineTotal).toBe(145.25)
  })

  it('$3.50 × 3 at 5% charges $9.97', () => {
    const line = priced(3.5, 3, 5)
    expect(line?.lineTotalCents).toBe(997)
    expect(line?.lineTotal).toBe(9.97)
  })

  it('keeps the undiscounted unit exact, so Square can apply the discount itself', () => {
    const line = priced(1.99, 7, 15)
    expect(line?.unitCents).toBe(199)
    expect(line?.lineSubtotalCents).toBe(1393)
    expect(line?.lineDiscountCents).toBe(209)
    // unit × qty − the FIXED_AMOUNT LINE_ITEM discount is the charge, exactly.
    expect(199 * 7 - 209).toBe(line?.lineTotalCents)
  })
})

