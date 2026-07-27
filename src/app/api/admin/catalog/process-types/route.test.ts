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

/**
 * Build a Supabase mock that handles all 4 tables the GET route queries:
 *   - exp_taxonomy (all process types)
 *   - exp_product_process_pricing (pricing rows)
 *   - exp_product_combo_discounts (combo discounts)
 *   - exp_product_process_types (old join table for backward compat)
 */
function makeGetSupabase(opts: {
  processTypes?: typeof ALL_PROCESS_TYPES
  pricing?: Array<{ id: string; process_type_key: string; price_delta: number; is_enabled: boolean }>
  comboDiscounts?: Array<{ id: string; min_processes: number; discount_type: string; discount_value: number | null; label: string | null; is_enabled: boolean }>
  oldAssigned?: Array<{ process_type_key: string }>
  taxonomyError?: { message: string }
  pricingError?: { message: string }
  comboError?: { message: string }
  assignedError?: { message: string }
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'exp_taxonomy') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(async () => ({
                  data: opts.processTypes ?? ALL_PROCESS_TYPES,
                  error: opts.taxonomyError ?? null,
                })),
              })),
            })),
          })),
        }
      }
      if (table === 'exp_product_process_pricing') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({
              data: opts.pricing ?? [],
              error: opts.pricingError ?? null,
            })),
          })),
        }
      }
      if (table === 'exp_product_combo_discounts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({
                data: opts.comboDiscounts ?? [],
                error: opts.comboError ?? null,
              })),
            })),
          })),
        }
      }
      if (table === 'exp_product_process_types') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({
              data: opts.oldAssigned ?? [],
              error: opts.assignedError ?? null,
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

  it('returns all process types, assigned keys, and combo discounts', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(
      makeGetSupabase({
        pricing: [
          { id: 'p1', process_type_key: 'engraving_cutting', price_delta: 5, is_enabled: true },
          { id: 'p2', process_type_key: 'sublimation', price_delta: 3, is_enabled: true },
        ],
        comboDiscounts: [
          { id: 'c1', min_processes: 2, discount_type: 'percentage', discount_value: 10, label: '2+ save 10%', is_enabled: true },
        ],
        oldAssigned: [{ process_type_key: 'printing' }],
      })
    )

    const request = new Request(
      `http://localhost/api/admin/catalog/process-types?productId=${PRODUCT_ID}`
    )
    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.processTypes).toHaveLength(3)
    // Assigned merges pricing (is_enabled) + old join table
    expect(payload.assigned).toEqual(expect.arrayContaining(['engraving_cutting', 'sublimation', 'printing']))
    expect(payload.comboDiscounts).toHaveLength(1)
    // Pricing info merged into process types
    const engraving = payload.processTypes.find((pt: { key: string }) => pt.key === 'engraving_cutting')
    expect(engraving.price_delta).toBe(5)
    expect(engraving.is_enabled).toBe(true)
    expect(engraving.pricing_id).toBe('p1')
  })

  it('returns empty assigned array when product has no pricing or old assignments', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeGetSupabase({}))

    const request = new Request(
      `http://localhost/api/admin/catalog/process-types?productId=${PRODUCT_ID}`
    )
    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.assigned).toEqual([])
    expect(payload.processTypes).toHaveLength(3)
    // process types with no pricing get defaults
    const first = payload.processTypes[0]
    expect(first.price_delta).toBe(0)
    expect(first.is_enabled).toBe(false)
    expect(first.pricing_id).toBeNull()
  })

  it('returns 400 when productId is missing', async () => {
    const request = new Request('http://localhost/api/admin/catalog/process-types')
    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/productId/i)
  })

  it('returns 500 when the taxonomy query fails', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(
      makeGetSupabase({ taxonomyError: { message: 'db error' } })
    )

    const request = new Request(
      `http://localhost/api/admin/catalog/process-types?productId=${PRODUCT_ID}`
    )
    const response = await GET(request)

    expect(response.status).toBe(500)
  })

  it('returns 500 when the pricing query fails', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(
      makeGetSupabase({ pricingError: { message: 'db error' } })
    )

    const request = new Request(
      `http://localhost/api/admin/catalog/process-types?productId=${PRODUCT_ID}`
    )
    const response = await GET(request)

    expect(response.status).toBe(500)
  })

  it('returns 500 when the combo discounts query fails', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(
      makeGetSupabase({ comboError: { message: 'db error' } })
    )

    const request = new Request(
      `http://localhost/api/admin/catalog/process-types?productId=${PRODUCT_ID}`
    )
    const response = await GET(request)

    expect(response.status).toBe(500)
  })

  it('returns 500 when the old assigned query fails', async () => {
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

/**
 * Build a Supabase mock that handles all tables the PUT route touches:
 *   - exp_products (verify product exists)
 *   - exp_product_process_types (old join table)
 *   - exp_product_process_pricing (new pricing table)
 *   - exp_product_combo_discounts (combo discounts)
 */
function makePutSupabase(opts: {
  productExists?: boolean
  productError?: { message: string }
  deleteOldError?: { message: string }
  insertOldError?: { message: string }
  deletePricingError?: { message: string }
  insertPricingError?: { message: string }
  deleteComboError?: { message: string }
  insertComboError?: { message: string }
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'exp_products') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: opts.productExists !== false ? { id: PRODUCT_ID } : null,
                error: opts.productError ?? null,
              })),
            })),
          })),
        }
      }
      if (table === 'exp_product_process_types') {
        return {
          delete: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: opts.deleteOldError ?? null })),
          })),
          insert: vi.fn(async () => ({ error: opts.insertOldError ?? null })),
        }
      }
      if (table === 'exp_product_process_pricing') {
        return {
          delete: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: opts.deletePricingError ?? null })),
          })),
          insert: vi.fn(async () => ({ error: opts.insertPricingError ?? null })),
        }
      }
      if (table === 'exp_product_combo_discounts') {
        return {
          delete: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: opts.deleteComboError ?? null })),
          })),
          insert: vi.fn(async () => ({ error: opts.insertComboError ?? null })),
        }
      }
      return {}
    }),
  }
}

function makePutRequest(body: unknown) {
  return new Request('http://localhost/api/admin/catalog/process-types', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const PROCESS_TYPES_BODY = [
  { key: 'sublimation', price_delta: 3, is_enabled: true },
  { key: 'printing', price_delta: 2, is_enabled: true },
  { key: 'engraving_cutting', price_delta: 5, is_enabled: false },
]

describe('PUT /api/admin/catalog/process-types', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminApiSession.mockResolvedValue({ ok: true, context: {} })
    mocks.writeAdminAuditLog.mockResolvedValue(undefined)
  })

  it('replaces process type assignments and pricing for a product', async () => {
    const supabase = makePutSupabase({ productExists: true })
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const response = await PUT(
      makePutRequest({ productId: PRODUCT_ID, processTypes: PROCESS_TYPES_BODY })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    // assigned = only enabled keys
    expect(payload.assigned).toEqual(expect.arrayContaining(['sublimation', 'printing']))
    expect(payload.assigned).not.toContain('engraving_cutting')
    expect(mocks.writeAdminAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'success' })
    )
  })

  it('clears all assignments when processTypes is empty', async () => {
    const supabase = makePutSupabase({ productExists: true })
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const response = await PUT(
      makePutRequest({ productId: PRODUCT_ID, processTypes: [] })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.assigned).toEqual([])
  })

  it('saves combo discounts when provided', async () => {
    const supabase = makePutSupabase({ productExists: true })
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const response = await PUT(
      makePutRequest({
        productId: PRODUCT_ID,
        processTypes: PROCESS_TYPES_BODY,
        comboDiscounts: [
          { min_processes: 2, discount_type: 'percentage', discount_value: 10, label: '2+ save 10%' },
        ],
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
  })

  it('returns 404 when product does not exist', async () => {
    const supabase = makePutSupabase({ productExists: false })
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const response = await PUT(
      makePutRequest({ productId: PRODUCT_ID, processTypes: PROCESS_TYPES_BODY })
    )
    const payload = await response.json()

    expect(response.status).toBe(404)
    expect(payload.error).toMatch(/not found/i)
  })

  it('returns 400 when processTypes is missing', async () => {
    const response = await PUT(
      makePutRequest({ productId: PRODUCT_ID })
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/processTypes/i)
  })

  it('returns 400 when processTypes contains an entry without a key', async () => {
    const response = await PUT(
      makePutRequest({
        productId: PRODUCT_ID,
        processTypes: [{ key: 'sublimation', price_delta: 3, is_enabled: true }, { price_delta: 2, is_enabled: false }],
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/key/i)
  })

  it('returns 400 when productId is missing', async () => {
    const response = await PUT(
      makePutRequest({ processTypes: PROCESS_TYPES_BODY })
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/productId/i)
  })

  it('returns 500 and logs failure when old join table delete fails', async () => {
    const supabase = makePutSupabase({ productExists: true, deleteOldError: { message: 'db error' } })
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const response = await PUT(
      makePutRequest({ productId: PRODUCT_ID, processTypes: PROCESS_TYPES_BODY })
    )

    expect(response.status).toBe(500)
    expect(mocks.writeAdminAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failure' })
    )
  })

  it('returns 500 and logs failure when pricing delete fails', async () => {
    const supabase = makePutSupabase({ productExists: true, deletePricingError: { message: 'db error' } })
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const response = await PUT(
      makePutRequest({ productId: PRODUCT_ID, processTypes: PROCESS_TYPES_BODY })
    )

    expect(response.status).toBe(500)
    expect(mocks.writeAdminAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failure' })
    )
  })

  it('returns 500 and logs failure when combo delete fails', async () => {
    const supabase = makePutSupabase({ productExists: true, deleteComboError: { message: 'db error' } })
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const response = await PUT(
      makePutRequest({
        productId: PRODUCT_ID,
        processTypes: PROCESS_TYPES_BODY,
        comboDiscounts: [{ min_processes: 2, discount_type: 'percentage', discount_value: 10, label: null }],
      })
    )

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
      makePutRequest({ productId: PRODUCT_ID, processTypes: PROCESS_TYPES_BODY })
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