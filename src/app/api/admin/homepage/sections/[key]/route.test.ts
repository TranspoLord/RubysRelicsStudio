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

function makeSupabase(updateError: { message: string } | null = null) {
  const eqFn = vi.fn(async () => ({ error: updateError }))
  const updateFn = vi.fn(() => ({ eq: eqFn }))
  return {
    supabase: {
      from: vi.fn(() => ({ update: updateFn })),
    },
    calls: { eqFn, updateFn },
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
    const { supabase } = makeSupabase({ message: 'db write failure' })
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const response = await PATCH(makeRequest(VALID_BODY), makeParams('quick_picks'))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(mocks.writeAdminAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failure' })
    )
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
