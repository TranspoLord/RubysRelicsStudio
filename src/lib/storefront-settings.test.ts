import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}))

import { getAdminSessionSettings, getFutureProductNotifySettings } from './storefront-settings'

function mockSettings(value: unknown) {
  mocks.getSupabaseAdmin.mockReturnValue({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn(async () => ({ data: [{ setting_key: 'admin_session', setting_value: value }], error: null })),
      })),
    })),
  })
}

describe('admin session settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the saved TTL when within bounds', async () => {
    mockSettings({ ttl_hours: 24 })
    await expect(getAdminSessionSettings()).resolves.toEqual({ ttl_hours: 24 })
  })

  it('caps TTL at 336 hours', async () => {
    mockSettings({ ttl_hours: 1000 })
    await expect(getAdminSessionSettings()).resolves.toEqual({ ttl_hours: 12 })
  })

  it('rejects negative TTL and falls back to default', async () => {
    mockSettings({ ttl_hours: -5 })
    await expect(getAdminSessionSettings()).resolves.toEqual({ ttl_hours: 12 })
  })

  it('falls back to default when TTL is missing', async () => {
    mockSettings({})
    await expect(getAdminSessionSettings()).resolves.toEqual({ ttl_hours: 12 })
  })
})

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
