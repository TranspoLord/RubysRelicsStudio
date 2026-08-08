import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  getClientIp: vi.fn(),
  rateLimit: vi.fn(),
  rateLimitResponse: vi.fn(),
  validateEmail: vi.fn(),
  sanitizeText: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}))

vi.mock('@/lib/rate-limit', () => ({
  getClientIp: mocks.getClientIp,
  rateLimit: mocks.rateLimit,
  rateLimitResponse: mocks.rateLimitResponse,
}))

vi.mock('@/lib/validate', () => ({
  validateEmail: mocks.validateEmail,
  sanitizeText: mocks.sanitizeText,
}))

import { GET, POST } from './route'

describe('future-products API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getClientIp.mockReturnValue('127.0.0.1')
    mocks.rateLimit.mockResolvedValue({ allowed: true })
    mocks.rateLimitResponse.mockImplementation((retryAfter: number) => new Response(JSON.stringify({ error: 'slow down' }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    }))
    mocks.validateEmail.mockImplementation((value: unknown) => (typeof value === 'string' ? value : null))
    mocks.sanitizeText.mockImplementation((value: unknown) => (typeof value === 'string' ? value : ''))
  })

  it('returns visible future products for the public page', async () => {
    const from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(async () => ({ data: [{ id: '1', title: 'Engraved Jewelry', description: 'Coming soon', estimated_release: '2027-03-01', category_key: 'engraved_drinkware', status: { label: 'Planned' }, media_url: null, media_alt: null, is_visible: true, sort_order: 1 }], error: null })),
        })),
      })),
    }))
    mocks.getSupabaseAdmin.mockReturnValue({ from })

    const response = await GET(new Request('http://localhost/api/future-products'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.products).toHaveLength(1)
    expect(payload.products[0].title).toBe('Engraved Jewelry')
  })

  it('persists future-product interest submissions', async () => {
    const from = vi.fn(() => ({
      upsert: vi.fn(async () => ({ error: null })),
    }))
    mocks.getSupabaseAdmin.mockReturnValue({ from })

    const response = await POST(new Request('http://localhost/api/future-products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fan@example.com', name: 'Ruby', idea: 'More tumblers', comments: 'Please keep me posted' }),
    }))

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.ok).toBe(true)
  })
})
