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

import { GET, POST } from './route'

function makeSupabase(data: unknown[] | null, error: { message: string } | null = null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(async () => ({ data, error })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: data?.[0] ?? null, error })),
        })),
      })),
    })),
  }
}

describe('future-product statuses admin API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminApiSession.mockResolvedValue({ ok: true, context: {} })
    mocks.writeAdminAuditLog.mockResolvedValue(undefined)
  })

  it('lists future-product statuses', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase([
      { id: 'status-1', label: 'Planned', color: '#6A7AC4', sort_order: 0, is_default: true, is_visible: true },
    ]))

    const response = await GET(new Request('http://localhost/api/admin/catalog/future-product-statuses'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.statuses).toHaveLength(1)
    expect(payload.statuses[0].label).toBe('Planned')
  })

  it('creates a future-product status', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase([
      { id: 'status-2', label: 'In Review', color: '#C4921A', sort_order: 1, is_default: false, is_visible: true },
    ]))

    const response = await POST(new Request('http://localhost/api/admin/catalog/future-product-statuses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'In Review', color: '#C4921A', sort_order: 1, is_default: false, is_visible: true }),
    }))
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(payload.status.label).toBe('In Review')
  })
})
