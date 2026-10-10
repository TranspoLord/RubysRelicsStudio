/**
 * OCT #35: order money reconciliation.
 *
 * Before this, `discount_amount` mixed the free-shipping discount into the item
 * discount while `shipping_cost` was stored *post*-discount, so
 * `subtotal − discount + shipping` did not equal `order_total`. Every value here
 * is integer cents, so the identity is exact:
 *
 *   subtotal − discount_amount + shipping_cost − shipping_discount + tax_amount
 *     = order_total
 */
export interface OrderTotalsCents {
  subtotalCents: number
  discountCents: number
  shippingCents: number
  shippingDiscountCents: number
  taxCents: number
  totalCents: number
}

export interface ReconciliationResult {
  ok: boolean
  expectedTotalCents: number
  differenceCents: number
}

export function reconcileOrderTotals(totals: OrderTotalsCents): ReconciliationResult {
  const expectedTotalCents =
    totals.subtotalCents -
    totals.discountCents +
    totals.shippingCents -
    totals.shippingDiscountCents +
    totals.taxCents

  return {
    ok: expectedTotalCents === totals.totalCents,
    expectedTotalCents,
    differenceCents: totals.totalCents - expectedTotalCents,
  }
}

/** Throwing form, for tests and any caller that wants to fail hard. */
export function assertOrderTotalsReconcile(totals: OrderTotalsCents): void {
  const result = reconcileOrderTotals(totals)
  if (!result.ok) {
    throw new Error(
      `Order totals do not reconcile: expected ${result.expectedTotalCents} cents, got ${totals.totalCents} cents (off by ${result.differenceCents}).`
    )
  }
}
