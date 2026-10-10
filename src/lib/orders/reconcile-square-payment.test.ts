import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * OCT #13: the success-page reconcile. It must only ever run for a pending order
 * with a Square order id, must give the webhook a head start, and must take the
 * amount from Square's own order so a mismatch can never mark the wrong money
 * paid.
 */

const plan = vi.hoisted(() => ({
  order: null as unknown,
  orderError: null as unknown,
  squareOrder: null as unknown,
  squareError: null as unknown,
  rpcResult: null as unknown,
  rpcError: null as unknown,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
}))

vi.mock('@/lib/supabase/client', () => ({ getSupabaseAdmin: () => makeSupabase() }))
vi.mock('@/lib/square/client', () => ({
  retrieveSquareOrder: vi.fn(async () => {
    if (plan.squareError) throw plan.squareError
    return plan.squareOrder
  }),
}))
vi.mock('@/lib/security/logger', () => ({ safeLogError: vi.fn() }))

import { reconcileSquarePayment } from './reconcile-square-payment'

const ORDER_ID = '33333333-3333-4333-8333-333333333333'

function makeSupabase() {
  const builder: Record<string, unknown> = {}
  builder.select = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  builder.maybeSingle = vi.fn(async () => ({ data: plan.order, error: plan.orderError }))
  return {
    from: vi.fn(() => builder),
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      plan.rpcCalls.push({ name, args })
      return { data: plan.rpcResult, error: plan.rpcError }
    }),
  }
}

const OLD_ORDER = {
  id: ORDER_ID,
  square_order_id: 'square-order-1',
  payment_status: 'pending',
  created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
}

beforeEach(() => {
  plan.order = OLD_ORDER
  plan.orderError = null
  plan.squareOrder = {
    id: 'square-order-1',
    total_money: { amount: 3322, currency: 'USD' },
    total_tax_money: { amount: 300, currency: 'USD' },
    tenders: [{ payment_id: 'pay-1' }],
  }
  plan.squareError = null
  plan.rpcResult = { ok: true, reason: 'marked_paid' }
  plan.rpcError = null
  plan.rpcCalls = []
})

describe('reconcileSquarePayment (OCT #13)', () => {
  it('marks a pending order paid with Square\u2019s own amount and tax', async () => {
    await expect(reconcileSquarePayment(ORDER_ID)).resolves.toBe('marked_paid')

    expect(plan.rpcCalls).toHaveLength(1)
    expect(plan.rpcCalls[0].name).toBe('exp_mark_order_paid')
    expect(plan.rpcCalls[0].args).toMatchObject({
      p_order_id: ORDER_ID,
      p_square_payment_id: 'pay-1',
      p_amount_cents: 3322,
      p_tax_cents: 300,
      p_source: 'success_page_reconcile',
    })
  })

  it('skips an order that is already settled', async () => {
    plan.order = { ...OLD_ORDER, payment_status: 'paid' }

    await expect(reconcileSquarePayment(ORDER_ID)).resolves.toBe('skipped')
    expect(plan.rpcCalls).toEqual([])
  })

  it('skips an order with no Square order id', async () => {
    plan.order = { ...OLD_ORDER, square_order_id: null }

    await expect(reconcileSquarePayment(ORDER_ID)).resolves.toBe('skipped')
    expect(plan.rpcCalls).toEqual([])
  })

  it('gives the webhook a head start on a fresh order', async () => {
    plan.order = { ...OLD_ORDER, created_at: new Date().toISOString() }

    await expect(reconcileSquarePayment(ORDER_ID)).resolves.toBe('skipped')
    expect(plan.rpcCalls).toEqual([])
  })

  it('does nothing when Square reports no payment tender', async () => {
    plan.squareOrder = { id: 'square-order-1', tenders: [] }

    await expect(reconcileSquarePayment(ORDER_ID)).resolves.toBe('unchanged')
    expect(plan.rpcCalls).toEqual([])
  })

  it('stays unchanged when Square cannot be reached', async () => {
    plan.squareError = new Error('square down')

    await expect(reconcileSquarePayment(ORDER_ID)).resolves.toBe('unchanged')
    expect(plan.rpcCalls).toEqual([])
  })

  it('reports unchanged when the RPC refuses (amount mismatch)', async () => {
    plan.rpcResult = { ok: false, reason: 'amount_mismatch' }

    await expect(reconcileSquarePayment(ORDER_ID)).resolves.toBe('unchanged')
  })

  it('reports unchanged when the RPC errors', async () => {
    plan.rpcError = { code: 'P0001', message: 'boom' }

    await expect(reconcileSquarePayment(ORDER_ID)).resolves.toBe('unchanged')
  })

  it('skips an empty order id', async () => {
    await expect(reconcileSquarePayment('')).resolves.toBe('skipped')
  })
})
