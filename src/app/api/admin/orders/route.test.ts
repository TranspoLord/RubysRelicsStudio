import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdminApiSession: vi.fn(),
  writeAdminAuditLog: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}))

vi.mock('@/lib/admin/auth', () => ({
  requireAdminApiSession: mocks.requireAdminApiSession,
}))

vi.mock('@/lib/admin/audit', () => ({
  writeAdminAuditLog: mocks.writeAdminAuditLog,
}))

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}))

import { PATCH } from './route'

interface SupabasePlan {
  orderRow?: Record<string, unknown> | null
  updateError?: { message: string } | null
}

function createSupabase(plan: SupabasePlan) {
  const calls = {
    orderUpdateEq: vi.fn(async () => ({ error: plan.updateError ?? null })),
    eventInsert: vi.fn(async () => ({ error: null })),
  }

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'exp_orders') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => {
                if (!plan.orderRow) {
                  return { data: null, error: { message: 'not found' } }
                }
                return { data: plan.orderRow, error: null }
              }),
            })),
          })),
          update: vi.fn(() => ({
            eq: calls.orderUpdateEq,
          })),
        }
      }

      if (table === 'exp_order_status_events') {
        return {
          insert: calls.eventInsert,
        }
      }

      if (table === 'exp_order_internal_notes') {
        return {
          insert: vi.fn(async () => ({ error: null })),
        }
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: null, error: { message: 'unsupported table' } })),
          })),
        })),
      }
    }),
    rpc: vi.fn(async () => ({ data: { ok: true }, error: null })),
  }

  return { supabase, calls }
}

describe('PATCH /api/admin/orders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminApiSession.mockResolvedValue({ ok: true, context: {} })
    mocks.writeAdminAuditLog.mockResolvedValue(undefined)
  })

  it('rejects production transition when payment is not paid', async () => {
    const { supabase, calls } = createSupabase({
      orderRow: {
        id: 'ord_1',
        status: 'paid',
        payment_status: 'pending',
        inventory_reserved_at: null,
        inventory_released_at: null,
        paid_at: null,
      },
    })
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const request = new Request('http://localhost/api/admin/orders', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'transition',
        orderId: 'ord_1',
        nextStatus: 'in_production',
      }),
    })

    const response = await PATCH(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'Order must be paid before production/shipping transitions.' })
    expect(calls.orderUpdateEq).not.toHaveBeenCalled()
  })

  it('applies a valid transition and records event', async () => {
    const { supabase, calls } = createSupabase({
      orderRow: {
        id: 'ord_2',
        status: 'paid',
        payment_status: 'paid',
        inventory_reserved_at: null,
        inventory_released_at: null,
        paid_at: '2026-05-10T00:00:00.000Z',
      },
    })
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const request = new Request('http://localhost/api/admin/orders', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'transition',
        orderId: 'ord_2',
        nextStatus: 'in_production',
      }),
    })

    const response = await PATCH(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ ok: true })
    expect(calls.orderUpdateEq).toHaveBeenCalledTimes(1)
    expect(calls.eventInsert).toHaveBeenCalledTimes(1)
  })

  it('cancels unpaid order and releases inventory', async () => {
    const calls = {
      orderUpdateEq: vi.fn(async () => ({ error: null })),
      eventInsert: vi.fn(async () => ({ error: null })),
      noteInsert: vi.fn(async () => ({ error: null })),
      rpc: vi.fn(async () => ({ data: { ok: true }, error: null })),
    }

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'exp_orders') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    id: 'ord_cancel_1',
                    status: 'paid',
                    payment_status: 'pending',
                    inventory_reserved_at: '2026-05-10T00:00:00.000Z',
                    inventory_released_at: null,
                    paid_at: null,
                  },
                  error: null,
                })),
              })),
            })),
            update: vi.fn(() => ({
              eq: calls.orderUpdateEq,
            })),
          }
        }

        if (table === 'exp_order_status_events') {
          return {
            insert: calls.eventInsert,
          }
        }

        if (table === 'exp_order_internal_notes') {
          return {
            insert: calls.noteInsert,
          }
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: null, error: { message: 'unsupported' } })),
            })),
          })),
        }
      }),
      rpc: calls.rpc,
    }

    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const request = new Request('http://localhost/api/admin/orders', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'cancel',
        orderId: 'ord_cancel_1',
        note: 'Cancelled per customer request',
      }),
    })

    const response = await PATCH(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ ok: true })
    expect(calls.orderUpdateEq).toHaveBeenCalledTimes(1)
    expect(calls.rpc).toHaveBeenCalledTimes(1)
    expect(calls.rpc).toHaveBeenCalledWith('exp_release_order_inventory', {
      p_order_id: 'ord_cancel_1',
      p_note: 'Cancelled per customer request',
    })
    expect(calls.eventInsert).toHaveBeenCalledTimes(1)
    expect(calls.noteInsert).toHaveBeenCalledTimes(1)
  })

  it('marks paid order as refunded and records refund event', async () => {
    const calls = {
      orderUpdateEq: vi.fn(async () => ({ error: null })),
      eventInsert: vi.fn(async () => ({ error: null })),
      noteInsert: vi.fn(async () => ({ error: null })),
    }

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'exp_orders') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    id: 'ord_refund_1',
                    status: 'ready_to_ship',
                    payment_status: 'paid',
                    inventory_reserved_at: '2026-05-10T00:00:00.000Z',
                    inventory_released_at: null,
                    paid_at: '2026-05-10T00:00:00.000Z',
                  },
                  error: null,
                })),
              })),
            })),
            update: vi.fn(() => ({
              eq: calls.orderUpdateEq,
            })),
          }
        }

        if (table === 'exp_order_status_events') {
          return {
            insert: calls.eventInsert,
          }
        }

        if (table === 'exp_order_internal_notes') {
          return {
            insert: calls.noteInsert,
          }
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: null, error: { message: 'unsupported' } })),
            })),
          })),
        }
      }),
      rpc: vi.fn(async () => ({ data: { ok: true }, error: null })),
    }

    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const request = new Request('http://localhost/api/admin/orders', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'mark_refunded',
        orderId: 'ord_refund_1',
        note: 'Customer requested refund',
      }),
    })

    const response = await PATCH(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ ok: true })
    expect(calls.orderUpdateEq).toHaveBeenCalledTimes(1)
    expect(calls.eventInsert).toHaveBeenCalledTimes(1)
    expect(calls.noteInsert).toHaveBeenCalledTimes(1)
  })
})
