import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  verifyCustomerSession: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}))

vi.mock('@/lib/auth/customer', () => ({
  verifyCustomerSession: mocks.verifyCustomerSession,
}))

import { GET, POST, DELETE } from './route'

describe('Wishlist API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns empty wishlist for authenticated customer', async () => {
    mocks.verifyCustomerSession.mockResolvedValue('cust_123')

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'exp_wishlists') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
          }
        }
        return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn() })) })),
        }
      }),
    }

    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const request = new Request('http://localhost/api/wishlist', {
      method: 'GET',
      headers: {
        cookie: 'rr_customer_session=token_abc123',
      },
    })

    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ items: [] })
  })

  it('GET returns 401 when no customer session', async () => {
    mocks.verifyCustomerSession.mockResolvedValue(null)

    const request = new Request('http://localhost/api/wishlist', {
      method: 'GET',
      headers: { cookie: '' },
    })

    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toEqual({ error: 'Unauthorized.' })
  })

  it('POST adds product to wishlist successfully', async () => {
    mocks.verifyCustomerSession.mockResolvedValue('cust_123')

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'exp_products') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: 'prod_123' }, error: null })),
              })),
            })),
          }
        }

        if (table === 'exp_wishlists') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: 'wl_456' }, error: null })),
              })),
            })),
          }
        }

        return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn() })) })),
        }
      }),
    }

    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const request = new Request('http://localhost/api/wishlist', {
      method: 'POST',
      headers: {
        cookie: 'rr_customer_session=token_abc123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ productId: 'prod_123' }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(payload.id).toBe('wl_456')
    expect(payload.message).toBe('Added to wishlist.')
  })

  it('POST returns 400 when product ID missing', async () => {
    mocks.verifyCustomerSession.mockResolvedValue('cust_123')

    const request = new Request('http://localhost/api/wishlist', {
      method: 'POST',
      headers: {
        cookie: 'rr_customer_session=token_abc123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'Product ID is required.' })
  })

  it('DELETE removes product from wishlist', async () => {
    mocks.verifyCustomerSession.mockResolvedValue('cust_123')

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'exp_wishlists') {
          return {
            delete: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ error: null })),
              })),
            })),
          }
        }
        return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn() })) })),
        }
      }),
    }

    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const request = new Request('http://localhost/api/wishlist?productId=prod_123', {
      method: 'DELETE',
      headers: {
        cookie: 'rr_customer_session=token_abc123',
      },
    })

    const response = await DELETE(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ message: 'Removed from wishlist.' })
  })
})
