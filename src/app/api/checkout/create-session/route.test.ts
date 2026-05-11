import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  getStripeCheckoutSettings: vi.fn(),
  getGuestOrderTrackingSettings: vi.fn(),
  computeCanonicalLine: vi.fn(),
  getStripeServerClient: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  branch: 'test-branch',
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}))

vi.mock('@/lib/storefront-settings', () => ({
  getStripeCheckoutSettings: mocks.getStripeCheckoutSettings,
  getGuestOrderTrackingSettings: mocks.getGuestOrderTrackingSettings,
}))

vi.mock('@/lib/pricing/engine', () => ({
  computeCanonicalLine: mocks.computeCanonicalLine,
}))

vi.mock('@/lib/stripe/server', () => ({
  getStripeServerClient: mocks.getStripeServerClient,
}))

import { POST } from './route'

function createSupabaseForReserveFailure() {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: { ok: false, reason: 'insufficient_stock' }, error: null })
    .mockResolvedValueOnce({ data: { ok: true, reason: 'released' }, error: null })

  const orderUpdateEq = vi.fn(async () => ({ error: null }))

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'exp_products') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: 'prod_1',
                  title: 'Ready Made Item',
                  is_active: true,
                  is_archived: false,
                  base_price: 25,
                  production_estimate_band: '3-5 days',
                },
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === 'exp_product_variants' || table === 'exp_product_options') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: [], error: null })),
          })),
        }
      }

      if (table === 'exp_product_bulk_discounts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ data: [], error: null })),
            })),
          })),
        }
      }

      if (table === 'exp_orders') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id: 'ord_123' }, error: null })),
            })),
          })),
          update: vi.fn(() => ({
            eq: orderUpdateEq,
          })),
        }
      }

      if (table === 'exp_order_items') {
        return {
          insert: vi.fn(async () => ({ error: null })),
        }
      }

      throw new Error(`Unexpected table mocked: ${table}`)
    }),
    rpc,
  }

  return { supabase, rpc, orderUpdateEq }
}

describe('POST /api/checkout/create-session', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.getStripeCheckoutSettings.mockResolvedValue({
      enabled: true,
      disabled_message: 'Checkout disabled',
    })

    mocks.getGuestOrderTrackingSettings.mockResolvedValue({
      enabled: true,
      notify_email: 'ops@example.com',
    })

    mocks.computeCanonicalLine.mockReturnValue({
      productId: 'prod_1',
      name: 'Ready Made Item',
      variantId: null,
      variantLabel: null,
      selectedOptions: {},
      unitPriceBeforeDiscount: 25,
      lineSubtotal: 25,
      lineDiscount: 0,
      lineTotal: 25,
      quantity: 1,
      unitAmountCents: 2500,
      appliedTier: null,
      description: undefined,
    })

    mocks.getStripeServerClient.mockReturnValue({
      checkout: {
        sessions: {
          create: vi.fn(async () => ({ id: 'cs_test', url: 'https://stripe.test/session' })),
        },
      },
    })
  })

  it('returns 409 and releases inventory when reservation fails with insufficient stock', async () => {
    const { supabase, rpc, orderUpdateEq } = createSupabaseForReserveFailure()
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const request = new Request('http://localhost/api/checkout/create-session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        items: [
          {
            productId: 'prod_1',
            quantity: 1,
            options: [],
          },
        ],
      }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload).toEqual({
      error: 'Some ready-made items sold out while checkout was initializing. Please refresh your cart quantities and try again.',
    })

    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc).toHaveBeenNthCalledWith(1, 'exp_reserve_order_inventory', { p_order_id: 'ord_123' })
    expect(rpc).toHaveBeenNthCalledWith(2, 'exp_release_order_inventory', {
      p_order_id: 'ord_123',
      p_note: 'Checkout reservation failed due to insufficient stock.',
    })

    expect(orderUpdateEq).toHaveBeenCalledTimes(1)
  })
})
