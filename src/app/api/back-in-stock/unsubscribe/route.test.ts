import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  unsubscribeBackInStockByToken: vi.fn(),
}))

vi.mock('@/lib/back-in-stock', () => ({
  unsubscribeBackInStockByToken: mocks.unsubscribeBackInStockByToken,
}))

import { GET } from './route'

describe('GET /api/back-in-stock/unsubscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('unsubscribes successfully with a valid token', async () => {
    mocks.unsubscribeBackInStockByToken.mockResolvedValue({ ok: true })

    const request = new Request('http://localhost/api/back-in-stock/unsubscribe?token=abc.def')
    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ message: 'You have been unsubscribed from this back-in-stock alert.' })
  })

  it('returns 400 when token is missing', async () => {
    const request = new Request('http://localhost/api/back-in-stock/unsubscribe')
    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'Unsubscribe token is required.' })
  })

  it('returns 400 for invalid token', async () => {
    mocks.unsubscribeBackInStockByToken.mockResolvedValue({
      ok: false,
      error: 'Invalid or expired unsubscribe token.',
    })

    const request = new Request('http://localhost/api/back-in-stock/unsubscribe?token=badtoken')
    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'Invalid or expired unsubscribe token.' })
  })
})
