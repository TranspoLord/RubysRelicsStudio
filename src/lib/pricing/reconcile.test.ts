import { describe, expect, it } from 'vitest'
import { assertOrderTotalsReconcile, reconcileOrderTotals } from './reconcile'
import { computeCanonicalLine } from './engine'
import type { PricingContext } from './engine'

describe('reconcileOrderTotals (OCT #35)', () => {
  it('accepts totals that satisfy the identity', () => {
    const result = reconcileOrderTotals({
      subtotalCents: 10000,
      discountCents: 1500,
      shippingCents: 500,
      shippingDiscountCents: 500,
      taxCents: 0,
      totalCents: 8500,
    })

    expect(result.ok).toBe(true)
    expect(result.differenceCents).toBe(0)
  })

  it('rejects a total that is off by one cent', () => {
    const result = reconcileOrderTotals({
      subtotalCents: 10000,
      discountCents: 1500,
      shippingCents: 500,
      shippingDiscountCents: 500,
      taxCents: 0,
      totalCents: 8499,
    })

    expect(result.ok).toBe(false)
    expect(result.differenceCents).toBe(-1)
  })

  it('includes tax in the identity', () => {
    const result = reconcileOrderTotals({
      subtotalCents: 1000,
      discountCents: 0,
      shippingCents: 0,
      shippingDiscountCents: 0,
      taxCents: 82,
      totalCents: 1082,
    })

    expect(result.ok).toBe(true)
  })

  it('assertOrderTotalsReconcile throws on a mismatch', () => {
    expect(() =>
      assertOrderTotalsReconcile({
        subtotalCents: 100,
        discountCents: 0,
        shippingCents: 0,
        shippingDiscountCents: 0,
        taxCents: 0,
        totalCents: 99,
      })
    ).toThrow(/do not reconcile/)
  })
})

/** Deterministic LCG, so a failure is reproducible. */
function makeRng(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
}

describe('OCT #35 invariant — the charge always equals the record', () => {
  it('holds over 500 randomized carts', () => {
    const rng = makeRng(20261009)

    for (let iteration = 0; iteration < 500; iteration += 1) {
      const unitCents = 1 + Math.floor(rng() * 20000)
      const quantity = 1 + Math.floor(rng() * 60)
      const percent = Math.floor(rng() * 40)

      const product: PricingContext = {
        id: 'p',
        title: 'p',
        base_price: unitCents / 100,
        is_active: true,
        is_archived: false,
        variants: [],
        options: [],
        bulk_discounts:
          percent > 0
            ? [
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
              ]
            : [],
      }

      const line = computeCanonicalLine(product, quantity, null, [])
      expect(line).not.toBeNull()
      if (!line) continue

      // 1. The line's cents are internally consistent.
      expect(line.lineSubtotalCents).toBe(line.unitCents * quantity)
      expect(line.lineTotalCents).toBe(line.lineSubtotalCents - line.lineDiscountCents)
      expect(line.lineDiscountCents).toBeGreaterThanOrEqual(0)
      expect(line.lineDiscountCents).toBeLessThanOrEqual(line.lineSubtotalCents)

      // 2. What Square charges — the undiscounted unit × quantity, less the
      //    FIXED_AMOUNT LINE_ITEM discount — is exactly the line total.
      expect(line.unitCents * quantity - line.lineDiscountCents).toBe(line.lineTotalCents)

      // 3. The dollars the customer is shown are the cents, exactly.
      expect(Math.round(line.lineTotal * 100)).toBe(line.lineTotalCents)
      expect(Math.round(line.lineSubtotal * 100)).toBe(line.lineSubtotalCents)

      // 4. The stored order identity holds.
      const shippingCents = Math.floor(rng() * 5000)
      const shippingDiscountCents = Math.floor(rng() * (shippingCents + 1))
      const totals = {
        subtotalCents: line.lineSubtotalCents,
        discountCents: line.lineDiscountCents,
        shippingCents,
        shippingDiscountCents,
        taxCents: 0,
        totalCents:
          line.lineSubtotalCents -
          line.lineDiscountCents +
          shippingCents -
          shippingDiscountCents,
      }
      expect(reconcileOrderTotals(totals).ok).toBe(true)
    }
  })
})
