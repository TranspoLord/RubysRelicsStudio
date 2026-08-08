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
  const selectChain = {
    order: vi.fn(async () => ({ data, error })),
  }

  const insertChain = {
    select: vi.fn(() => ({
      single: vi.fn(async () => ({ data: data?.[0] ?? null, error })),
    })),
  }

  return {
    from: vi.fn(() => ({
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
    })),
  }
}

describe('future-products admin API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminApiSession.mockResolvedValue({ ok: true, context: {} })
    mocks.writeAdminAuditLog.mockResolvedValue(undefined)
  })

  it('lists roadmap products for admins', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase([
      { id: 'prod-1', title: 'New Mug', description: 'Coming soon', estimated_release: '2026-09-01', category_key: 'mugs', status_id: 'status-1', is_visible: true, sort_order: 1 },
    ]))

    const response = await GET(new Request('http://localhost/api/admin/catalog/future-products'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.products).toHaveLength(1)
    expect(payload.products[0].title).toBe('New Mug')
  })

  it('creates a roadmap product', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase([
      { id: 'prod-1', title: 'New Mug', description: 'Coming soon', estimated_release: '2026-09-01', category_key: 'mugs', status_id: 'status-1', is_visible: true, sort_order: 1 },
    ]))

    const response = await POST(new Request('http://localhost/api/admin/catalog/future-products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Mug', description: 'Coming soon', estimated_release: '2026-09-01', category_key: 'mugs', status_id: 'status-1', is_visible: true, sort_order: 1 }),
    }))
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(payload.product.title).toBe('New Mug')
  })
})
