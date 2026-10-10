import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'

/**
 * OCT #21: the Shippo tracking webhook.
 *
 * Two credential schemes are accepted (hex HMAC header, or the secret URL token
 * Shippo's dashboard can send instead), and the status mapping is exact:
 * `TRANSIT` → shipped, `DELIVERED` → delivered, with conditional updates so a
 * late scan cannot move an order backwards.
 */

const plan = vi.hoisted(() => ({
  order: null as unknown,
  orderLookupError: null as unknown,
  dedupeInsertError: null as unknown,
  orderUpdateError: null as unknown,
  deliveredRows: [] as Array<{ id: string }>,
  deliveredUpdateError: null as unknown,
  statusEventError: null as unknown,
  orderUpdates: [] as Array<Record<string, unknown>>,
  orderEqCalls: [] as Array<{ column: string; value: unknown }>,
  orderInCalls: [] as Array<{ column: string; values: unknown }>,
  statusEventInserts: [] as Array<Record<string, unknown>>,
  dedupeDeletes: [] as string[],
  processedUpdates: [] as Array<Record<string, unknown>>,
}))

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  safeLogError: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({ getSupabaseAdmin: () => makeSupabase() }))
vi.mock('@/lib/resend/send', () => ({ sendEmail: mocks.sendEmail }))
vi.mock('@/lib/security/logger', () => ({ safeLogError: mocks.safeLogError }))

import { POST } from './route'

const SECRET = 'test-shippo-secret'
const TOKEN = 'test-shippo-token'
const ORDER_ID = '22222222-2222-4222-8222-222222222222'

/** A table-aware PostgREST stand-in that is also awaitable, like the real one. */
function makeSupabase() {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {}
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let values: Record<string, unknown> | null = null

    const result = () => {
      if (table === 'exp_shippo_webhook_events') {
        if (op === 'insert') return { data: null, error: plan.dedupeInsertError }
        return { data: null, error: null }
      }
      if (table === 'exp_order_status_events') {
        return { data: null, error: plan.statusEventError }
      }
      if (table === 'exp_orders') {
        if (op === 'update') {
          plan.orderUpdates.push(values as Record<string, unknown>)
          return {
            data: plan.deliveredRows,
            error: plan.orderUpdateError ?? plan.deliveredUpdateError,
          }
        }
        return { data: plan.order, error: plan.orderLookupError }
      }
      return { data: null, error: null }
    }

    builder.select = vi.fn(() => builder)
    builder.insert = vi.fn((inserted: Record<string, unknown>) => {
      op = 'insert'
      values = inserted
      if (table === 'exp_order_status_events') plan.statusEventInserts.push(inserted)
      return builder
    })
    builder.update = vi.fn((updated: Record<string, unknown>) => {
      op = 'update'
      values = updated
      if (table === 'exp_shippo_webhook_events') plan.processedUpdates.push(updated)
      return builder
    })
    builder.delete = vi.fn(() => {
      op = 'delete'
      return builder
    })
    builder.eq = vi.fn((column: string, value: unknown) => {
      if (op === 'delete' && table === 'exp_shippo_webhook_events') {
        plan.dedupeDeletes.push(String(value))
      }
      if (table === 'exp_orders') plan.orderEqCalls.push({ column, value })
      return builder
    })
    builder.in = vi.fn((column: string, inValues: unknown) => {
      if (table === 'exp_orders') plan.orderInCalls.push({ column, values: inValues })
      return builder
    })
    builder.lt = vi.fn(() => builder)
    builder.single = vi.fn(async () => result())
    builder.then = (
      onFulfilled: ((value: unknown) => unknown) | null,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result()).then(onFulfilled, onRejected)

    return builder
  }

  return { from: vi.fn(from), rpc: vi.fn() }
}

function sign(body: string): string {
  return createHmac('sha256', SECRET).update(body).digest('hex')
}

function makeRequest(body: string, init: { signature?: string | null; token?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (init.signature !== null) headers['x-shippo-signature'] = init.signature ?? sign(body)
  const url = init.token
    ? `http://localhost/api/shippo/webhook?token=${encodeURIComponent(init.token)}`
    : 'http://localhost/api/shippo/webhook'
  return new Request(url, { method: 'POST', headers, body })
}

function trackingEvent(status: string, overrides: Record<string, unknown> = {}) {
  return {
    event: 'track_updated',
    data: {
      tracking_number: 'TRACK-1',
      carrier: 'USPS',
      status,
      status_details: 'scan',
      estimated_delivery_date: null,
      tracking_history: [],
      ...overrides,
    },
  }
}

async function post(payload: Record<string, unknown>, init?: { signature?: string | null; token?: string }) {
  const body = JSON.stringify(payload)
  const response = await POST(makeRequest(body, init))
  return { response, text: await response.text() }
}

beforeEach(() => {
  vi.clearAllMocks()

  plan.order = {
    id: ORDER_ID,
    customer_email: 'buyer@example.com',
    status: 'in_production',
    guest_tracking_token: 'tok',
  }
  plan.orderLookupError = null
  plan.dedupeInsertError = null
  plan.orderUpdateError = null
  plan.deliveredRows = []
  plan.deliveredUpdateError = null
  plan.statusEventError = null
  plan.orderUpdates = []
  plan.orderEqCalls = []
  plan.orderInCalls = []
  plan.statusEventInserts = []
  plan.dedupeDeletes = []
  plan.processedUpdates = []

  process.env.SHIPPO_WEBHOOK_SECRET = SECRET
  delete process.env.SHIPPO_WEBHOOK_TOKEN

  mocks.sendEmail.mockResolvedValue({ ok: true, id: 'email-1' })
})

afterEach(() => {
  delete process.env.SHIPPO_WEBHOOK_SECRET
  delete process.env.SHIPPO_WEBHOOK_TOKEN
})

describe('POST /api/shippo/webhook — credentials (SEC-004)', () => {
  it('rejects a bad HMAC signature', async () => {
    const { response } = await post(trackingEvent('TRANSIT'), { signature: 'deadbeef' })

    expect(response.status).toBe(401)
    expect(plan.orderUpdates).toEqual([])
  })

  it('rejects a missing signature when no token is configured', async () => {
    const { response } = await post(trackingEvent('TRANSIT'), { signature: null })

    expect(response.status).toBe(401)
  })

  it('accepts the secret URL token when SHIPPO_WEBHOOK_TOKEN is configured', async () => {
    process.env.SHIPPO_WEBHOOK_TOKEN = TOKEN

    const { response } = await post(trackingEvent('TRANSIT'), { signature: null, token: TOKEN })

    expect(response.status).toBe(200)
    expect(plan.orderUpdates[0]).toMatchObject({ status: 'shipped' })
  })

  it('rejects a wrong token', async () => {
    process.env.SHIPPO_WEBHOOK_TOKEN = TOKEN

    const { response } = await post(trackingEvent('TRANSIT'), { signature: null, token: 'nope' })

    expect(response.status).toBe(401)
  })

  it('returns 500 when no credential is configured at all', async () => {
    delete process.env.SHIPPO_WEBHOOK_SECRET

    const { response } = await post(trackingEvent('TRANSIT'))

    expect(response.status).toBe(500)
  })
})

describe('POST /api/shippo/webhook — status mapping (OCT #21)', () => {
  it('maps TRANSIT to shipped, only from in_production or ready_to_ship', async () => {
    const { response } = await post(trackingEvent('TRANSIT'))

    expect(response.status).toBe(200)
    expect(plan.orderUpdates[0]).toMatchObject({ status: 'shipped' })
    expect(plan.orderInCalls).toEqual([
      { column: 'status', values: ['in_production', 'ready_to_ship'] },
    ])
    expect(plan.statusEventInserts[0]).toMatchObject({
      action_type: 'tracking_update',
      previous_status: 'in_production',
      next_status: 'shipped',
      created_by: 'shippo_webhook',
    })
  })

  it('maps DELIVERED to delivered and emails once', async () => {
    plan.order = { ...(plan.order as Record<string, unknown>), status: 'shipped' }
    plan.deliveredRows = [{ id: ORDER_ID }]

    const { response } = await post(trackingEvent('DELIVERED'))

    expect(response.status).toBe(200)
    expect(plan.orderUpdates[0]).toMatchObject({ status: 'delivered' })
    expect(plan.orderEqCalls).toContainEqual({ column: 'status', value: 'shipped' })
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)
    expect(mocks.sendEmail.mock.calls[0][0]).toMatchObject({
      to: 'buyer@example.com',
      idempotencyKey: `delivered:${ORDER_ID}`,
    })
  })

  it('does not email again when a second DELIVERED scan changes nothing', async () => {
    plan.order = { ...(plan.order as Record<string, unknown>), status: 'shipped' }
    plan.deliveredRows = [{ id: ORDER_ID }]
    await post(trackingEvent('DELIVERED'))

    // A different payload, so the dedupe hash does not short-circuit it; the
    // conditional update matches no row the second time.
    plan.deliveredRows = []
    await post(trackingEvent('DELIVERED', { status_details: 'second scan' }))

    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)
  })

  it('does not resurrect a cancelled order on DELIVERED', async () => {
    plan.order = { ...(plan.order as Record<string, unknown>), status: 'cancelled' }
    plan.deliveredRows = []

    const { response } = await post(trackingEvent('DELIVERED'))

    expect(response.status).toBe(200)
    // The update is filtered on status = 'shipped', so a cancelled order cannot match.
    expect(plan.orderEqCalls).toContainEqual({ column: 'status', value: 'shipped' })
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('tolerates a missing carrier', async () => {
    const { response } = await post(trackingEvent('TRANSIT', { carrier: undefined }))

    expect(response.status).toBe(200)
    expect(plan.statusEventInserts[0]?.metadata).toMatchObject({ carrier: null })
  })

  it('ignores a status it does not map', async () => {
    const { response } = await post(trackingEvent('PRE_TRANSIT'))

    expect(response.status).toBe(200)
    expect(plan.orderUpdates).toEqual([])
  })

  it('accepts an unknown tracking number without failing', async () => {
    plan.order = null

    const { response } = await post(trackingEvent('TRANSIT'))

    expect(response.status).toBe(200)
    expect(plan.orderUpdates).toEqual([])
  })
})

describe('POST /api/shippo/webhook — dedupe and failures (OCT #21)', () => {
  it('treats a 23505 dedupe conflict as a duplicate', async () => {
    plan.dedupeInsertError = { code: '23505', message: 'duplicate key' }

    const { response } = await post(trackingEvent('TRANSIT'))

    expect(response.status).toBe(200)
    expect(plan.orderUpdates).toEqual([])
  })

  it('returns 500 when the dedupe insert fails for another reason', async () => {
    plan.dedupeInsertError = { code: '57014', message: 'statement timeout' }

    const { response } = await post(trackingEvent('TRANSIT'))

    expect(response.status).toBe(500)
  })

  it('returns 500 and clears the dedupe row when the order update fails', async () => {
    plan.orderUpdateError = { code: '57014', message: 'statement timeout' }

    const { response } = await post(trackingEvent('TRANSIT'))

    expect(response.status).toBe(500)
    expect(plan.dedupeDeletes).toHaveLength(1)
    expect(plan.dedupeDeletes[0]).toMatch(/^shippo:/)
  })

  it('returns 500 and clears the dedupe row when the status event cannot be written', async () => {
    plan.statusEventError = { code: '23514', message: 'check constraint violated' }

    const { response } = await post(trackingEvent('TRANSIT'))

    expect(response.status).toBe(500)
    expect(plan.dedupeDeletes).toHaveLength(1)
  })

  it('marks the dedupe row processed only after the event landed', async () => {
    const { response } = await post(trackingEvent('TRANSIT'))

    expect(response.status).toBe(200)
    // The event type is recorded right after the insert; `processed` only after
    // the whole event has been applied.
    expect(plan.processedUpdates).toEqual([{ event_type: 'track_updated' }, { processed: true }])
  })

  it('ignores a non-tracking event without touching orders', async () => {
    const { response } = await post({ event: 'batch_created', data: {} })

    expect(response.status).toBe(200)
    expect(plan.orderUpdates).toEqual([])
  })
})
