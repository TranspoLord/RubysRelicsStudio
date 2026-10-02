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

import { GET, PATCH } from './route'

const QUICK_PICKS_ROW = {
  section_key: 'quick_picks',
  is_visible: true,
  sort_order: 12,
  content: {
    heading: 'What are you here for?!',
    subheading: 'Jump straight to the good stuff.',
    items: [
      { key: 'stickers', label: 'Stickers', emoji: '✨', href: '/shop/categories/seasonal-items', is_visible: true, sort_order: 0 },
    ],
  },
}

const PROCESS_PICKS_ROW = {
  section_key: 'process_picks',
  is_visible: true,
  sort_order: 13,
  content: {
    heading: 'Start with the action!',
    subheading: "Shop by how it's made.",
    items: [
      { key: 'engraving_cutting', label: 'Engraving & Cutting', emoji: '🔥', href: '/shop/all?process=engraving_cutting', is_visible: true, sort_order: 0 },
    ],
  },
}

function makeSupabase(data: unknown[] | null, error: { message: string } | null = null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          order: vi.fn(async () => ({ data, error })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(async () => ({ error: null })),
      })),
    })),
  }
}

/**
 * PATCH goes through `saveHomepageSection()` (§7.3), which chains
 * `update().eq().select()` and falls back to `upsert().select()`. This mock models
 * both branches so "matched nothing" and "nothing written" are expressible.
 */
function makeWriteSupabase(
  plan: {
    updatedRows?: unknown[] | null
    updateError?: { message: string } | null
    insertedRows?: unknown[] | null
    insertError?: { message: string } | null
  } = {}
) {
  const updateSelect = vi.fn(async (_columns: string) =>
    plan.updateError
      ? { data: null, error: plan.updateError }
      : { data: plan.updatedRows ?? [{ section_key: 'updated' }], error: null }
  )
  const upsertSelect = vi.fn(async (_columns: string) =>
    plan.insertError
      ? { data: null, error: plan.insertError }
      : { data: plan.insertedRows ?? [{ section_key: 'created' }], error: null }
  )
  const eqFn = vi.fn((_column: string, _value: string) => ({ select: updateSelect }))
  const updateFn = vi.fn((_values: Record<string, unknown>) => ({ eq: eqFn }))
  const upsertFn = vi.fn((_values: Record<string, unknown>, _options: { onConflict: string }) => ({
    select: upsertSelect,
  }))

  return {
    from: vi.fn((_table: string) => ({ update: updateFn, upsert: upsertFn })),
    calls: { updateFn, upsertFn, updateSelect, upsertSelect },
  }
}

describe('GET /api/admin/homepage/sections', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminApiSession.mockResolvedValue({ ok: true, context: {} })
  })

  it('returns both sections keyed by section_key', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase([QUICK_PICKS_ROW, PROCESS_PICKS_ROW]))

    const request = new Request('http://localhost/api/admin/homepage/sections')
    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.sections).toHaveProperty('quick_picks')
    expect(payload.sections).toHaveProperty('process_picks')
    expect(payload.sections.quick_picks.content.heading).toBe('What are you here for?!')
    expect(payload.sections.process_picks.content.heading).toBe('Start with the action!')
  })

  it('returns an empty sections object when no rows exist yet', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase([]))

    const request = new Request('http://localhost/api/admin/homepage/sections')
    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.sections).toEqual({})
  })

  it('returns 500 when Supabase query fails', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase(null, { message: 'connection error' }))

    const request = new Request('http://localhost/api/admin/homepage/sections')
    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toMatch(/could not load/i)
  })

  it('returns 401 when admin session is invalid', async () => {
    mocks.requireAdminApiSession.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized admin request.' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    })

    const request = new Request('http://localhost/api/admin/homepage/sections')
    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload.error).toBe('Unauthorized admin request.')
  })
})

describe('PATCH /api/admin/homepage/sections', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminApiSession.mockResolvedValue({ ok: true, context: {} })
    mocks.writeAdminAuditLog.mockResolvedValue(undefined)
  })

  it('saves visibility for all provided section keys', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeWriteSupabase())

    const request = new Request('http://localhost/api/admin/homepage/sections', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sections: [
          { key: 'hero', is_visible: true },
          { key: 'newsletter', is_visible: false },
        ],
      }),
    })
    const response = await PATCH(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(payload.created).toEqual([])
    expect(mocks.writeAdminAuditLog).toHaveBeenCalledOnce()
  })

  it('creates and reports a row for a key that has none (§7.3)', async () => {
    const { from, calls } = makeWriteSupabase({ updatedRows: [] })
    mocks.getSupabaseAdmin.mockReturnValue({ from })

    const request = new Request('http://localhost/api/admin/homepage/sections', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sections: [{ key: 'shop_all_preview', is_visible: true }] }),
    })
    const response = await PATCH(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    // Previously this key reported {ok:true} and stored nothing.
    expect(payload.created).toEqual(['shop_all_preview'])
    expect(calls.upsertFn.mock.calls[0][0]).toMatchObject({
      section_key: 'shop_all_preview',
      sort_order: 45,
    })
    expect(mocks.writeAdminAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        details: expect.objectContaining({ created: ['shop_all_preview'] }),
      })
    )
  })

  it('returns 500 when a key cannot be written at all', async () => {
    // 0 rows matched and the create wrote nothing — the silent no-op §7.3 filed.
    mocks.getSupabaseAdmin.mockReturnValue(makeWriteSupabase({ updatedRows: [], insertedRows: [] }))

    const request = new Request('http://localhost/api/admin/homepage/sections', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sections: [{ key: 'hero', is_visible: true }] }),
    })
    const response = await PATCH(request)
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toMatch(/failed to update/i)
    expect(mocks.writeAdminAuditLog).not.toHaveBeenCalled()
  })

  it('returns 400 for an unrecognised section key', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase([]))

    const request = new Request('http://localhost/api/admin/homepage/sections', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sections: [{ key: 'unknown_section', is_visible: true }] }),
    })
    const response = await PATCH(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/recognised section key/i)
  })

  it('returns 400 when sections array is missing', async () => {
    const request = new Request('http://localhost/api/admin/homepage/sections', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ not_sections: [] }),
    })
    const response = await PATCH(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/sections array/i)
  })

  it('returns 500 when a database update fails', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(
      makeWriteSupabase({ updateError: { message: 'db error' } })
    )

    const request = new Request('http://localhost/api/admin/homepage/sections', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sections: [{ key: 'hero', is_visible: true }] }),
    })
    const response = await PATCH(request)
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toMatch(/failed to update/i)
  })

  it('returns 401 when admin session is invalid', async () => {
    mocks.requireAdminApiSession.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized admin request.' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    })

    const request = new Request('http://localhost/api/admin/homepage/sections', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sections: [{ key: 'hero', is_visible: true }] }),
    })
    const response = await PATCH(request)
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload.error).toBe('Unauthorized admin request.')
  })
})
