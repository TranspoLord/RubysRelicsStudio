import { describe, expect, it } from 'vitest'

import {
  applyPromotions,
  resolveEligibleDeals,
  validatePromoCode,
  type BundleDealRecord,
  type PromoCodeRecord,
  type PromotionLineInput,
} from './promotions'

const NOW = new Date('2026-05-12T12:00:00.000Z')

const LINES: PromotionLineInput[] = [
  {
    productId: 'prod_a',
    categoryKey: 'stickers',
    quantity: 3,
    lineTotal: 30,
    selectedOptions: { artwork_id: 'dragon_01' },
  },
  {
    productId: 'prod_b',
    categoryKey: 'apparel',
    quantity: 1,
    lineTotal: 20,
    selectedOptions: { artwork_id: 'dragon_01' },
  },
]

describe('pricing promotions helper', () => {
  it('validates promo code state and date windows', () => {
    const promo: PromoCodeRecord = {
      id: 'promo_1',
      code: 'SAVE10',
      discount_type: 'percent',
      discount_value: 10,
      is_active: true,
      usage_limit: 2,
      usage_count: 1,
      valid_from: '2026-05-01T00:00:00.000Z',
      valid_to: '2026-05-31T23:59:59.000Z',
    }

    const valid = validatePromoCode(promo, 'SAVE10', NOW)
    expect(valid.ok).toBe(true)

    const exhausted = validatePromoCode({ ...promo, usage_count: 2 }, 'SAVE10', NOW)
    expect(exhausted.ok).toBe(false)
  })

  it('resolves deal eligibility and picks best non-stackable path with stackables', () => {
    const deals: BundleDealRecord[] = [
      {
        id: 'auto_stack',
        name: 'Sticker Cart 5% Off',
        trigger_type: 'automatic',
        code: null,
        conditions_json: {
          rules: [{ type: 'category_qty', category_keys: ['stickers'], min_qty: 3 }],
        },
        rewards_json: {
          actions: [{ type: 'order_discount_percent', value: 5 }],
        },
        is_active: true,
        is_stackable: true,
        usage_limit: null,
        usage_count: 0,
        valid_from: null,
        valid_to: null,
      },
      {
        id: 'auto_non_stack_small',
        name: 'Cart 10% Off',
        trigger_type: 'automatic',
        code: null,
        conditions_json: {
          rules: [{ type: 'cart_subtotal_min', min_subtotal: 30 }],
        },
        rewards_json: {
          actions: [{ type: 'order_discount_percent', value: 10 }],
        },
        is_active: true,
        is_stackable: false,
        usage_limit: null,
        usage_count: 0,
        valid_from: null,
        valid_to: null,
      },
      {
        id: 'auto_non_stack_large',
        name: 'Cart 20% Off',
        trigger_type: 'automatic',
        code: null,
        conditions_json: {
          rules: [{ type: 'cart_subtotal_min', min_subtotal: 40 }],
        },
        rewards_json: {
          actions: [{ type: 'order_discount_percent', value: 20 }],
        },
        is_active: true,
        is_stackable: false,
        usage_limit: null,
        usage_count: 0,
        valid_from: null,
        valid_to: null,
      },
      {
        id: 'code_deal',
        name: 'Code Deal',
        trigger_type: 'code',
        code: 'DRAGON',
        conditions_json: {
          rules: [{ type: 'product_qty', product_ids: ['prod_b'], min_qty: 1 }],
        },
        rewards_json: {
          actions: [{ type: 'order_discount_fixed', value: 3 }],
        },
        is_active: true,
        is_stackable: true,
        usage_limit: null,
        usage_count: 0,
        valid_from: null,
        valid_to: null,
      },
    ]

    const eligible = resolveEligibleDeals(deals, LINES, 'DRAGON', NOW)
    expect(eligible.ok).toBe(true)
    if (!eligible.ok) return

    const outcome = applyPromotions({
      lines: LINES,
      shippingCost: 0,
      promo: {
        id: 'promo_fixed',
        code: 'SAVE5',
        discount_type: 'fixed_amount',
        discount_value: 5,
        is_active: true,
        usage_limit: null,
        usage_count: 0,
        valid_from: null,
        valid_to: null,
      },
      deals: eligible.deals,
    })

    expect(outcome.appliedDeals.length).toBeGreaterThan(0)
    expect(outcome.dealDiscount).toBeGreaterThan(0)
    expect(outcome.promoDiscount).toBe(5)
    expect(outcome.lineDiscounts.reduce((sum, amount) => sum + amount, 0)).toBeCloseTo(
      outcome.dealDiscount + outcome.promoDiscount,
      2
    )
  })
})
