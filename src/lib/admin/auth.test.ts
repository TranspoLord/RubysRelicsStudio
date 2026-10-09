import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Route/page gate matrix (docs/archive/SEPT_IMPLEMENTATION_PLAN §10.3 / §10.4).
 *
 * The two things this file exists to protect:
 *   1. the gate fails **closed** — absent session, wrong role, missing/
 *      deactivated/revoked allow-list row and database errors all deny;
 *   2. the CSRF model did not change — `requireCsrf` still runs first and still
 *      short-circuits before any Supabase call.
 */

const allowList = vi.hoisted(() => ({
  eqCalls: [] as Array<[string, string]>,
  maybeSingle: vi.fn(),
  update: vi.fn(),
}))

const supabaseAuth = vi.hoisted(() => ({
  getClaims: vi.fn(),
}))

const rateLimiter = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  rateLimitResponse: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

vi.mock('@/lib/security/logger', () => ({
  safeLogError: vi.fn(),
  safeLog: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  getClientIp: () => '203.0.113.7',
  rateLimit: rateLimiter.rateLimit,
  rateLimitResponse: rateLimiter.rateLimitResponse,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getClaims: supabaseAuth.getClaims },
  })),
}))

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: (column: string, value: string) => {
          allowList.eqCalls.push([column, value])
          return { maybeSingle: allowList.maybeSingle }
        },
      }),
      update: () => ({ eq: allowList.update }),
    }),
  }),
}))

import { requireAdminApiSession, requireAdminPageMfaSessionOrRedirect, requireAdminPageSessionOrRedirect } from '@/lib/admin/auth'

const ADMIN_USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

const ACTIVE_ROW = {
  user_id: ADMIN_USER_ID,
  email: 'admin@example.com',
  is_active: true,
  revoked_at: null,
  last_login_at: null,
}

function claimsPayload(appMetadata: Record<string, unknown> = { role: 'admin' }, aal = 'aal2') {
  return {
    sub: ADMIN_USER_ID,
    email: 'admin@example.com',
    iat: 1_800_000_000,
    aal,
    app_metadata: appMetadata,
  }
}

function apiRequest(method = 'GET') {
  return new Request('https://rubysrelics.test/api/admin/orders', { method })
}

async function expectDenied(result: Awaited<ReturnType<typeof requireAdminApiSession>>) {
  expect(result.ok).toBe(false)
  if (result.ok) return null
  return result.response
}

beforeEach(() => {
  allowList.eqCalls.length = 0
  allowList.maybeSingle.mockReset().mockResolvedValue({ data: ACTIVE_ROW, error: null })
  allowList.update.mockReset().mockResolvedValue({ error: null })
  supabaseAuth.getClaims
    .mockReset()
    .mockResolvedValue({ data: { claims: claimsPayload() }, error: null })
  rateLimiter.rateLimit.mockReset().mockResolvedValue({ allowed: true })
  rateLimiter.rateLimitResponse.mockReset()
})

describe('requireAdminApiSession — admits an allow-listed admin', () => {
  it('returns the acting identity instead of a shared key', async () => {
    const result = await requireAdminApiSession(apiRequest())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.context).toEqual({
      actorUserId: ADMIN_USER_ID,
      actorEmail: 'admin@example.com',
      clientIp: '203.0.113.7',
    })
    // Authorization comes from the allow-list row keyed by user_id, not from
    // the email claim.
    expect(allowList.eqCalls).toEqual([['user_id', ADMIN_USER_ID]])
  })

  it('applies the rate limit only after the identity checks', async () => {
    const limited = new Response(null, { status: 429 })
    rateLimiter.rateLimit.mockResolvedValue({ allowed: false, retryAfter: 30 })
    rateLimiter.rateLimitResponse.mockReturnValue(limited)

    const result = await requireAdminApiSession(apiRequest(), {
      key: 'admin-test',
      maxRequests: 5,
      windowMs: 1000,
    })

    const response = await expectDenied(result)
    expect(response).toBe(limited)
    expect(rateLimiter.rateLimitResponse).toHaveBeenCalledWith(30)
  })
})

describe('requireAdminApiSession — fails closed', () => {
  it('denies an absent session', async () => {
    supabaseAuth.getClaims.mockResolvedValue({ data: null, error: null })
    const response = await expectDenied(await requireAdminApiSession(apiRequest()))
    expect(response?.status).toBe(401)
  })

  it('denies an unverifiable session (expired or forged JWT)', async () => {
    supabaseAuth.getClaims.mockResolvedValue({ data: null, error: { message: 'invalid JWT' } })
    const response = await expectDenied(await requireAdminApiSession(apiRequest()))
    expect(response?.status).toBe(401)
  })

  it('denies a signed-in non-admin', async () => {
    supabaseAuth.getClaims.mockResolvedValue({
      data: { claims: claimsPayload({ role: 'customer' }) },
      error: null,
    })
    const response = await expectDenied(await requireAdminApiSession(apiRequest()))
    expect(response?.status).toBe(401)
  })

  it('denies an admin claim with no allow-list row', async () => {
    allowList.maybeSingle.mockResolvedValue({ data: null, error: null })
    const response = await expectDenied(await requireAdminApiSession(apiRequest()))
    expect(response?.status).toBe(401)
  })

  it('denies a deactivated row (revocation takes effect immediately)', async () => {
    allowList.maybeSingle.mockResolvedValue({
      data: { ...ACTIVE_ROW, is_active: false },
      error: null,
    })
    const response = await expectDenied(await requireAdminApiSession(apiRequest()))
    expect(response?.status).toBe(401)
  })

  it('denies a revoked row even though the JWT is still valid', async () => {
    allowList.maybeSingle.mockResolvedValue({
      data: { ...ACTIVE_ROW, revoked_at: '2026-09-26T00:00:00.000Z' },
      error: null,
    })
    const response = await expectDenied(await requireAdminApiSession(apiRequest()))
    expect(response?.status).toBe(401)
  })

  it('returns 500 rather than admitting anyone when the allow-list read fails', async () => {
    allowList.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'connection refused' },
    })
    const response = await expectDenied(await requireAdminApiSession(apiRequest()))
    expect(response?.status).toBe(500)
  })

  it('refuses an admin at aal1 with an MFA-required marker (§10.16)', async () => {
    supabaseAuth.getClaims.mockResolvedValue({
      data: { claims: claimsPayload({ role: 'admin' }, 'aal1') },
      error: null,
    })

    const response = await expectDenied(await requireAdminApiSession(apiRequest()))
    expect(response?.status).toBe(401)
    expect(await response?.json()).toEqual({ error: 'MFA required.', code: 'mfa_required' })
  })

  it('keeps the CSRF check in front of everything else', async () => {
    const result = await requireAdminApiSession(
      new Request('https://rubysrelics.test/api/admin/orders', { method: 'POST' })
    )

    const response = await expectDenied(result)
    expect(response?.status).toBe(403)
    expect(supabaseAuth.getClaims).not.toHaveBeenCalled()
  })
})

describe('requireAdminPageSessionOrRedirect', () => {
  it('sends an unauthenticated visitor to login with a sanitized next', async () => {
    supabaseAuth.getClaims.mockResolvedValue({ data: null, error: null })

    await expect(requireAdminPageSessionOrRedirect('/admin/homepage')).rejects.toThrow(
      'REDIRECT:/admin/login?next=%2Fadmin%2Fhomepage'
    )
  })

  it('narrows a hostile next back to /admin', async () => {
    supabaseAuth.getClaims.mockResolvedValue({ data: null, error: null })

    await expect(requireAdminPageSessionOrRedirect('https://evil.example/')).rejects.toThrow(
      'REDIRECT:/admin/login?next=%2Fadmin'
    )
  })

  it('sends a signed-in non-admin to the not-authorized page', async () => {
    supabaseAuth.getClaims.mockResolvedValue({
      data: { claims: claimsPayload({ role: 'customer' }) },
      error: null,
    })

    await expect(requireAdminPageSessionOrRedirect('/admin')).rejects.toThrow(
      'REDIRECT:/admin/not-authorized'
    )
  })

  it('sends a deactivated admin to the not-authorized page', async () => {
    allowList.maybeSingle.mockResolvedValue({
      data: { ...ACTIVE_ROW, is_active: false },
      error: null,
    })

    await expect(requireAdminPageSessionOrRedirect('/admin')).rejects.toThrow(
      'REDIRECT:/admin/not-authorized'
    )
  })

  it('fails closed to the not-authorized page on a database error', async () => {
    allowList.maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })

    await expect(requireAdminPageSessionOrRedirect('/admin')).rejects.toThrow(
      'REDIRECT:/admin/not-authorized'
    )
  })

  it('returns the acting identity for an allow-listed admin', async () => {
    await expect(requireAdminPageSessionOrRedirect('/admin')).resolves.toEqual({
      actorUserId: ADMIN_USER_ID,
      actorEmail: 'admin@example.com',
    })
  })

  it('sends an admin at aal1 to the MFA challenge page (§10.16)', async () => {
    supabaseAuth.getClaims.mockResolvedValue({
      data: { claims: claimsPayload({ role: 'admin' }, 'aal1') },
      error: null,
    })

    await expect(requireAdminPageSessionOrRedirect('/admin')).rejects.toThrow('REDIRECT:/admin/mfa')
  })

  it('stamps last_login_at once per fresh token', async () => {
    allowList.maybeSingle.mockResolvedValue({
      data: { ...ACTIVE_ROW, last_login_at: '2026-01-01T00:00:00.000Z' },
      error: null,
    })

    await requireAdminPageSessionOrRedirect('/admin')

    // The stamp is fire-and-forget, so drain the queue before asserting.
    await new Promise((resolve) => setImmediate(resolve))
    expect(allowList.update).toHaveBeenCalledTimes(1)
  })

  it('does not re-stamp when the token is older than the stored login', async () => {
    allowList.maybeSingle.mockResolvedValue({
      data: { ...ACTIVE_ROW, last_login_at: '2030-01-01T00:00:00.000Z' },
      error: null,
    })

    await requireAdminPageSessionOrRedirect('/admin')

    await new Promise((resolve) => setImmediate(resolve))
    expect(allowList.update).not.toHaveBeenCalled()
  })
})

describe('requireAdminPageMfaSessionOrRedirect (§10.16)', () => {
  it('admits an admin at aal1 — the MFA page is the path to aal2', async () => {
    supabaseAuth.getClaims.mockResolvedValue({
      data: { claims: claimsPayload({ role: 'admin' }, 'aal1') },
      error: null,
    })

    await expect(requireAdminPageMfaSessionOrRedirect()).resolves.toEqual({
      actorUserId: ADMIN_USER_ID,
      actorEmail: 'admin@example.com',
    })
  })

  it('still rejects a non-admin and a missing session', async () => {
    supabaseAuth.getClaims.mockResolvedValue({
      data: { claims: claimsPayload({ role: 'customer' }, 'aal1') },
      error: null,
    })
    await expect(requireAdminPageMfaSessionOrRedirect()).rejects.toThrow('REDIRECT:/admin/not-authorized')

    supabaseAuth.getClaims.mockResolvedValue({ data: null, error: null })
    await expect(requireAdminPageMfaSessionOrRedirect()).rejects.toThrow('REDIRECT:/admin/login')
  })
})
