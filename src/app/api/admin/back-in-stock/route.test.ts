import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdminApiSession: vi.fn(),
  processBackInStockAlerts: vi.fn(),
}))

vi.mock('@/lib/admin/auth', () => ({
  requireAdminApiSession: mocks.requireAdminApiSession,
}))

vi.mock('@/lib/back-in-stock', () => ({
  processBackInStockAlerts: mocks.processBackInStockAlerts,
}))

import { POST } from './route'

describe('POST /api/admin/back-in-stock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminApiSession.mockResolvedValue({ ok: true, context: {} })
  })

  it('processes alerts and returns summary', async () => {
    mocks.processBackInStockAlerts.mockResolvedValue({ scanned: 5, sent: 2, skipped: 3, failed: 0 })

    const request = new Request('http://localhost/api/admin/back-in-stock', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        productIds: ['prod_1', 'prod_2'],
        limit: 40,
      }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      ok: true,
      result: { scanned: 5, sent: 2, skipped: 3, failed: 0 },
    })
    expect(mocks.processBackInStockAlerts).toHaveBeenCalledWith({
      productIds: ['prod_1', 'prod_2'],
      limit: 40,
    })
  })

  it('returns auth response when admin session is invalid', async () => {
    mocks.requireAdminApiSession.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized admin request.' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    })

    const request = new Request('http://localhost/api/admin/back-in-stock', {
      method: 'POST',
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toEqual({ error: 'Unauthorized admin request.' })
  })
})
