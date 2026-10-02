import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdminApiSession: vi.fn(),
  writeAdminAuditLog: vi.fn(),
  getSupabaseAdmin: vi.fn(),
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

const VALID_BODY = {
  heading: 'What are you here for?!',
  subheading: 'Jump straight to the good stuff.',
  is_visible: true,
  items: [
    { key: 'stickers', label: 'Stickers', emoji: '✨', href: '/shop/categories/seasonal-items' },
    { key: 'slate', label: 'Slate Signs', emoji: '🪨', href: '/shop/categories/signs-and-decor' },
  ],
}

function makeParams(key: string) {
  return { params: Promise.resolve({ key }) }
}

interface SupabasePlan {
  /** Rows the update path reports back. `[]` is PostgREST's "matched nothing". */
  updatedRows?: unknown[] | null
  updateError?: { message: string } | null
  /** Rows the create path reports back. `[]` means nothing was written. */
  insertedRows?: unknown[] | null
  insertError?: { message: string } | null
}

function makeSupabase(plan: SupabasePlan = {}) {
  // §7.3: the route no longer writes directly — it goes through
  // saveHomepageSection(), which asks for the written rows back and creates the
  // row when none matched. The mock mirrors that chain so "0 rows matched" and
  // "nothing written" are both expressible.
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
    supabase: {
      from: vi.fn((_table: string) => ({ update: updateFn, upsert: upsertFn })),
    },
    calls: { updateFn, upsertFn, eqFn, updateSelect, upsertSelect },
  }
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/admin/homepage/sections/quick_picks', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/admin/homepage/sections/[key]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminApiSession.mockResolvedValue({ ok: true, context: {} })
    mocks.writeAdminAuditLog.mockResolvedValue(undefined)
  })

  it('saves a valid quick_picks section and returns ok', async () => {
    const { supabase, calls } = makeSupabase()
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const response = await PATCH(makeRequest(VALID_BODY), makeParams('quick_picks'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(calls.updateFn).toHaveBeenCalledOnce()
    expect(mocks.writeAdminAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'success', entityId: 'quick_picks' })
    )
  })

  it('saves a valid process_picks section', async () => {
    const { supabase } = makeSupabase()
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const body = {
      ...VALID_BODY,
      heading: 'Start with the action!',
      items: [{ key: 'sublimation', label: 'Sublimation', emoji: '🌈', href: '/shop/all?process=sublimation' }],
    }

    const response = await PATCH(makeRequest(body), makeParams('process_picks'))
    expect(response.status).toBe(200)
  })

  it('returns 404 for an unknown section key', async () => {
    const response = await PATCH(makeRequest(VALID_BODY), makeParams('totally_unknown_key'))
    const payload = await response.json()

    expect(response.status).toBe(404)
    expect(payload.error).toMatch(/unknown section/i)
  })

  it('returns 400 when heading is missing', async () => {
    const { heading: _omit, ...bodyWithoutHeading } = VALID_BODY
    const response = await PATCH(makeRequest(bodyWithoutHeading), makeParams('quick_picks'))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/heading/i)
  })

  it('returns 400 when items is not an array', async () => {
    const response = await PATCH(
      makeRequest({ ...VALID_BODY, items: 'not-an-array' }),
      makeParams('quick_picks')
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/items/i)
  })

  it('returns 400 when an item is missing a label', async () => {
    const badItems = [{ key: 'a', emoji: '🔥', href: '/shop' }] // no label
    const response = await PATCH(
      makeRequest({ ...VALID_BODY, items: badItems }),
      makeParams('quick_picks')
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/label/i)
  })

  it('returns 400 when an item has an external (non-relative) href', async () => {
    const badItems = [{ key: 'a', label: 'Ext', emoji: '🔥', href: 'https://evil.example.com/inject' }]
    const response = await PATCH(
      makeRequest({ ...VALID_BODY, items: badItems }),
      makeParams('quick_picks')
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/relative path/i)
  })

  it('returns 400 when an item is missing an emoji', async () => {
    const badItems = [{ key: 'a', label: 'Missing emoji', href: '/shop' }]
    const response = await PATCH(
      makeRequest({ ...VALID_BODY, items: badItems }),
      makeParams('quick_picks')
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/emoji/i)
  })

  it('returns 500 and logs failure when Supabase update fails', async () => {
    const { supabase } = makeSupabase({ updateError: { message: 'db write failure' } })
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const response = await PATCH(makeRequest(VALID_BODY), makeParams('quick_picks'))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(mocks.writeAdminAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failure' })
    )
  })

  // ── §7.3: a key with no DB row must be created, not silently discarded ──────
  it('creates the row when the section has no DB row yet (shop_all_preview)', async () => {
    const { supabase, calls } = makeSupabase({ updatedRows: [] })
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const response = await PATCH(
      makeRequest({ product_count: 6, show_filters: true, heading: 'Shop All Products' }),
      makeParams('shop_all_preview')
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ ok: true, created: true })

    const [values, options] = calls.upsertFn.mock.calls[0]
    expect(options).toEqual({ onConflict: 'section_key' })
    expect(values.section_key).toBe('shop_all_preview')
    // 45 — the documented slot between featured_collections (40) and
    // fresh_from_forge (50), not the column default 0.
    expect(values.sort_order).toBe(45)

    expect(mocks.writeAdminAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        entityId: 'shop_all_preview',
        details: expect.objectContaining({ created: true }),
      })
    )
  })

  it('reports created:false when an existing row is updated', async () => {
    const { supabase, calls } = makeSupabase()
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const response = await PATCH(makeRequest(VALID_BODY), makeParams('quick_picks'))
    const payload = await response.json()

    expect(payload).toMatchObject({ ok: true, created: false })
    expect(calls.upsertFn).not.toHaveBeenCalled()
  })

  // ── §7.7: tile accents are normalised to brand colours ─────────────────────
  it('normalises off-brand item colours to the brand accent and reports them', async () => {
    const { supabase, calls } = makeSupabase()
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const body = {
      ...VALID_BODY,
      items: [
        {
          key: 'violet',
          label: 'Violet tile',
          emoji: '🔮',
          href: '/shop',
          glow_color: '#C084FC',                                   // off-brand violet
          gradient: 'linear-gradient(135deg, #6B9E6B 0%, #6A7AC4 100%)', // green/indigo
        },
      ],
    }

    const response = await PATCH(makeRequest(body), makeParams('quick_picks'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    const written = calls.updateFn.mock.calls[0][0].content as {
      items: Array<{ glow_color?: string; gradient?: string }>
    }
    // glow_color falls back to the brand accent; the off-brand gradient is dropped
    // so the component's own brand default applies.
    expect(written.items[0].glow_color).toBe('#C4921A')
    expect(written.items[0].gradient).toBeUndefined()

    expect(payload.normalised).toEqual([
      'items[0].gradient: dropped (off-brand #6b9e6b, #6a7ac4)',
      'items[0].glow_color: #C084FC → #C4921A',
    ])
  })

  it('leaves brand colours untouched', async () => {
    const { supabase, calls } = makeSupabase()
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const body = {
      ...VALID_BODY,
      items: [{ key: 'gold', label: 'Gold tile', emoji: '✨', href: '/shop', glow_color: '#C4921A' }],
    }

    const response = await PATCH(makeRequest(body), makeParams('quick_picks'))
    const payload = await response.json()

    const written = calls.updateFn.mock.calls[0][0].content as { items: Array<{ glow_color?: string }> }
    expect(written.items[0].glow_color).toBe('#C4921A')
    expect(payload.normalised).toEqual([])
  })

  it('returns 500 and audits a failure when neither branch wrote a row', async () => {
    // The exact silent no-op §7.3 filed: 0 rows matched *and* the create
    // returned nothing. The old code answered {ok:true} and audited success.
    const { supabase } = makeSupabase({ updatedRows: [], insertedRows: [] })
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const response = await PATCH(makeRequest(VALID_BODY), makeParams('quick_picks'))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toMatch(/could not save/i)
    expect(mocks.writeAdminAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failure' })
    )
    expect(mocks.writeAdminAuditLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'success' })
    )
  })

  // ── the other rewired branches, so a dispatch regression cannot hide ────────
  it('saves hero_collage content through the same verified write path', async () => {
    const { supabase, calls } = makeSupabase()
    mocks.getSupabaseAdmin.mockReturnValue(supabase)
    const body = { is_visible: true, image_count: 2, images: [{ url: '/x.png', alt: 'x' }] }

    const response = await PATCH(makeRequest(body), makeParams('hero_collage'))
    expect(response.status).toBe(200)

    // The hero branch stores the raw body as content — unchanged behaviour.
    expect(calls.updateFn.mock.calls[0][0].content).toEqual(body)
  })

  it('saves future_products_notify and records its cta_label', async () => {
    const { supabase, calls } = makeSupabase()
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const response = await PATCH(
      makeRequest({
        heading: 'Want early access?',
        // Supplied so the assertion does not pin the route's default copy.
        subheading: '  Tell us what you want.  ',
        cta_label: 'Notify me',
      }),
      makeParams('future_products_notify')
    )
    const payload = await response.json()

    expect(payload).toEqual({ ok: true, created: false })
    expect(calls.updateFn.mock.calls[0][0].content).toEqual({
      heading: 'Want early access?',
      subheading: 'Tell us what you want.', // trimmed
      cta_label: 'Notify me',
    })
    expect(mocks.writeAdminAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ cta_label: 'Notify me', created: false }),
      })
    )
  })

  it('keeps a visibility-only section from sending content (it would wipe the stored one)', async () => {
    const { supabase, calls } = makeSupabase()
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const response = await PATCH(makeRequest({ is_visible: false }), makeParams('newsletter'))
    expect(response.status).toBe(200)

    const written = calls.updateFn.mock.calls[0][0]
    expect(written.is_visible).toBe(false)
    expect(written).not.toHaveProperty('content')
    expect(written).not.toHaveProperty('sort_order')
  })

  it('returns 401 when admin session is invalid', async () => {
    mocks.requireAdminApiSession.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized admin request.' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    })

    const response = await PATCH(makeRequest(VALID_BODY), makeParams('quick_picks'))
    expect(response.status).toBe(401)
  })

  it('returns 400 for invalid JSON body', async () => {
    const request = new Request('http://localhost/api/admin/homepage/sections/quick_picks', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: 'not-json{{{',
    })

    const response = await PATCH(request, makeParams('quick_picks'))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/invalid json/i)
  })
})
