import { describe, expect, it } from 'vitest'
import { clampQty, repriceLine } from './repricing'
import type { PricingContext } from '@/lib/pricing/engine'

/** $10 base, 15% off at 5+. */
const CONTEXT: PricingContext = {
  id: 'product-1',
  title: 'Custom Mug',
  base_price: 10,
  is_active: true,
  is_archived: false,
  variants: [],
  options: [],
  bulk_discounts: [
    {
      min_qty: 5,
      max_qty: null,
      discount_type: 'percent',
      discount_value: 15,
      step_qty: null,
      label: '15% off',
      description: null,
      sort_order: 10,
      is_enabled: true,
    },
  ],
  process_pricing: [
    {
      id: 'p1',
      product_id: 'product-1',
      process_type_key: 'uv_print',
      price_delta: 5,
      is_enabled: true,
    },
  ],
  combo_discounts: [],
  nfc_price_delta: 1,
}

/** A line added at 10 units, i.e. inside the 15% tier. */
const LINE = {
  quantity: 10,
  variantId: null,
  options: [],
  selectedProcessKeys: [],
  nfc: null,
  unitPrice: 8.5,
  lineSubtotal: 100,
  lineDiscount: 15,
  lineTotal: 85,
}

describe('repriceLine (OCT #5)', () => {
  it('drops the bulk tier when the quantity falls below it', () => {
    const repriced = repriceLine(LINE, 2, CONTEXT)

    expect(repriced.quantity).toBe(2)
    expect(repriced.lineSubtotal).toBe(20)
    expect(repriced.lineDiscount).toBe(0)
    expect(repriced.lineTotal).toBe(20)
  })

  it('applies the bulk tier when the quantity rises into it', () => {
    const atTwo = { ...LINE, quantity: 2, unitPrice: 10, lineSubtotal: 20, lineDiscount: 0, lineTotal: 20 }
    const repriced = repriceLine(atTwo, 10, CONTEXT)

    expect(repriced.lineSubtotal).toBe(100)
    expect(repriced.lineDiscount).toBe(15)
    expect(repriced.lineTotal).toBe(85)
  })

  it('prices process add-ons for the new quantity', () => {
    const repriced = repriceLine({ ...LINE, selectedProcessKeys: ['uv_print'] }, 2, CONTEXT)

    // (10 + 5) * 2, no tier at 2
    expect(repriced.lineSubtotal).toBe(30)
    expect(repriced.lineTotal).toBe(30)
  })

  it('prices the NFC add-on', () => {
    const repriced = repriceLine({ ...LINE, nfc: { enabled: true } }, 1, CONTEXT)

    expect(repriced.lineSubtotal).toBe(11)
  })

  it('scales the stored totals when there is no snapshot (a v1 cart)', () => {
    const repriced = repriceLine(LINE, 5, undefined)

    expect(repriced.quantity).toBe(5)
    expect(repriced.lineSubtotal).toBe(50)
    expect(repriced.lineTotal).toBe(42.5)
  })

  it('clamps the quantity into 1–999', () => {
    expect(clampQty(0)).toBe(1)
    expect(clampQty(1.7)).toBe(1)
    expect(clampQty(5000)).toBe(999)
    expect(clampQty(Number.NaN)).toBe(1)
  })
})
