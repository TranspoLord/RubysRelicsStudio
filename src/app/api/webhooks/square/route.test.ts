import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'

/**
 * OCT #4: the Square webhook handler.
 *
 * Every request is signed the way Square signs one
 * (`base64(hmac_sha256(key, notificationUrl + body))`), so the tests exercise the
 * real fail-closed signature path. `after()` is captured rather than executed by
 * Next, which is what lets a test assert on the confirmation email.
 */

const plan = vi.hoisted(() => ({
  order: null as unknown,
  orderDetails: null as unknown,
  orderItems: [] as Array<Record<string, unknown>>,
  customRequest: null as unknown,
  orderLookupError: null as unknown,
  orderUpdateError: null as unknown,
  orderUpdates: [] as Array<Record<string, unknown>>,
  dedupeInsertError: null as unknown,
  dedupeDeletes: [] as string[],
  statusEventInserts: [] as Array<Record<string, unknown>>,
  statusEventInsertError: null as unknown,
  statusEventDeletes: [] as string[],
  refundClaimError: null as unknown,
  refundClaimId: 'claim-1',
  rpcResult: null as unknown,
  rpcError: null as unknown,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
}))

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  retrieveSquareOrder: vi.fn(),
  rateLimit: vi.fn(),
  safeLogError: vi.fn(),
}))

/** Callbacks handed to `after()`, so a test can run them on demand. */
const afterCallbacks = vi.hoisted(() => [] as Array<() => unknown>)

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return {
    ...actual,
    after: (callback: () => unknown) => {
      afterCallbacks.push(callback)
    },
  }
})

vi.mock('@/lib/supabase/client', () => ({ getSupabaseAdmin: () => makeSupabase() }))
vi.mock('@/lib/square/client', () => ({
  retrieveSquareOrder: mocks.retrieveSquareOrder,
  createSquareCheckout: vi.fn(),
  deleteSquarePaymentLink: vi.fn(),
}))
vi.mock('@/lib/resend/send', () => ({ sendEmail: mocks.sendEmail }))
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: mocks.rateLimit,
  rateLimitResponse: (retryAfter: number) =>
    new Response(JSON.stringify({ error: 'Too many requests.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
    }),
}))
vi.mock('@/lib/security/logger', () => ({ safeLogError: mocks.safeLogError }))

import { POST } from './route'

const NOTIFICATION_URL = 'https://example.test/api/webhooks/square'
const SIGNATURE_KEY = 'test-signature-key'
const LOCATION_ID = 'LOC-1'
const EVENT_ID = 'evt-1'
const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const SQUARE_ORDER_ID = 'square-order-1'

/** A table-aware PostgREST stand-in that is also awaitable, like the real one. */
function makeSupabase() {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {}
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let values: Record<string, unknown> | null = null

    const result = () => {
      if (table === 'exp_square_webhook_events') {
        return op === 'insert'
          ? { data: null, error: plan.dedupeInsertError }
          : { data: null, error: null }
      }
      if (table === 'exp_order_status_events') {
        return { data: null, error: plan.statusEventInsertError }
      }
      if (table === 'exp_orders') {
        if (op === 'update') {
          plan.orderUpdates.push(values as Record<string, unknown>)
          return { data: null, error: plan.orderUpdateError }
        }
        return { data: plan.order, error: plan.orderLookupError }
      }
      if (table === 'exp_order_items') {
        return { data: plan.orderItems, error: null }
      }
      return { data: null, error: null }
    }

    builder.select = vi.fn(() => builder)
    builder.insert = vi.fn((inserted: Record<string, unknown>) => {
      op = 'insert'
      values = inserted
      return builder
    })
    builder.update = vi.fn((updated: Record<string, unknown>) => {
      op = 'update'
      values = updated
      return builder
    })
    builder.delete = vi.fn(() => {
      op = 'delete'
      return builder
    })
    builder.eq = vi.fn((_column: string, value: unknown) => {
      if (op === 'delete' && table === 'exp_square_webhook_events') {
        plan.dedupeDeletes.push(String(value))
      }
      if (op === 'delete' && table === 'exp_order_status_events') {
        plan.statusEventDeletes.push(String(value))
      }
      return builder
    })
    builder.lt = vi.fn(() => builder)
    builder.or = vi.fn(() => builder)
    builder.in = vi.fn(() => builder)
    builder.limit = vi.fn(() => builder)
    builder.maybeSingle = vi.fn(async () => result())
    builder.single = vi.fn(async () => {
      if (table === 'exp_order_status_events' && op === 'insert') {
        plan.statusEventInserts.push(values as Record<string, unknown>)
        return {
          data: plan.refundClaimError ? null : { id: plan.refundClaimId },
          error: plan.refundClaimError,
        }
      }
      if (table === 'exp_orders') return { data: plan.orderDetails, error: null }
      if (table === 'exp_custom_requests') return { data: plan.customRequest, error: null }
      return { data: null, error: null }
    })
    builder.then = (
      onFulfilled: ((value: unknown) => unknown) | null,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result()).then(onFulfilled, onRejected)

    return builder
  }

  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    plan.rpcCalls.push({ name, args })
    return { data: plan.rpcResult, error: plan.rpcError }
  })

  return { from: vi.fn(from), rpc }
}

function sign(body: string, key = SIGNATURE_KEY): string {
  return createHmac('sha256', key).update(NOTIFICATION_URL + body).digest('base64')
}

function makeRequest(body: string, signature?: string | null): NextRequest {
  const headers: Record<string, string> = {}
  if (signature !== null) headers['x-square-hmacsha256-signature'] = signature ?? sign(body)
  return new NextRequest(NOTIFICATION_URL, { method: 'POST', headers, body })
}

function paymentEvent(status: string, overrides: Record<string, unknown> = {}) {
  return {
    event_id: EVENT_ID,
    type: 'payment.updated',
    data: {
      object: {
        payment: {
          id: 'pay-1',
          order_id: SQUARE_ORDER_ID,
          status,
          location_id: LOCATION_ID,
          created_at: '2026-10-10T01:27:30.000Z',
          amount_money: { amount: 3322, currency: 'USD' },
          ...overrides,
        },
      },
    },
  }
}

function refundEvent(status: string, overrides: Record<string, unknown> = {}) {
  return {
    event_id: 'evt-refund-1',
    type: 'refund.updated',
    data: {
      object: {
        refund: {
          id: 'refund-1',
          status,
          order_id: SQUARE_ORDER_ID,
          payment_id: 'pay-1',
          location_id: LOCATION_ID,
          created_at: '2026-10-11T10:00:00.000Z',
          updated_at: '2026-10-11T10:05:00.000Z',
          amount_money: { amount: 3322, currency: 'USD' },
          ...overrides,
        },
      },
    },
  }
}

async function post(event: Record<string, unknown>, options: { signature?: string | null } = {}) {
  const body = JSON.stringify(event)
  const response = await POST(makeRequest(body, options.signature))
  return { response, payload: await response.json() }
}

/** Run whatever the handler scheduled with `after()`. */
async function runAfterCallbacks() {
  await Promise.all(afterCallbacks.splice(0).map((callback) => callback()))
}

beforeEach(() => {
  vi.clearAllMocks()
  afterCallbacks.length = 0

  plan.order = { id: ORDER_ID, order_total: 33.22, payment_status: 'pending' }
  plan.orderDetails = {
    id: ORDER_ID,
    customer_email: 'buyer@example.com',
    custom_request_id: null,
    order_total: 33.22,
  }
  plan.orderItems = []
  plan.customRequest = null
  plan.orderLookupError = null
  plan.orderUpdateError = null
  plan.orderUpdates = []
  plan.dedupeInsertError = null
  plan.dedupeDeletes = []
  plan.statusEventInserts = []
  plan.statusEventInsertError = null
  plan.statusEventDeletes = []
  plan.refundClaimError = null
  plan.refundClaimId = 'claim-1'
  plan.rpcResult = { ok: true, reason: 'marked_paid' }
  plan.rpcError = null
  plan.rpcCalls = []

  process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = SIGNATURE_KEY
  process.env.SQUARE_WEBHOOK_NOTIFICATION_URL = NOTIFICATION_URL
  process.env.SQUARE_LOCATION_ID = LOCATION_ID

  mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 99 })
  mocks.retrieveSquareOrder.mockResolvedValue({ total_tax_money: { amount: 0 } })
  mocks.sendEmail.mockResolvedValue({ ok: true, id: 'email-1' })
})

afterEach(() => {
  delete process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
  delete process.env.SQUARE_WEBHOOK_NOTIFICATION_URL
  delete process.env.SQUARE_LOCATION_ID
})

describe('POST /api/webhooks/square — signature (SEC-003)', () => {
  it('rejects a body signed with the wrong key', async () => {
    const { response } = await post(paymentEvent('COMPLETED'), { signature: 'not-a-signature' })
    expect(response.status).toBe(401)
    expect(plan.rpcCalls).toEqual([])
  })

  it('rejects a request with no signature header', async () => {
    const { response } = await post(paymentEvent('COMPLETED'), { signature: null })
    expect(response.status).toBe(401)
    expect(plan.rpcCalls).toEqual([])
  })

  it('rejects a body that was signed for a different notification URL', async () => {
    const body = JSON.stringify(paymentEvent('COMPLETED'))
    const wrongUrlSignature = createHmac('sha256', SIGNATURE_KEY)
      .update('https://evil.test/api/webhooks/square' + body)
      .digest('base64')
    const response = await POST(makeRequest(body, wrongUrlSignature))
    expect(response.status).toBe(401)
  })
})

describe('POST /api/webhooks/square — payments (OCT #4)', () => {
  it('marks the order paid once on payment.updated COMPLETED, with Square tax', async () => {
    mocks.retrieveSquareOrder.mockResolvedValue({ total_tax_money: { amount: 300 } })

    const { response, payload } = await post(paymentEvent('COMPLETED'))

    expect(response.status).toBe(200)
    expect(payload.received).toBe(true)
    expect(plan.rpcCalls).toHaveLength(1)
    expect(plan.rpcCalls[0].name).toBe('exp_mark_order_paid')
    expect(plan.rpcCalls[0].args).toMatchObject({
      p_order_id: ORDER_ID,
      p_square_payment_id: 'pay-1',
      p_amount_cents: 3322,
      p_source: 'square_webhook',
      p_tax_cents: 300,
    })
    // The RPC owns the row; the handler must not also update it.
    expect(plan.orderUpdates).toEqual([])
  })

  it('does not call the RPC for a FAILED payment and only downgrades a pending order', async () => {
    const { response } = await post(paymentEvent('FAILED'))

    expect(response.status).toBe(200)
    expect(plan.rpcCalls).toEqual([])
    expect(plan.orderUpdates).toEqual([
      { payment_status: 'failed', updated_at: expect.any(String) },
    ])
  })

  it('does not call the RPC for an APPROVED payment (not money yet)', async () => {
    const { response, payload } = await post(paymentEvent('APPROVED'))

    expect(response.status).toBe(200)
    expect(payload.payment_status).toBe('APPROVED')
    expect(plan.rpcCalls).toEqual([])
  })

  it('refuses to mark paid when amount_money is missing', async () => {
    const { payload } = await post(paymentEvent('COMPLETED', { amount_money: undefined }))

    expect(payload.missing_amount).toBe(true)
    expect(plan.rpcCalls).toEqual([])
  })

  it('refuses a non-USD payment', async () => {
    const { payload } = await post(
      paymentEvent('COMPLETED', { amount_money: { amount: 3322, currency: 'CAD' } }),
    )

    expect(payload.currency_mismatch).toBe(true)
    expect(plan.rpcCalls).toEqual([])
  })

  it('ignores a payment from another Square location', async () => {
    const { payload } = await post(paymentEvent('COMPLETED', { location_id: 'LOC-OTHER' }))

    expect(payload.location_mismatch).toBe(true)
    expect(plan.rpcCalls).toEqual([])
  })

  it('treats a 23505 dedupe conflict as a duplicate delivery', async () => {
    plan.dedupeInsertError = { code: '23505', message: 'duplicate key' }

    const { response, payload } = await post(paymentEvent('COMPLETED'))

    expect(response.status).toBe(200)
    expect(payload.duplicate).toBe(true)
    expect(plan.rpcCalls).toEqual([])
  })

  it('returns 500 and clears the dedupe row when the order lookup fails', async () => {
    plan.orderLookupError = { code: '57014', message: 'statement timeout' }

    const { response } = await post(paymentEvent('COMPLETED'))

    expect(response.status).toBe(500)
    expect(plan.dedupeDeletes).toEqual([EVENT_ID])
    expect(plan.rpcCalls).toEqual([])
  })

  it('returns 500 and clears the dedupe row when the RPC fails', async () => {
    plan.rpcError = { code: 'P0001', message: 'boom' }

    const { response } = await post(paymentEvent('COMPLETED'))

    expect(response.status).toBe(500)
    expect(plan.dedupeDeletes).toEqual([EVENT_ID])
  })

  it('does not email twice when the RPC reports already_paid', async () => {
    plan.rpcResult = { ok: true, reason: 'already_paid' }

    const { payload } = await post(paymentEvent('COMPLETED'))

    expect(payload.already_paid).toBe(true)
    await runAfterCallbacks()
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('schedules the customer email with after() and sends it once', async () => {
    plan.orderDetails = {
      id: ORDER_ID,
      customer_email: 'buyer@example.com',
      custom_request_id: 'req-1',
      order_total: 33.22,
    }
    plan.customRequest = {
      id: 'req-1',
      item_type: 'sticker',
      customer_name: 'Ada',
      customer_access_token: 'tok',
    }

    const { response } = await post(paymentEvent('COMPLETED'))
    expect(response.status).toBe(200)

    // Scheduled, not awaited: the 200 must not wait on Resend.
    expect(mocks.sendEmail).not.toHaveBeenCalled()

    await runAfterCallbacks()

    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)
    expect(mocks.sendEmail.mock.calls[0][0]).toMatchObject({
      to: 'buyer@example.com',
      idempotencyKey: `paid:${ORDER_ID}`,
    })
  })

  it('emails a shop order once, with its items and the order link (OCT #13)', async () => {
    plan.orderDetails = {
      id: ORDER_ID,
      customer_email: 'buyer@example.com',
      custom_request_id: null,
      order_total: 33.22,
      guest_tracking_token: 'tok',
      production_estimate_band: '1–2 weeks',
    }
    plan.orderItems = [
      {
        product_title: 'Slate Coasters',
        variant_label: 'Holder built',
        quantity: 1,
        line_total: 25,
        selected_options: { coaster_shape: 'square' },
      },
    ]

    const { response } = await post(paymentEvent('COMPLETED'))
    expect(response.status).toBe(200)
    expect(mocks.sendEmail).not.toHaveBeenCalled()

    await runAfterCallbacks()

    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)
    const sent = mocks.sendEmail.mock.calls[0][0] as {
      to: string
      idempotencyKey: string
      html: string
    }
    expect(sent.to).toBe('buyer@example.com')
    expect(sent.idempotencyKey).toBe(`paid:${ORDER_ID}`)
    expect(sent.html).toContain('/orders/')
    expect(sent.html).toContain('Slate Coasters')
    expect(sent.html).toContain('coaster_shape')
    expect(sent.html).toContain('33.22')
  })

  it('backfills the buyer email from Square when the order has none (OCT #13)', async () => {
    plan.orderDetails = {
      id: ORDER_ID,
      customer_email: null,
      custom_request_id: null,
      order_total: 33.22,
      guest_tracking_token: 'tok',
      production_estimate_band: 'To be confirmed',
    }

    await post(paymentEvent('COMPLETED', { buyer_email_address: 'square-buyer@example.com' }))
    await runAfterCallbacks()

    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)
    expect((mocks.sendEmail.mock.calls[0][0] as { to: string }).to).toBe('square-buyer@example.com')
    expect(plan.orderUpdates).toContainEqual({
      customer_email: 'square-buyer@example.com',
      updated_at: expect.any(String),
    })
  })

  it('accepts a payment for an unknown Square order without marking anything paid', async () => {
    plan.order = null

    const { payload } = await post(paymentEvent('COMPLETED'))

    expect(payload.order_found).toBe(false)
    expect(plan.rpcCalls).toEqual([])
  })
})

describe('POST /api/webhooks/square — refunds (OCT #4)', () => {
  const PAID_ORDER = {
    id: ORDER_ID,
    order_total: 33.22,
    payment_status: 'paid',
    refunded_amount: null,
  }

  it('marks a full refund and records the Square refund id on the status event', async () => {
    plan.order = PAID_ORDER

    const { response, payload } = await post(refundEvent('COMPLETED'))

    expect(response.status).toBe(200)
    expect(payload.refund_applied).toBe('refunded')
    expect(plan.orderUpdates).toEqual([
      {
        payment_status: 'refunded',
        refunded_amount: 33.22,
        refunded_at: '2026-10-11T10:05:00.000Z',
        updated_at: expect.any(String),
      },
    ])
    expect(plan.statusEventInserts[0]).toMatchObject({
      action_type: 'refund_webhook',
      previous_payment_status: 'paid',
      next_payment_status: 'refunded',
      created_by: 'square_webhook',
      metadata: { square_refund_id: 'refund-1', amount_cents: 3322 },
    })
  })

  it('accumulates a partial refund and reports partially_refunded', async () => {
    plan.order = { ...PAID_ORDER, refunded_amount: 10 }

    const { payload } = await post(
      refundEvent('COMPLETED', { amount_money: { amount: 500, currency: 'USD' } }),
    )

    expect(payload.refund_applied).toBe('partially_refunded')
    expect(plan.orderUpdates[0]).toMatchObject({
      payment_status: 'partially_refunded',
      refunded_amount: 15,
    })
  })

  it('treats a refund that covers the record as full (the charge includes tax)', async () => {
    // Square's automatic tax makes the charge larger than `order_total` (OCT #35).
    plan.order = { ...PAID_ORDER, order_total: 30 }

    const { payload } = await post(refundEvent('COMPLETED'))

    expect(payload.refund_applied).toBe('refunded')
  })

  it('does not touch the order for a PENDING refund', async () => {
    plan.order = PAID_ORDER

    const { payload } = await post(refundEvent('PENDING'))

    expect(payload.refund_status).toBe('PENDING')
    expect(plan.orderUpdates).toEqual([])
    expect(plan.statusEventInserts).toEqual([])
  })

  it('ignores a refund for an order that was never paid', async () => {
    plan.order = { ...PAID_ORDER, payment_status: 'pending' }

    const { payload } = await post(refundEvent('COMPLETED'))

    expect(payload.refund_ignored).toBe('not_paid')
    expect(plan.orderUpdates).toEqual([])
  })

  it('does not double-count a refund that was already applied', async () => {
    plan.order = { ...PAID_ORDER, payment_status: 'refunded', refunded_amount: 33.22 }
    plan.refundClaimError = { code: '23505', message: 'duplicate key value violates unique constraint' }

    const { response, payload } = await post(refundEvent('COMPLETED'))

    expect(response.status).toBe(200)
    expect(payload.refund_already_applied).toBe(true)
    expect(plan.orderUpdates).toEqual([])
  })

  it('refuses a refund with no usable amount', async () => {
    plan.order = PAID_ORDER

    const { payload } = await post(refundEvent('COMPLETED', { amount_money: undefined }))

    expect(payload.missing_amount).toBe(true)
    expect(plan.orderUpdates).toEqual([])
  })

  it('releases the claim and the dedupe row when the order update fails', async () => {
    plan.order = PAID_ORDER
    plan.orderUpdateError = { code: '57014', message: 'statement timeout' }

    const { response } = await post(refundEvent('COMPLETED'))

    expect(response.status).toBe(500)
    expect(plan.statusEventDeletes).toEqual(['claim-1'])
    expect(plan.dedupeDeletes).toEqual(['evt-refund-1'])
  })

  it('accepts a refund for an unknown order without touching anything', async () => {
    plan.order = null

    const { payload } = await post(refundEvent('COMPLETED'))

    expect(payload.order_found).toBe(false)
    expect(plan.orderUpdates).toEqual([])
  })

  it('falls back to the payment id when Square omits the order id', async () => {
    plan.order = PAID_ORDER

    const { response } = await post(refundEvent('COMPLETED', { order_id: undefined }))

    expect(response.status).toBe(200)
    expect(plan.orderUpdates).toHaveLength(1)
  })
})

