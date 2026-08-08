import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}))

import { getFutureProductNotifySettings } from './storefront-settings'

describe('future product notify settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the default enabled state when no storefront setting exists', async () => {
    mocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          in: vi.fn(async () => ({ data: [], error: null })),
        })),
      })),
    })

    await expect(getFutureProductNotifySettings()).resolves.toEqual({ enabled: true })
  })

  it('reads the saved enabled flag from storefront settings', async () => {
    mocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          in: vi.fn(async () => ({ data: [{ setting_key: 'future_products_notify_form', setting_value: { enabled: false } }], error: null })),
        })),
      })),
    })

    await expect(getFutureProductNotifySettings()).resolves.toEqual({ enabled: false })
  })
})
