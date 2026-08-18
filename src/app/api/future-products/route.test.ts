import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  getClientIp: vi.fn(),
  rateLimit: vi.fn(),
  rateLimitResponse: vi.fn(),
  validateEmail: vi.fn(),
  sanitizeText: vi.fn(),
  requireCsrfOriginOnly: vi.fn(),
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

vi.mock('@/lib/security/csrf', () => ({
  requireCsrfOriginOnly: mocks.requireCsrfOriginOnly,
}))

vi.mock('@/lib/security/logger', () => ({
  safeLogError: vi.fn(),
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
    mocks.requireCsrfOriginOnly.mockReturnValue(null)
  })

  it('returns visible future products for the public page', async () => {
    const from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(async () => ({
            data: [
              {
                id: '1',
                title: 'Engraved Jewelry',
                description: 'Coming soon',
                estimated_release: '2027-03-01',
                category_key: 'engraved_drinkware',
                status_id: 'status-1',
                exp_future_product_statuses: { label: 'Planned', color: '#6A7AC4' },
                media_url: null,
                media_alt: null,
                is_visible: true,
                sort_order: 1,
              },
            ],
            error: null,
          })),
        })),
      })),
    }))
    mocks.getSupabaseAdmin.mockReturnValue({ from })

    const response = await GET(new Request('http://localhost/api/future-products'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.products).toHaveLength(1)
    expect(payload.products[0].title).toBe('Engraved Jewelry')
    expect(payload.products[0].statusId).toBe('status-1')
    expect(payload.products[0].statusLabel).toBe('Planned')
    expect(payload.products[0].statusColor).toBe('#6A7AC4')
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

  it('respects email-based rate limiting and returns a soft 200 when exceeded', async () => {
    const from = vi.fn(() => ({
      upsert: vi.fn(async () => ({ error: null })),
    }))
    mocks.getSupabaseAdmin.mockReturnValue({ from })

    // First rateLimit call (IP-based): allowed
    // Second rateLimit call (email-based): denied
    mocks.rateLimit
      .mockResolvedValueOnce({ allowed: true, retryAfter: null })
      .mockResolvedValueOnce({ allowed: false, retryAfter: 100 })

    const response = await POST(new Request('http://localhost/api/future-products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'repeat@example.com', idea: 'Tumblers' }),
    }))

    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.message).toContain('already shared')
  })

  it('accepts a custom source field from the form', async () => {
    const upsert = vi.fn(async () => ({ error: null }))
    const from = vi.fn(() => ({ upsert }))
    mocks.getSupabaseAdmin.mockReturnValue({ from })

    const response = await POST(new Request('http://localhost/api/future-products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fan@example.com', source: 'homepage_notify_card' }),
    }))

    expect(response.status).toBe(200)
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'homepage_notify_card' }),
      { onConflict: 'email' }
    )
  })
})
