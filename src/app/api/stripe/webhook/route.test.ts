import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  getStripeServerClient: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  processBackInStockAlerts: vi.fn(),
  processCheckoutAbandonmentRecovery: vi.fn(),
}))

vi.mock('@/lib/stripe/server', () => ({
  getStripeServerClient: mocks.getStripeServerClient,
}))

vi.mock('@/lib/supabase/client', () => ({
  branch: 'test-branch',
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}))

vi.mock('@/lib/resend/client', () => ({
  getResend: vi.fn(),
  getEmailSenderAddress: vi.fn(),
}))

vi.mock('@/lib/storefront-settings', () => ({
  getGuestOrderTrackingSettings: vi.fn(async () => ({ enabled: true, notify_email: 'ops@example.com' })),
}))

vi.mock('@/lib/back-in-stock', () => ({
  processBackInStockAlerts: mocks.processBackInStockAlerts,
}))

vi.mock('@/lib/abandoned-cart', () => ({
  processCheckoutAbandonmentRecovery: mocks.processCheckoutAbandonmentRecovery,
}))

import { POST } from './route'

function createWebhookSupabaseForDuplicate() {
  const insert = vi.fn(async () => ({ error: { code: '23505', message: 'duplicate' } }))

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'exp_stripe_webhook_events') {
        return { insert }
      }

      return {
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      }
    }),
    rpc: vi.fn(async () => ({ data: { ok: true }, error: null })),
  }

  return { supabase, insert }
}

function createWebhookSupabaseForSessionExpired() {
  const insert = vi.fn(async () => ({ error: null }))
  const orderUpdateEq = vi.fn(async () => ({ error: null }))
  const markProcessedEq = vi.fn(async () => ({ error: null }))
  const rpc = vi.fn(async () => ({ data: { ok: true }, error: null }))

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'exp_stripe_webhook_events') {
        return {
          insert,
          update: vi.fn(() => ({
            eq: markProcessedEq,
          })),
        }
      }

      if (table === 'exp_orders') {
        return {
          update: vi.fn(() => ({
            eq: orderUpdateEq,
          })),
        }
      }

      if (table === 'exp_order_items') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({
              data: [{ product_id: 'prod_1' }],
              error: null,
            })),
          })),
        }
      }

      return {
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      }
    }),
    rpc,
  }

  return { supabase, insert, orderUpdateEq, markProcessedEq, rpc }
}

describe('POST /api/stripe/webhook', () => {
  const originalSecret = process.env.STRIPE_WEBHOOK_SECRET

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
    mocks.processBackInStockAlerts.mockResolvedValue({ scanned: 1, sent: 0, skipped: 1, failed: 0 })
    mocks.processCheckoutAbandonmentRecovery.mockResolvedValue(true)

    mocks.getStripeServerClient.mockReturnValue({
      webhooks: {
        constructEvent: mocks.constructEvent,
      },
    })
  })

  afterAll(() => {
    process.env.STRIPE_WEBHOOK_SECRET = originalSecret
  })

  it('returns duplicate=true when webhook event id already exists', async () => {
    const { supabase, insert } = createWebhookSupabaseForDuplicate()
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    mocks.constructEvent.mockReturnValue({
      id: 'evt_duplicate',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_123', metadata: {} } },
    })

    const request = new Request('http://localhost/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': 'sig_test',
      },
      body: '{"ok":true}',
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ received: true, duplicate: true })
    expect(insert).toHaveBeenCalledTimes(1)
  })

  it('releases inventory for checkout.session.expired order flow', async () => {
    const { supabase, rpc, orderUpdateEq, markProcessedEq } = createWebhookSupabaseForSessionExpired()
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    mocks.constructEvent.mockReturnValue({
      id: 'evt_expired',
      type: 'checkout.session.expired',
      data: {
        object: {
          id: 'cs_expired',
          metadata: { order_id: 'ord_expired_1' },
        },
      },
    })

    const request = new Request('http://localhost/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': 'sig_test',
      },
      body: '{"ok":true}',
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ received: true })
    expect(orderUpdateEq).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('exp_release_order_inventory', {
      p_order_id: 'ord_expired_1',
      p_note: 'Checkout session expired before payment.',
    })
    expect(mocks.processBackInStockAlerts).toHaveBeenCalledWith({ productIds: ['prod_1'], limit: 250 })
    expect(mocks.processCheckoutAbandonmentRecovery).toHaveBeenCalledWith('ord_expired_1')
    expect(markProcessedEq).toHaveBeenCalledWith('event_id', 'evt_expired')
  })

  it('releases inventory for checkout.session.async_payment_failed order flow', async () => {
    const { supabase, rpc, orderUpdateEq, markProcessedEq } = createWebhookSupabaseForSessionExpired()
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    mocks.constructEvent.mockReturnValue({
      id: 'evt_async_failed',
      type: 'checkout.session.async_payment_failed',
      data: {
        object: {
          id: 'cs_async_fail',
          metadata: { order_id: 'ord_async_1' },
        },
      },
    })

    const request = new Request('http://localhost/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': 'sig_test',
      },
      body: '{"ok":true}',
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ received: true })
    expect(orderUpdateEq).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('exp_release_order_inventory', {
      p_order_id: 'ord_async_1',
      p_note: 'Checkout async payment failed.',
    })
    expect(mocks.processBackInStockAlerts).toHaveBeenCalledWith({ productIds: ['prod_1'], limit: 250 })
    expect(markProcessedEq).toHaveBeenCalledWith('event_id', 'evt_async_failed')
  })

  it('marks order as refunded for charge.refunded event', async () => {
    const insert = vi.fn(async () => ({ error: null }))
    const orderUpdateEq = vi.fn(async () => ({ error: null }))
    const markProcessedEq = vi.fn(async () => ({ error: null }))

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'exp_stripe_webhook_events') {
          return {
            insert,
            update: vi.fn(() => ({
              eq: markProcessedEq,
            })),
          }
        }

        if (table === 'exp_orders') {
          return {
            update: vi.fn(() => ({
              eq: orderUpdateEq,
            })),
          }
        }

        return {
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        }
      }),
      rpc: vi.fn(async () => ({ data: { ok: true }, error: null })),
    }

    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    mocks.constructEvent.mockReturnValue({
      id: 'evt_refunded',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_refunded',
          payment_intent: 'pi_refunded_1',
        },
      },
    })

    const request = new Request('http://localhost/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': 'sig_test',
      },
      body: '{"ok":true}',
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ received: true })
    expect(orderUpdateEq).toHaveBeenCalledTimes(1)
    expect(markProcessedEq).toHaveBeenCalledWith('event_id', 'evt_refunded')
  })

  it('marks order as failed for payment_intent.payment_failed event', async () => {
    const insert = vi.fn(async () => ({ error: null }))
    const orderUpdateEq = vi.fn(async () => ({ error: null }))
    const markProcessedEq = vi.fn(async () => ({ error: null }))

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'exp_stripe_webhook_events') {
          return {
            insert,
            update: vi.fn(() => ({
              eq: markProcessedEq,
            })),
          }
        }

        if (table === 'exp_orders') {
          return {
            update: vi.fn(() => ({
              eq: orderUpdateEq,
            })),
          }
        }

        return {
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        }
      }),
      rpc: vi.fn(async () => ({ data: { ok: true }, error: null })),
    }

    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    mocks.constructEvent.mockReturnValue({
      id: 'evt_payment_failed',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: 'pi_payment_failed',
        },
      },
    })

    const request = new Request('http://localhost/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': 'sig_test',
      },
      body: '{"ok":true}',
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ received: true })
    expect(orderUpdateEq).toHaveBeenCalledTimes(1)
    expect(markProcessedEq).toHaveBeenCalledWith('event_id', 'evt_payment_failed')
  })

  it('upserts custom order as paid for checkout.session.completed with payment link', async () => {
    const insert = vi.fn(async () => ({ error: null }))
    const markProcessedEq = vi.fn(async () => ({ error: null }))
    const customRequestSelectEq = vi.fn(async () => ({
      data: { id: 'req_custom_1' },
      error: null,
    }))
    const customRequestLoadSingleEq = vi.fn(async () => ({
      data: {
        id: 'req_custom_1',
        status: 'quote_sent',
        quote_amount: '500.00',
        quote_expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
      error: null,
    }))
    const requestUpdateEq = vi.fn(async () => ({ error: null }))

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'exp_stripe_webhook_events') {
          return {
            insert,
            update: vi.fn(() => ({
              eq: markProcessedEq,
            })),
          }
        }

        if (table === 'exp_custom_requests') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((column: string, value: string) => ({
                single: customRequestLoadSingleEq,
              })),
            })),
            update: vi.fn(() => ({
              eq: requestUpdateEq,
            })),
          }
        }

        if (table === 'exp_orders') {
          return {
            upsert: vi.fn(async () => ({ error: null })),
          }
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({
              single: vi.fn(async () => ({ data: null, error: { message: 'unsupported' } })),
            })),
          })),
        }
      }),
      rpc: vi.fn(async () => ({ data: { ok: true }, error: null })),
    }

    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    mocks.constructEvent.mockReturnValue({
      id: 'evt_custom_paid',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_custom_paid',
          payment_link: 'plink_custom_1',
          payment_intent: 'pi_custom_1',
          metadata: {},
        },
      },
    })

    const request = new Request('http://localhost/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': 'sig_test',
      },
      body: '{"ok":true}',
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ received: true })
    expect(markProcessedEq).toHaveBeenCalledWith('event_id', 'evt_custom_paid')
  })

  it('ignores checkout.session.completed with expired quote', async () => {
    const insert = vi.fn(async () => ({ error: null }))
    const customRequestUpdateEq = vi.fn(async () => ({ error: null }))

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'exp_stripe_webhook_events') {
          return {
            insert,
            update: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          }
        }

        if (table === 'exp_custom_requests') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    id: 'req_expired',
                    status: 'quote_sent',
                    quote_amount: '300.00',
                    quote_expires_at: new Date(Date.now() - 3600000).toISOString(),
                  },
                  error: null,
                })),
              })),
            })),
            update: vi.fn(() => ({
              eq: customRequestUpdateEq,
            })),
          }
        }

        if (table === 'exp_orders') {
          return {
            upsert: vi.fn(async () => ({ error: null })),
          }
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({
              single: vi.fn(async () => ({ data: null, error: { message: 'unsupported' } })),
            })),
          })),
        }
      }),
      rpc: vi.fn(async () => ({ data: { ok: true }, error: null })),
    }

    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    mocks.constructEvent.mockReturnValue({
      id: 'evt_expired_quote',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_expired_quote',
          payment_link: 'plink_expired',
          payment_intent: 'pi_expired',
          metadata: {},
        },
      },
    })

    const request = new Request('http://localhost/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': 'sig_test',
      },
      body: '{"ok":true}',
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ received: true, ignored: 'quote_expired' })
    expect(customRequestUpdateEq).toHaveBeenCalledTimes(1)
  })

  it('increments promo and deal usage for storefront order on checkout.session.completed', async () => {
    const insert = vi.fn(async () => ({ error: null }))
    const markProcessedEq = vi.fn(async () => ({ error: null }))

    const orderPrefetchMaybeSingle = vi.fn(async () => ({
      data: {
        id: 'ord_paid_1',
        payment_status: 'pending',
        cart_snapshot: {
          promotions: {
            promoCode: 'SAVE10',
            appliedDeals: [{ id: 'deal_1' }],
          },
        },
      },
      error: null,
    }))

    const promoMaybeSingle = vi.fn(async () => ({ data: { id: 'promo_1', usage_count: 4 }, error: null }))
    const dealMaybeSingle = vi.fn(async () => ({ data: { id: 'deal_1', usage_count: 2 }, error: null }))

    const orderUpdateEq = vi.fn(async () => ({ error: null }))
    const orderDiscountCodeEq = vi.fn(async () => ({ error: null }))
    const promoUpdateEq = vi.fn(async () => ({ error: null }))
    const dealUpdateEq = vi.fn(async () => ({ error: null }))

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'exp_stripe_webhook_events') {
          return {
            insert,
            update: vi.fn(() => ({
              eq: markProcessedEq,
            })),
          }
        }

        if (table === 'exp_orders') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({ maybeSingle: orderPrefetchMaybeSingle })),
            })),
            update: vi
              .fn()
              .mockReturnValueOnce({ eq: orderUpdateEq })
              .mockReturnValueOnce({ eq: orderDiscountCodeEq }),
          }
        }

        if (table === 'exp_promo_codes') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({ maybeSingle: promoMaybeSingle })),
            })),
            update: vi.fn(() => ({
              eq: promoUpdateEq,
            })),
          }
        }

        if (table === 'exp_bundle_deals') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({ maybeSingle: dealMaybeSingle })),
            })),
            update: vi.fn(() => ({
              eq: dealUpdateEq,
            })),
          }
        }

        return {
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        }
      }),
      rpc: vi.fn(async () => ({ data: { ok: true }, error: null })),
    }

    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    mocks.constructEvent.mockReturnValue({
      id: 'evt_paid_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_paid_1',
          payment_intent: 'pi_paid_1',
          payment_link: null,
          metadata: { order_id: 'ord_paid_1' },
        },
      },
    })

    const request = new Request('http://localhost/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': 'sig_test',
      },
      body: '{"ok":true}',
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ received: true })
    expect(orderUpdateEq).toHaveBeenCalledTimes(2)
    expect(promoUpdateEq).toHaveBeenCalledWith('id', 'promo_1')
    expect(dealUpdateEq).toHaveBeenCalledWith('id', 'deal_1')
    expect(markProcessedEq).toHaveBeenCalledWith('event_id', 'evt_paid_1')
  })
})
