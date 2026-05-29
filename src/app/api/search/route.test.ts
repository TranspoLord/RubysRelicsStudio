import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  rateLimit: vi.fn(),
  rateLimitResponse: vi.fn(),
  getClientIp: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: mocks.rateLimit,
  rateLimitResponse: mocks.rateLimitResponse,
  getClientIp: mocks.getClientIp,
}))

vi.mock('@/lib/validate', () => ({
  sanitizeSearchQuery: vi.fn((value: unknown) => {
    if (typeof value !== 'string') return null
    const normalized = value.trim()
    return normalized.length >= 2 ? normalized : null
  }),
}))

import { GET } from './route'

describe('GET /api/search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getClientIp.mockReturnValue('127.0.0.1')
    mocks.rateLimit.mockReturnValue({ allowed: true, retryAfter: null })
    mocks.rateLimitResponse.mockImplementation((retryAfter: number) =>
      Response.json({ error: 'Rate limited', retryAfter }, { status: 429 })
    )
  })

  it('returns matching products and maps category slug for navigation', async () => {
    const productLimit = vi.fn(async () => ({
      data: [
        {
          id: 'p1',
          title: 'Engraved Slate Sign',
          slug: 'engraved-slate-sign',
          short_description: 'Natural slate tile engraved with your design.',
          description: 'Genuine slate accepts crisp laser engraving.',
          category_key: 'home-decor',
          base_price: 49.5,
          media: [
            { url: 'https://cdn.example.com/slate-2.jpg', is_featured: false, sort_order: 2 },
            { url: 'https://cdn.example.com/slate-1.jpg', is_featured: true, sort_order: 1 },
          ],
        },
      ],
      error: null,
    }))

    const productIsArchived = vi.fn(() => ({ limit: productLimit }))
    const productIsActive = vi.fn(() => ({ eq: productIsArchived }))
    const productOr = vi.fn(() => ({ eq: productIsActive }))
    const productSelect = vi.fn(() => ({ or: productOr }))

    const categoryIn = vi.fn(async () => ({
      data: [
        {
          key: 'home-decor',
          display_name: 'Home Decor',
          slug: 'home-decor',
        },
      ],
      error: null,
    }))
    const categoryEqType = vi.fn(() => ({ in: categoryIn }))
    const categorySelect = vi.fn(() => ({ eq: categoryEqType }))

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'exp_products') {
          return { select: productSelect }
        }
        if (table === 'exp_taxonomy') {
          return { select: categorySelect }
        }
        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const request = new Request('http://localhost/api/search?q=slate&limit=10', {
      method: 'GET',
    })

    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.results).toHaveLength(1)
    expect(payload.results[0]).toEqual(
      expect.objectContaining({
        id: 'p1',
        title: 'Engraved Slate Sign',
        slug: 'engraved-slate-sign',
        category: 'Home Decor',
        categoryKey: 'home-decor',
        categorySlug: 'home-decor',
        thumbnail: 'https://cdn.example.com/slate-1.jpg',
      })
    )

    expect(productOr).toHaveBeenCalledWith(
      expect.stringContaining('title.ilike.%slate%')
    )
    expect(productOr).toHaveBeenCalledWith(
      expect.stringContaining('short_description.ilike.%slate%')
    )
    expect(productOr).toHaveBeenCalledWith(
      expect.stringContaining('description.ilike.%slate%')
    )
  })

  it('returns empty results for short query after sanitization', async () => {
    const request = new Request('http://localhost/api/search?q=s', {
      method: 'GET',
    })

    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ results: [] })
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled()
  })

  it('returns rate-limit response when blocked', async () => {
    mocks.rateLimit.mockReturnValue({ allowed: false, retryAfter: 42 })

    const request = new Request('http://localhost/api/search?q=slate', {
      method: 'GET',
    })

    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(429)
    expect(payload).toEqual({ error: 'Rate limited', retryAfter: 42 })
    expect(mocks.rateLimitResponse).toHaveBeenCalledWith(42)
  })
})
