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

  it('rejects a code longer than 40 characters', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase([], []))

    const response = await POST(makeRequest({ code: 'a'.repeat(41) }))

    expect(response.status).toBe(400)
  })
})

