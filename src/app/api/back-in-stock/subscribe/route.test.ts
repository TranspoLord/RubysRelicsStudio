import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  rateLimit: vi.fn(),
  getClientIp: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: mocks.rateLimit,
  getClientIp: mocks.getClientIp,
  rateLimitResponse: vi.fn((retryAfter) => ({
    status: 429,
    json: async () => ({ error: 'Rate limited', retryAfter }),
  })),
}))

vi.mock('@/lib/validate', () => ({
  validateEmail: vi.fn((value: unknown) => {
    if (typeof value !== 'string') return null
    const trimmed = value.trim().toLowerCase()
    return trimmed.includes('@') ? trimmed : null
  }),
  sanitizeText: vi.fn((value: unknown, maxLen: number) => {
    if (typeof value !== 'string') return ''
    return value.trim().slice(0, maxLen)
  }),
}))

vi.mock('@/lib/security/csrf', () => ({
  requireCsrfOriginOnly: vi.fn(() => null),
}))

import { POST } from './route'

describe('POST /api/back-in-stock/subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getClientIp.mockReturnValue('127.0.0.1')
    // rateLimit is now async — mock returns a Promise
    mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfter: null })
  })

  it('returns 400 when productId is missing', async () => {
    const request = new Request('http://localhost/api/back-in-stock/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'shopper@example.com' }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'Product ID is required.' })
  })

  it('returns 404 when product is not found', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'exp_products') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          }
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        }
      }),
    }

    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const request = new Request('http://localhost/api/back-in-stock/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        productId: 'prod_missing',
        email: 'shopper@example.com',
      }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(404)
    expect(payload).toEqual({ error: 'Product not found.' })
  })

  it('subscribes successfully for back-in-stock alerts', async () => {
    const upsert = vi.fn(async () => ({ error: null }))

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'exp_products') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { id: 'prod_1', is_active: true, is_archived: false },
                  error: null,
                })),
              })),
            })),
          }
        }

        if (table === 'exp_back_in_stock_alerts') {
          return {
            upsert,
          }
        }

        throw new Error(`Unexpected table mocked: ${table}`)
      }),
    }

    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const request = new Request('http://localhost/api/back-in-stock/subscribe', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'vitest',
      },
      body: JSON.stringify({
        productId: 'prod_1',
        email: 'shopper@example.com',
        source: 'product_page',
      }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ message: 'Subscribed for back-in-stock alerts.' })
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: 'prod_1',
        email: 'shopper@example.com',
        status: 'active',
      }),
      { onConflict: 'product_id,email' }
    )
  })
})