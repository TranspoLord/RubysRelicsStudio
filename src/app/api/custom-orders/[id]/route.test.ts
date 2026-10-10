import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * OCT #15 / #28: the admin custom-request actions.
 *
 * The money-safety rules under test: the status is checked *before* a payable
 * link exists, a re-quote deletes the previous link and cancels its pending
 * order, a failed order insert deletes the link it just made, and a failed email
 * is reported instead of swallowed.
 */

const state = vi.hoisted(() => ({ body: {} as Record<string, unknown> }))

const plan = vi.hoisted(() => ({
  requestRow: null as unknown,
  requestLookupError: null as unknown,
  updatedRequest: null as unknown,
  requestUpdateError: null as unknown,
  requestUpdates: [] as Array<Record<string, unknown>>,
  orderInserts: [] as Array<Record<string, unknown>>,
  orderInsertError: null as unknown,
  orderUpdates: [] as Array<Record<string, unknown>>,
  orderUpdateError: null as unknown,
  cancelledOrders: [] as Array<{ id: string }>,
  paidOrder: null as unknown,
  orderLookupError: null as unknown,
  statusEventInserts: [] as Array<Record<string, unknown>>,
  eqCalls: [] as Array<{ table: string; column: string; value: unknown }>,
  squareLinkError: null as unknown,
}))

const mocks = vi.hoisted(() => ({
  createSquareCheckout: vi.fn(),
  deleteSquarePaymentLink: vi.fn(),
  sendEmail: vi.fn(),
  safeLogError: vi.fn(),
}))

vi.mock('@/lib/admin/auth', () => ({ requireAdminApiSession: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/lib/admin/audit', () => ({ writeAdminAuditLog: vi.fn(async () => undefined) }))
vi.mock('@/lib/supabase/client', () => ({ getSupabaseAdmin: () => makeSupabase(), branch: 'DEV' }))
vi.mock('@/lib/resend/send', () => ({ sendEmail: mocks.sendEmail }))
vi.mock('@/lib/square/client', () => ({
  createSquareCheckout: mocks.createSquareCheckout,
  deleteSquarePaymentLink: mocks.deleteSquarePaymentLink,
}))
vi.mock('@/lib/security/body', () => ({
  parseJsonBodyOrError: vi.fn(async () => ({ ok: true, body: state.body })),
}))
vi.mock('@/lib/security/logger', () => ({ safeLogError: mocks.safeLogError }))

import { PATCH } from './route'

const REQUEST_ID = '44444444-4444-4444-8444-444444444444'
const OLD_LINK_ID = 'square-link-old'
const NEW_LINK_ID = 'square-link-new'

function makeSupabase() {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {}
    let op: 'select' | 'insert' | 'update' = 'select'
    let values: Record<string, unknown> | null = null

    const result = () => {
      if (table === 'exp_custom_requests') {
        if (op === 'update') {
          plan.requestUpdates.push(values as Record<string, unknown>)
          return { data: plan.updatedRequest, error: plan.requestUpdateError }
        }
        return { data: plan.requestRow, error: plan.requestLookupError }
      }
      if (table === 'exp_orders') {
        if (op === 'insert') {
          plan.orderInserts.push(values as Record<string, unknown>)
          return { data: null, error: plan.orderInsertError }
        }
        if (op === 'update') {
          plan.orderUpdates.push(values as Record<string, unknown>)
          return { data: plan.cancelledOrders, error: plan.orderUpdateError }
        }
        return { data: plan.paidOrder, error: plan.orderLookupError }
      }
      if (table === 'exp_order_status_events' && op === 'insert') {
        plan.statusEventInserts.push(values as Record<string, unknown>)
        return { data: null, error: null }
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
    builder.eq = vi.fn((column: string, value: unknown) => {
      plan.eqCalls.push({ table, column, value })
      return builder
    })
    builder.in = vi.fn(() => builder)
    builder.order = vi.fn(() => builder)
    builder.limit = vi.fn(() => builder)
    builder.single = vi.fn(async () => result())
    builder.maybeSingle = vi.fn(async () => result())
    builder.then = (
      onFulfilled: ((value: unknown) => unknown) | null,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result()).then(onFulfilled, onRejected)

    return builder
  }

  return { from: vi.fn(from), rpc: vi.fn() }
}

function makeRequest() {
  return new Request('http://localhost:3000/api/custom-orders/' + REQUEST_ID, { method: 'PATCH' })
}

async function patch() {
  const response = await PATCH(makeRequest(), { params: Promise.resolve({ id: REQUEST_ID }) })
  return { response, payload: await response.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  state.body = { action: 'send_quote', quoteAmount: 150 }

  plan.requestRow = {
    id: REQUEST_ID,
    status: 'awaiting_quote',
    customer_email: 'buyer@example.com',
    item_type: 'sticker',
    customer_access_token: 'tok',
    quote_amount: null,
    quote_expires_at: null,
    quote_resend_count: 0,
    square_payment_link_id: null,
    square_payment_link_url: null,
    internal_notes: null,
  }
  plan.requestLookupError = null
  plan.updatedRequest = { id: REQUEST_ID, status: 'quote_sent', quote_amount: 150 }
  plan.requestUpdateError = null
  plan.requestUpdates = []
  plan.orderInserts = []
  plan.orderInsertError = null
  plan.orderUpdates = []
  plan.orderUpdateError = null
  plan.cancelledOrders = []
  plan.paidOrder = { id: 'order-1', status: 'awaiting_payment', payment_status: 'paid' }
  plan.orderLookupError = null
  plan.statusEventInserts = []
  plan.eqCalls = []
  plan.squareLinkError = null

  mocks.createSquareCheckout.mockImplementation(async () => {
    if (plan.squareLinkError) throw plan.squareLinkError
    return {
      payment_link: {
        id: NEW_LINK_ID,
        url: 'https://square.link/u/new',
        order_id: 'square-order-new',
        created_at: '2026-10-10T00:00:00Z',
      },
    }
  })
  mocks.deleteSquarePaymentLink.mockResolvedValue(undefined)
  mocks.sendEmail.mockResolvedValue({ ok: true, id: 'email-1' })
})

describe('PATCH /api/custom-orders/[id] — send_quote (OCT #15/#28)', () => {
  it('refuses to quote a request that is already paid, without touching Square', async () => {
    plan.requestRow = { ...(plan.requestRow as Record<string, unknown>), status: 'paid' }

    const { response, payload } = await patch()

    expect(response.status).toBe(400)
    expect(payload.error).toContain('awaiting_quote')
    expect(mocks.createSquareCheckout).not.toHaveBeenCalled()
    expect(plan.orderInserts).toEqual([])
  })

  it('creates the link and the order for a first quote', async () => {
    const { response, payload } = await patch()

    expect(response.status).toBe(200)
    expect(mocks.createSquareCheckout).toHaveBeenCalledTimes(1)
    expect(plan.orderInserts).toHaveLength(1)
    expect(plan.orderInserts[0]).toMatchObject({
      square_order_id: 'square-order-new',
      order_path: 'custom',
      payment_mode: 'square_payment_link',
    })
    expect(payload.warnings).toEqual([])
    expect(payload.paymentLinkUrl).toBe('https://square.link/u/new')
    expect(mocks.deleteSquarePaymentLink).not.toHaveBeenCalled()
  })

  it('deletes the previous link and cancels its pending order on a re-quote', async () => {
    plan.requestRow = {
      ...(plan.requestRow as Record<string, unknown>),
      status: 'quote_sent',
      square_payment_link_id: OLD_LINK_ID,
      square_payment_link_url: 'https://square.link/u/old',
    }
    plan.cancelledOrders = [{ id: 'old-order-1' }]

    const { response } = await patch()

    expect(response.status).toBe(200)
    expect(mocks.deleteSquarePaymentLink).toHaveBeenCalledWith(OLD_LINK_ID)
    expect(plan.orderUpdates[0]).toMatchObject({ status: 'cancelled' })
    expect(plan.eqCalls).toContainEqual({
      table: 'exp_orders',
      column: 'payment_status',
      value: 'pending',
    })
    expect(plan.statusEventInserts[0]).toMatchObject({
      order_id: 'old-order-1',
      action_type: 'cancel',
      note: 'Superseded by re-quote',
    })
    // …and the replacement link is still created.
    expect(mocks.createSquareCheckout).toHaveBeenCalledTimes(1)
  })

  it('reports a failed email instead of claiming success', async () => {
    mocks.sendEmail.mockResolvedValue({ ok: false, error: 'resend 429', retryable: true })

    const { response, payload } = await patch()

    expect(response.status).toBe(200)
    expect(payload.warnings).toEqual(['email_not_sent'])
  })

  it('deletes the new link and fails when the order row cannot be written', async () => {
    plan.orderInsertError = { code: '23514', message: 'check constraint' }

    const { response } = await patch()

    expect(response.status).toBe(500)
    expect(mocks.deleteSquarePaymentLink).toHaveBeenCalledWith(NEW_LINK_ID)
  })

  it('never writes admin_notes and appends an internal note with a timestamp', async () => {
    state.body = { action: 'send_quote', quoteAmount: 150, internalNote: 'Rush job for Ada' }

    const { response } = await patch()
    expect(response.status).toBe(200)

    const update = plan.requestUpdates[0]
    expect(update).not.toHaveProperty('admin_notes')
    expect(String(update.internal_notes)).toContain('Rush job for Ada')
    expect(String(update.internal_notes)).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\]/)
  })

  it('leaves admin_notes and internal_notes alone when no note is given', async () => {
    const { response } = await patch()

    expect(response.status).toBe(200)
    expect(plan.requestUpdates[0]).not.toHaveProperty('admin_notes')
    expect(plan.requestUpdates[0]).not.toHaveProperty('internal_notes')
  })

  it('emails only the customer message', async () => {
    state.body = {
      action: 'send_quote',
      quoteAmount: 150,
      customerMessage: 'Hi Ada',
      internalNote: 'private studio remark',
    }

    await patch()

    const html = (mocks.sendEmail.mock.calls[0][0] as { html: string }).html
    expect(html).toContain('Hi Ada')
    expect(html).not.toContain('private studio remark')
    expect(html).toContain('replaces any earlier quote link')
  })
})

describe('PATCH /api/custom-orders/[id] — handoff (OCT #15)', () => {
  it('hands off the paid linked order, not the newest one', async () => {
    plan.requestRow = { ...(plan.requestRow as Record<string, unknown>), status: 'paid' }
    plan.updatedRequest = {
      id: REQUEST_ID,
      status: 'paid',
      production_handoff_at: '2026-10-10T00:00:00.000Z',
    }
    state.body = { action: 'handoff_to_production' }

    const { response } = await patch()

    expect(response.status).toBe(200)
    expect(plan.eqCalls).toContainEqual({
      table: 'exp_orders',
      column: 'payment_status',
      value: 'paid',
    })
    expect(plan.orderUpdates[0]).toMatchObject({ status: 'in_production' })
  })
})
