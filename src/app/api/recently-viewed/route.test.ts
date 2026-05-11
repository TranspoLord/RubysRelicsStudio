import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyCustomerSession: vi.fn(),
  trackProductView: vi.fn(),
  getRecentlyViewed: vi.fn(),
}))

vi.mock('@/lib/auth/customer', () => ({
  verifyCustomerSession: mocks.verifyCustomerSession,
}))

vi.mock('@/lib/recently-viewed', () => ({
  trackProductView: mocks.trackProductView,
  getRecentlyViewed: mocks.getRecentlyViewed,
}))

import { POST, GET } from './route'

describe('Recently Viewed API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('POST tracks product view for authenticated customer', async () => {
    mocks.verifyCustomerSession.mockResolvedValue('cust_123')
    mocks.trackProductView.mockResolvedValue(undefined)

    const request = new Request('http://localhost/api/recently-viewed', {
      method: 'POST',
      headers: {
        cookie: 'rr_customer_session=token_abc123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ productId: 'prod_456' }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ message: 'View tracked.' })
    expect(mocks.trackProductView).toHaveBeenCalledWith('cust_123', 'prod_456')
  })

  it('POST does not track view without customer session', async () => {
    mocks.verifyCustomerSession.mockResolvedValue(null)

    const request = new Request('http://localhost/api/recently-viewed', {
      method: 'POST',
      headers: {
        cookie: '',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ productId: 'prod_456' }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ message: 'View tracked.' })
    expect(mocks.trackProductView).not.toHaveBeenCalled()
  })

  it('POST returns 400 when product ID missing', async () => {
    mocks.verifyCustomerSession.mockResolvedValue('cust_123')

    const request = new Request('http://localhost/api/recently-viewed', {
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

  it('GET returns recently viewed items for authenticated customer', async () => {
    mocks.verifyCustomerSession.mockResolvedValue('cust_123')
    mocks.getRecentlyViewed.mockResolvedValue([
      {
        id: 'prod_1',
        title: 'Item 1',
        slug: 'item-1',
        price: 50.0,
        thumbnail: 'thumb1.jpg',
        viewedAt: '2026-05-10T12:00:00Z',
      },
    ])

    const request = new Request('http://localhost/api/recently-viewed', {
      method: 'GET',
      headers: {
        cookie: 'rr_customer_session=token_abc123',
      },
    })

    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.items).toHaveLength(1)
    expect(payload.items[0].title).toBe('Item 1')
    expect(mocks.getRecentlyViewed).toHaveBeenCalledWith('cust_123')
  })

  it('GET returns empty list for guest users', async () => {
    mocks.verifyCustomerSession.mockResolvedValue(null)

    const request = new Request('http://localhost/api/recently-viewed', {
      method: 'GET',
      headers: {
        cookie: '',
      },
    })

    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ items: [] })
  })
})
