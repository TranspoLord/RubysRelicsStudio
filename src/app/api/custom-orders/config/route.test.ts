import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/storefront-settings', () => ({
  getBudgetRanges: vi.fn(),
  getCustomOrderIntakeSettings: vi.fn(),
}))

import { getBudgetRanges, getCustomOrderIntakeSettings } from '@/lib/storefront-settings'
import { GET } from './route'

describe('GET /api/custom-orders/config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns budget ranges and intake caps', async () => {
    vi.mocked(getBudgetRanges).mockResolvedValue([
      {
        id: 'range-1',
        label: 'Under $50',
        value: 'under-50',
        min_amount: null,
        max_amount: 50,
        sort_order: 10,
      },
    ])

    vi.mocked(getCustomOrderIntakeSettings).mockResolvedValue({
      max_quantity: 250,
      max_files: 4,
    })

    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      budgetRanges: [
        {
          id: 'range-1',
          label: 'Under $50',
          value: 'under-50',
          min_amount: null,
          max_amount: 50,
          sort_order: 10,
        },
      ],
      maxQuantity: 250,
      maxFiles: 4,
    })
  })

  it('returns 500 when config reads fail', async () => {
    vi.mocked(getBudgetRanges).mockRejectedValue(new Error('settings unavailable'))
    vi.mocked(getCustomOrderIntakeSettings).mockResolvedValue({
      max_quantity: 500,
      max_files: 5,
    })

    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'Could not load custom order config.' })
  })
})
