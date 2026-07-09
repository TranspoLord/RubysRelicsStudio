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

import { GET, PUT } from './route'

// ─── Shared test data ─────────────────────────────────────────────────────────

const PRODUCT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

const ALL_PROCESS_TYPES = [
  { key: 'engraving_cutting', display_name: 'Engraving & Cutting', emoji: '🔥' },
  { key: 'printing', display_name: 'Printing', emoji: '🖨️' },
  { key: 'sublimation', display_name: 'Sublimation', emoji: '🌈' },
]

// ─── GET ─────────────────────────────────────────────────────────────────────

function makeGetSupabase(opts: {
  assignedKeys?: string[]
  processTypes?: typeof ALL_PROCESS_TYPES
  assignedError?: { message: string }
  processTypesError?: { message: string }
}) {
  const assignedData = (opts.assignedKeys ?? []).map((k) => ({ process_type_key: k }))
  return {
    from: vi.fn((table: string) => {
      if (table === 'exp_product_process_types') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: assignedData, error: opts.assignedError ?? null })),
          })),
        }
      }
      if (table === 'exp_taxonomy') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(async () => ({
                  data: opts.processTypes ?? ALL_PROCESS_TYPES,
                  error: opts.processTypesError ?? null,
                })),
              })),
            })),
          })),
        }
      }
      return { select: vi.fn() }
    }),
  }
}

describe('GET /api/admin/catalog/process-types', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminApiSession.mockResolvedValue({ ok: true, context: {} })
  })

  it('returns all process types and the assigned keys for a product', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(
      makeGetSupabase({ assignedKeys: ['engraving_cutting', 'sublimation'] })
    )

    const request = new Request(
      `http://localhost/api/admin/catalog/process-types?productId=${PRODUCT_ID}`
    )
    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.processTypes).toHaveLength(3)
    expect(payload.assigned).toEqual(expect.arrayContaining(['engraving_cutting', 'sublimation']))
    expect(payload.assigned).toHaveLength(2)
  })

  it('returns empty assigned array when the product has no process types yet', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeGetSupabase({ assignedKeys: [] }))

    const request = new Request(
      `http://localhost/api/admin/catalog/process-types?productId=${PRODUCT_ID}`
    )
    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.assigned).toEqual([])
    expect(payload.processTypes).toHaveLength(3)
  })

  it('returns 400 when productId is missing', async () => {
    const request = new Request('http://localhost/api/admin/catalog/process-types')
    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/productId/i)
  })

  it('returns 500 when the assigned query fails', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(
      makeGetSupabase({ assignedError: { message: 'db error' } })
    )

    const request = new Request(
      `http://localhost/api/admin/catalog/process-types?productId=${PRODUCT_ID}`
    )
    const response = await GET(request)

    expect(response.status).toBe(500)
  })

  it('returns 401 when admin session is invalid', async () => {
    mocks.requireAdminApiSession.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized admin request.' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    })

    const request = new Request(
      `http://localhost/api/admin/catalog/process-types?productId=${PRODUCT_ID}`
    )
    const response = await GET(request)
    expect(response.status).toBe(401)
  })
})

// ─── PUT ─────────────────────────────────────────────────────────────────────

function makePutSupabase(opts: {
  productExists?: boolean
  deleteError?: { message: string }
  insertError?: { message: string }
}) {
  const eqDeleteFn = vi.fn(async () => ({ error: opts.deleteError ?? null }))
  const eqInsertFn = vi.fn(async () => ({ error: opts.insertError ?? null }))

  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'exp_products') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: opts.productExists !== false ? { id: PRODUCT_ID } : null,
                  error: null,
                })),
              })),
            })),
          }
        }
        if (table === 'exp_product_process_types') {
          return {
            delete: vi.fn(() => ({ eq: eqDeleteFn })),
            insert: vi.fn(async () => ({ error: opts.insertError ?? null })),
          }
        }
        return {}
      }),
    },
    calls: { eqDeleteFn },
  }
}

function makePutRequest(body: unknown) {
  return new Request('http://localhost/api/admin/catalog/process-types', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PUT /api/admin/catalog/process-types', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminApiSession.mockResolvedValue({ ok: true, context: {} })
    mocks.writeAdminAuditLog.mockResolvedValue(undefined)
  })

  it('replaces process type assignments for a product', async () => {
    const { supabase, calls } = makePutSupabase({ productExists: true })
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const response = await PUT(
      makePutRequest({ productId: PRODUCT_ID, processTypeKeys: ['sublimation', 'printing'] })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(payload.assigned).toEqual(expect.arrayContaining(['sublimation', 'printing']))
    expect(calls.eqDeleteFn).toHaveBeenCalledOnce()
    expect(mocks.writeAdminAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'success' })
    )
  })

  it('clears all assignments when processTypeKeys is empty', async () => {
    const { supabase, calls } = makePutSupabase({ productExists: true })
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const response = await PUT(
      makePutRequest({ productId: PRODUCT_ID, processTypeKeys: [] })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.assigned).toEqual([])
    // delete was still called to remove old rows
    expect(calls.eqDeleteFn).toHaveBeenCalledOnce()
  })

  it('returns 404 when product does not exist', async () => {
    const { supabase } = makePutSupabase({ productExists: false })
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const response = await PUT(
      makePutRequest({ productId: PRODUCT_ID, processTypeKeys: ['sublimation'] })
    )
    const payload = await response.json()

    expect(response.status).toBe(404)
    expect(payload.error).toMatch(/not found/i)
  })

  it('returns 400 when processTypeKeys contains a non-string', async () => {
    const response = await PUT(
      makePutRequest({ productId: PRODUCT_ID, processTypeKeys: ['sublimation', 42] })
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/processTypeKeys/i)
  })

  it('returns 400 when productId is missing', async () => {
    const response = await PUT(
      makePutRequest({ processTypeKeys: ['sublimation'] })
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/productId/i)
  })

  it('returns 500 and logs failure when delete fails', async () => {
    const { supabase } = makePutSupabase({ productExists: true, deleteError: { message: 'db error' } })
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const response = await PUT(
      makePutRequest({ productId: PRODUCT_ID, processTypeKeys: ['sublimation'] })
    )
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(mocks.writeAdminAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failure' })
    )
  })

  it('returns 401 when admin session is invalid', async () => {
    mocks.requireAdminApiSession.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized admin request.' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    })

    const response = await PUT(
      makePutRequest({ productId: PRODUCT_ID, processTypeKeys: ['sublimation'] })
    )
    expect(response.status).toBe(401)
  })

  it('returns 400 for invalid JSON body', async () => {
    const request = new Request('http://localhost/api/admin/catalog/process-types', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{invalid-json',
    })

    const response = await PUT(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/invalid json/i)
  })
})
