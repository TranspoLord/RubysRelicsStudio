import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  rateLimit: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}))

vi.mock('@/lib/rate-limit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/rate-limit')>('@/lib/rate-limit')
  return {
    ...actual,
    rateLimit: mocks.rateLimit,
  }
})

import { POST } from './route'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/promo/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: 'http://localhost:3000',
    },
    body: JSON.stringify(body),
  })
}

function makeSupabase(promoRows: unknown[] | null, dealRows: unknown[] | null) {
  const promoResult = { data: promoRows, error: null }
  const dealResult = { data: dealRows, error: null }

  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => {
        const isPromo = table === 'exp_promo_codes'
        const isDeal = table === 'exp_bundle_deals'
        const chain = {
          eq: vi.fn(() => chain),
          ilike: vi.fn(() => chain),
          limit: vi.fn(() => (isPromo ? promoResult : { data: null, error: null })),
        } as any
        // Terminal that returns the right result for the table
        ;(chain as any).data = isPromo ? promoRows : isDeal ? dealRows : null
        ;(chain as any).error = null
        return chain
      }),
    })),
  }
}

describe('POST /api/promo/validate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 30 })
  })

  it('returns valid false for an unknown code', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase([], []))

    const response = await POST(makeRequest({ code: 'UNKNOWN' }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.valid).toBe(false)
  })

  it('validates an active percent promo code', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSupabase(
        [
          {
            id: 'promo-1',
            code: 'SAVE10',
            discount_type: 'percent',
            discount_value: 10,
            is_active: true,
            usage_limit: null,
            usage_count: 0,
            valid_from: null,
            valid_to: null,
          },
        ],
        []
      )
    )

    const response = await POST(makeRequest({ code: 'save10' }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.valid).toBe(true)
    expect(payload.promo?.code).toBe('SAVE10')
  })

  // OCT #3: the row `id`s must never reach the client — with them, an anon
  // caller could loop exp_increment_promo_code_usage(id) and exhaust the code
  // for everyone. (The revoke itself lives in migration 068 and is asserted by
  // src/lib/security/rpc-grants.contract.test.ts.)
  it('never returns a promo or deal row id', async () => {
    const promoId = '11111111-1111-1111-1111-111111111111'
    const dealId = '22222222-2222-2222-2222-222222222222'

    mocks.getSupabaseAdmin.mockReturnValue(
      makeSupabase(
        [
          {
            id: promoId,
            code: 'SAVE10',
            discount_type: 'percent',
            discount_value: 10,
            is_active: true,
            usage_limit: null,
            usage_count: 0,
            valid_from: null,
            valid_to: null,
          },
        ],
        [
          {
            id: dealId,
            name: 'Sticker bundle',
            trigger_type: 'code',
            code: 'SAVE10',
            conditions_json: {},
            rewards_json: {},
            is_active: true,
            is_stackable: false,
            usage_limit: null,
            usage_count: 0,
            valid_from: null,
            valid_to: null,
          },
        ]
      )
    )

    const response = await POST(makeRequest({ code: 'save10' }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.promo).toEqual({ code: 'SAVE10', discountType: 'percent', discountValue: 10 })
    expect(payload.promo).not.toHaveProperty('id')
    expect(payload.deals).toHaveLength(1)
    expect(payload.deals[0]).not.toHaveProperty('id')

    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain(promoId)
    expect(serialized).not.toContain(dealId)
  })

  it('rejects a code longer than 40 characters', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase([], []))

    const response = await POST(makeRequest({ code: 'a'.repeat(41) }))

    expect(response.status).toBe(400)
  })
})

