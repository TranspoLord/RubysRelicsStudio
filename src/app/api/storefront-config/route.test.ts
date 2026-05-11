import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/storefront-settings', () => ({
  getStripeCheckoutSettings: vi.fn(),
}))

import { getStripeCheckoutSettings } from '@/lib/storefront-settings'
import { GET } from './route'

describe('GET /api/storefront-config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns stripe config payload from settings', async () => {
    vi.mocked(getStripeCheckoutSettings).mockResolvedValue({
      enabled: false,
      disabled_message: 'Checkout paused for maintenance.',
    })

    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      stripeCheckoutEnabled: false,
      stripeDisabledMessage: 'Checkout paused for maintenance.',
    })
  })

  it('uses fallback retry path when first settings read fails', async () => {
    vi.mocked(getStripeCheckoutSettings)
      .mockRejectedValueOnce(new Error('temporary settings read failure'))
      .mockResolvedValueOnce({
        enabled: true,
        disabled_message: 'Checkout unavailable.',
      })

    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      stripeCheckoutEnabled: true,
      stripeDisabledMessage: 'Checkout unavailable.',
    })
    expect(getStripeCheckoutSettings).toHaveBeenCalledTimes(2)
  })
})
