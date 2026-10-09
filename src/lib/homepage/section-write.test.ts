import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}))

import { saveHomepageSection, saveHomepageSectionOrder } from '@/lib/homepage/section-write'

/**
 * §7.3 regression suite. The defect was silent: an update matching zero rows is
 * not an error in PostgREST, so the old code returned success and audited success
 * while storing nothing. Every case below is about *proving a row was written*.
 */

interface Plan {
  /** Result of the update branch (`update().eq().select()`). */
  update?: { data: unknown[] | null; error: { message: string } | null }
  /** Result of the create branch (`upsert().select()`). */
  upsert?: { data: unknown[] | null; error: { message: string } | null }
}

function makeSupabase(plan: Plan = {}) {
  // Parameters are declared so vitest types `mock.calls` and the assertions below
  // can read the written payload without casts.
  const updateSelect = vi.fn(async (_columns: string) => plan.update ?? { data: [{ section_key: 'hero' }], error: null })
  const upsertSelect = vi.fn(async (_columns: string) => plan.upsert ?? { data: [{ section_key: 'hero' }], error: null })

  const eq = vi.fn((_column: string, _value: string) => ({ select: updateSelect }))
  const update = vi.fn((_values: Record<string, unknown>) => ({ eq }))
  const upsert = vi.fn((_values: Record<string, unknown>, _options: { onConflict: string }) => ({
    select: upsertSelect,
  }))
  const from = vi.fn((_table: string) => ({ update, upsert }))

  return { supabase: { from }, calls: { from, update, eq, updateSelect, upsert, upsertSelect } }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('saveHomepageSection — update path', () => {
  it('reports "updated" when a row matched', async () => {
    const { supabase, calls } = makeSupabase()
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const result = await saveHomepageSection({ sectionKey: 'hero', isVisible: true })

    expect(result).toEqual({ ok: true, created: false })
    expect(calls.update).toHaveBeenCalledOnce()
    expect(calls.upsert).not.toHaveBeenCalled()
    expect(calls.updateSelect).toHaveBeenCalledWith('section_key')
  })

  it('never writes sort_order on the update path — that would undo admin ordering (§7.2)', async () => {
    const { supabase, calls } = makeSupabase()
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    await saveHomepageSection({ sectionKey: 'hero', isVisible: false })

    const payload = calls.update.mock.calls[0][0]
    expect(payload).not.toHaveProperty('sort_order')
    expect(payload.is_visible).toBe(false)
    expect(payload.content).toBeUndefined() // visibility-only toggle keeps content
    expect(typeof payload.updated_at).toBe('string')
  })

  it('keeps the content payload when one is supplied', async () => {
    const { supabase, calls } = makeSupabase()
    mocks.getSupabaseAdmin.mockReturnValue(supabase)
    const content = { heading: 'Shop All Products', product_count: 6, show_filters: true }

    await saveHomepageSection({ sectionKey: 'shop_all_preview', isVisible: true, content })

    expect(calls.update.mock.calls[0][0].content).toEqual(content)
  })

  it('fails when the update returns a database error', async () => {
    const { supabase } = makeSupabase({
      update: { data: null, error: { message: 'permission denied' } },
    })
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const result = await saveHomepageSection({ sectionKey: 'hero', isVisible: true })

    expect(result).toEqual({ ok: false, error: 'permission denied' })
  })
})

describe('saveHomepageSection — create path (§7.3)', () => {
  it('creates the row when the update matched nothing, and says so', async () => {
    const { supabase, calls } = makeSupabase({ update: { data: [], error: null } })
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const result = await saveHomepageSection({
      sectionKey: 'shop_all_preview',
      isVisible: true,
      content: { heading: 'Shop All Products' },
    })

    expect(result).toEqual({ ok: true, created: true })
    expect(calls.upsert).toHaveBeenCalledOnce()

    const [payload, options] = calls.upsert.mock.calls[0]
    expect(options).toEqual({ onConflict: 'section_key' })
    expect(payload.section_key).toBe('shop_all_preview')
    // 45, not the column default 0 — a new row must not jump to the top.
    expect(payload.sort_order).toBe(45)
    expect(payload.content).toEqual({ heading: 'Shop All Products' })
    expect(payload.is_visible).toBe(true)
  })

  it('gives future_products_notify its documented slot too', async () => {
    const { supabase, calls } = makeSupabase({ update: { data: [], error: null } })
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    await saveHomepageSection({ sectionKey: 'future_products_notify', isVisible: true })

    expect(calls.upsert.mock.calls[0][0].sort_order).toBe(105)
  })

  it('fails when the create returns a database error', async () => {
    const { supabase } = makeSupabase({
      update: { data: [], error: null },
      upsert: { data: null, error: { message: 'duplicate key value' } },
    })
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const result = await saveHomepageSection({ sectionKey: 'hero', isVisible: true })

    expect(result).toEqual({ ok: false, error: 'duplicate key value' })
  })

  it('fails when neither branch wrote a row — the silent no-op this item fixes', async () => {
    const { supabase } = makeSupabase({
      update: { data: [], error: null },
      upsert: { data: [], error: null },
    })
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const result = await saveHomepageSection({ sectionKey: 'hero', isVisible: true })

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toMatch(/no row was written/i)
  })
})

describe('saveHomepageSectionOrder — reorder path (OCT-24)', () => {
  it('writes sort_order on the update path when a row exists', async () => {
    const { supabase, calls } = makeSupabase()
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const result = await saveHomepageSectionOrder('shop_all_preview', 40)

    expect(result).toEqual({ ok: true })
    expect(calls.update).toHaveBeenCalledOnce()
    expect(calls.upsert).not.toHaveBeenCalled()
    expect(calls.update.mock.calls[0][0].sort_order).toBe(40)
  })

  it('creates the row when the key has none, so ordering a row-less key cannot no-op', async () => {
    const { supabase, calls } = makeSupabase({ update: { data: [], error: null } })
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const result = await saveHomepageSectionOrder('shop_all_preview', 40)

    expect(result).toEqual({ ok: true })
    expect(calls.upsert).toHaveBeenCalledOnce()
    const [payload, options] = calls.upsert.mock.calls[0]
    expect(options).toEqual({ onConflict: 'section_key' })
    expect(payload.section_key).toBe('shop_all_preview')
    expect(payload.sort_order).toBe(40)
    expect(payload.is_visible).toBe(true)
  })

  it('reports a failure when neither branch wrote a row', async () => {
    const { supabase } = makeSupabase({
      update: { data: [], error: null },
      upsert: { data: [], error: null },
    })
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const result = await saveHomepageSectionOrder('shop_all_preview', 40)

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toMatch(/no row was written/i)
  })
})
