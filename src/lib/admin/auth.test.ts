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

/** OCT #34: the admin session TTL now comes from storefront settings. */
const storefrontSettings = vi.hoisted(() => ({
  getAdminSessionSettings: vi.fn(async () => ({ ttl_hours: 12 })),
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

vi.mock('@/lib/storefront-settings', () => ({
  getAdminSessionSettings: storefrontSettings.getAdminSessionSettings,
}))

import {
  isAdminSessionFresh,
  requireAdminApiSession,
  requireAdminPageMfaSessionOrRedirect,
  requireAdminPageSessionOrRedirect,
  resetAdminSessionTtlCache,
} from '@/lib/admin/auth'

const ADMIN_USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

const ACTIVE_ROW = {
  user_id: ADMIN_USER_ID,
  email: 'admin@example.com',
  is_active: true,
  revoked_at: null,
  last_login_at: null,
}

/** Seconds since the epoch, offset from *now* so the TTL check sees a live value. */
function secondsAgo(seconds: number): number {
  return Math.floor(Date.now() / 1000) - seconds
}

/**
 * `amr` defaults to a session that authenticated a minute ago — an `oauth` entry
 * plus the `totp` entry MFA verification mints, which is what the admin session
 * TTL (OCT #34) measures from. Pass `amr: null` to omit the claim entirely.
 */
function claimsPayload(
  appMetadata: Record<string, unknown> = { role: 'admin' },
  aal = 'aal2',
  amr: unknown = [
    { method: 'oauth', timestamp: secondsAgo(90) },
    { method: 'totp', timestamp: secondsAgo(60) },
  ]
) {
  return {
    sub: ADMIN_USER_ID,
    email: 'admin@example.com',
    iat: 1_800_000_000,
    aal,
    ...(amr === null ? {} : { amr }),
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
  // The TTL read is memoised for 60 s, so each test starts from a cold cache.
  resetAdminSessionTtlCache()
  storefrontSettings.getAdminSessionSettings.mockReset().mockResolvedValue({ ttl_hours: 12 })
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

describe('admin session TTL (OCT #34)', () => {
  it('refuses a session older than admin_session.ttl_hours, with its own code', async () => {
    supabaseAuth.getClaims.mockResolvedValue({
      data: { claims: claimsPayload({ role: 'admin' }, 'aal2', [
        { method: 'oauth', timestamp: secondsAgo(13 * 3600) },
        { method: 'totp', timestamp: secondsAgo(12 * 3600 + 60) },
      ]) },
      error: null,
    })

    const response = await expectDenied(await requireAdminApiSession(apiRequest()))

    expect(response?.status).toBe(401)
    expect(await response?.json()).toEqual({
      error: 'Admin session expired. Sign in again.',
      code: 'admin_session_expired',
    })
  })

  it('admits a session inside the TTL', async () => {
    const result = await requireAdminApiSession(apiRequest())

    expect(result.ok).toBe(true)
  })

  it('fails closed when the token carries no usable amr', async () => {
    supabaseAuth.getClaims.mockResolvedValue({
      data: { claims: claimsPayload({ role: 'admin' }, 'aal2', null) },
      error: null,
    })

    const response = await expectDenied(await requireAdminApiSession(apiRequest()))

    expect(response?.status).toBe(401)
    expect(await response?.json()).toMatchObject({ code: 'admin_session_expired' })
  })

  it('honours a shorter TTL from settings', async () => {
    storefrontSettings.getAdminSessionSettings.mockResolvedValue({ ttl_hours: 1 })
    supabaseAuth.getClaims.mockResolvedValue({
      data: { claims: claimsPayload({ role: 'admin' }, 'aal2', [
        { method: 'totp', timestamp: secondsAgo(2 * 3600) },
      ]) },
      error: null,
    })

    const response = await expectDenied(await requireAdminApiSession(apiRequest()))

    expect(await response?.json()).toMatchObject({ code: 'admin_session_expired' })
  })

  it('does not treat a later non-MFA entry as a fresh authentication', async () => {
    // The refresh token keeps `aal2`; only a new `totp` entry is re-authentication.
    supabaseAuth.getClaims.mockResolvedValue({
      data: { claims: claimsPayload({ role: 'admin' }, 'aal2', [
        { method: 'totp', timestamp: secondsAgo(13 * 3600) },
        { method: 'token_refresh', timestamp: secondsAgo(60) },
      ]) },
      error: null,
    })

    const response = await expectDenied(await requireAdminApiSession(apiRequest()))

    expect(await response?.json()).toMatchObject({ code: 'admin_session_expired' })
  })

  it('redirects an expired page session to login with reason=expired', async () => {
    supabaseAuth.getClaims.mockResolvedValue({
      data: { claims: claimsPayload({ role: 'admin' }, 'aal2', [
        { method: 'totp', timestamp: secondsAgo(13 * 3600) },
      ]) },
      error: null,
    })

    await expect(requireAdminPageSessionOrRedirect('/admin')).rejects.toThrow(
      'REDIRECT:/admin/login?reason=expired&next=%2Fadmin'
    )
  })

  it('redirects an expired aal1 session to login, not to the MFA challenge', async () => {
    supabaseAuth.getClaims.mockResolvedValue({
      data: { claims: claimsPayload({ role: 'admin' }, 'aal1', [
        { method: 'oauth', timestamp: secondsAgo(13 * 3600) },
      ]) },
      error: null,
    })

    await expect(requireAdminPageSessionOrRedirect('/admin')).rejects.toThrow(
      'REDIRECT:/admin/login?reason=expired&next=%2Fadmin'
    )
  })

  it('still lets an expired session reach the MFA page — verifying MFA is the re-authentication', async () => {
    supabaseAuth.getClaims.mockResolvedValue({
      data: { claims: claimsPayload({ role: 'admin' }, 'aal1', [
        { method: 'oauth', timestamp: secondsAgo(13 * 3600) },
      ]) },
      error: null,
    })

    await expect(requireAdminPageMfaSessionOrRedirect()).resolves.toEqual({
      actorUserId: ADMIN_USER_ID,
      actorEmail: 'admin@example.com',
    })
  })
})

describe('isAdminSessionFresh (OCT #34)', () => {
  const claims = (authenticatedAt: number | null) => ({
    sub: ADMIN_USER_ID,
    email: 'admin@example.com',
    issuedAt: 1_800_000_000,
    aal: 'aal2',
    authenticatedAt,
    authenticationMethods: [],
    appMetadata: { role: 'admin' },
  })

  it('treats the TTL boundary as expired', async () => {
    const now = 1_800_000_000_000

    await expect(isAdminSessionFresh(claims(1_800_000_000 - 12 * 3600), now)).resolves.toBe(false)
    await expect(isAdminSessionFresh(claims(1_800_000_000 - 12 * 3600 + 1), now)).resolves.toBe(
      true
    )
  })

  it('treats a token without amr as expired', async () => {
    await expect(isAdminSessionFresh(claims(null))).resolves.toBe(false)
  })

  it('memoises the settings read for 60 s', async () => {
    await isAdminSessionFresh(claims(secondsAgo(10)))
    await isAdminSessionFresh(claims(secondsAgo(20)))

    expect(storefrontSettings.getAdminSessionSettings).toHaveBeenCalledTimes(1)
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
