import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdminApiSession: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  writeAdminAuditLog: vi.fn(),
}))

vi.mock('@/lib/admin/auth', () => ({
  requireAdminApiSession: mocks.requireAdminApiSession,
}))

vi.mock('@/lib/admin/audit', () => ({
  writeAdminAuditLog: mocks.writeAdminAuditLog,
}))

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}))

import { PATCH } from './route'

function makeSupabase() {
  return {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(async () => ({ error: null })),
      })),
      upsert: vi.fn(async () => ({ error: null })),
    })),
  }
}

function makeSettings(ttlHours: number) {
  return {
    guest_order_tracking: { enabled: true, notify_email: 'orders@rubysrelicsstudio.com' },
    contact: { support_email: 'orders@rubysrelicsstudio.com', from_email: 'hello@rubysrelicsstudio.com', from_name: "Ruby's Relics" },
    operational_notifications: { custom_request_notify_email: 'orders@rubysrelicsstudio.com' },
    admin_session: { ttl_hours: ttlHours },
    recommendations: { enabled: true, pinned_global: [], pinned_by_category: {} },
  }
}

describe('PATCH /api/admin/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminApiSession.mockResolvedValue({ ok: true, context: {} })
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase())
  })

  it('accepts a TTL in the allowed range', async () => {
    const request = new Request('http://localhost/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ settings: makeSettings(24) }),
    })

    const response = await PATCH(request)
    expect(response.status).toBe(200)
  })

  it('rejects a TTL above 336 hours', async () => {
    const request = new Request('http://localhost/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ settings: makeSettings(337) }),
    })

    const response = await PATCH(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toContain('ttl_hours must be between 1 and 336')
  })

  it('rejects a TTL below 1 hour', async () => {
    const request = new Request('http://localhost/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ settings: makeSettings(0) }),
    })

    const response = await PATCH(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toContain('ttl_hours must be between 1 and 336')
  })

  it('floors non-integer TTL values', async () => {
    const request = new Request('http://localhost/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ settings: makeSettings(12.9) }),
    })

    const response = await PATCH(request)
    expect(response.status).toBe(200)
  })
})
