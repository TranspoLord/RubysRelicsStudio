import { computeCanonicalLine } from '@/lib/pricing/engine'
import type { PricingContext } from '@/lib/pricing/engine'

/**
 * OCT #5: cart line repricing.
 *
 * Lives outside `CartProvider` so it can be unit-tested without a DOM harness
 * (this repo runs vitest with `environment: 'node'`).
 */

/** Quantities are clamped to the range the engine and Square both accept. */
export function clampQty(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1
  return Math.max(1, Math.min(999, Math.floor(quantity)))
}

/** The fields `repriceLine` needs from a cart line. */
export interface RepricableLine {
  quantity: number
  variantId?: string | null
  options: Array<{ key: string; value: string }>
  selectedProcessKeys?: string[]
  nfc?: { enabled: boolean } | null
  unitPrice: number
  lineSubtotal: number
  lineDiscount: number
  lineTotal: number
}

export interface RepricedLine {
  quantity: number
  unitPrice: number
  lineSubtotal: number
  lineDiscount: number
  lineTotal: number
}

/**
 * Re-price a line through the shared engine.
 *
 * Quantity changes used to scale `lineTotal / item.quantity`, which keeps the
 * per-unit amount captured at add time — so dropping 10 → 2 kept a 15% bulk tier
 * that no longer applied, and Square charged full price. With the product's
 * pricing context we get the correct tier, process and combo discounts for the
 * new quantity.
 */
export function repriceLine(
  line: RepricableLine,
  quantity: number,
  context: PricingContext | undefined
): RepricedLine {
  const qty = clampQty(quantity)

  if (context) {
    const priced = computeCanonicalLine(
      context,
      qty,
      line.variantId ?? null,
      line.options.map((opt) => ({ key: opt.key, value: opt.value })),
      line.selectedProcessKeys ?? [],
      line.nfc?.enabled === true ? { enabled: true } : null
    )

    if (priced) {
      return {
        quantity: qty,
        unitPrice: priced.unitPriceBeforeDiscount,
        lineSubtotal: priced.lineSubtotal,
        lineDiscount: priced.lineDiscount,
        lineTotal: priced.lineTotal,
      }
    }
  }

  // No snapshot (a v1 cart) or the engine refused the line. Scale what we have
  // rather than inventing a price; the server re-prices at checkout and
  // `chargedTotalCents` warns the customer if the two disagree.
  const ratio = line.quantity > 0 ? qty / line.quantity : 1
  return {
    quantity: qty,
    unitPrice: line.unitPrice,
    lineSubtotal: line.lineSubtotal * ratio,
    lineDiscount: line.lineDiscount * ratio,
    lineTotal: line.lineTotal * ratio,
  }
}
