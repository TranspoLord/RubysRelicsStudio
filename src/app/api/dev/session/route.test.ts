import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { readSourceFile, stripComments } from '@/lib/testing/source-contract'

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}))

import { GET } from './route'

/**
 * The helper mints admin sessions, so these tests are mostly about what it
 * *refuses* to do. The happy path is asserted last, including that no token or
 * secret leaks into the response body.
 */

const ADMIN_ROW = {
  user_id: '443fb9f7-0000-4000-8000-000000000000',
  email: 'owner@example.com',
}

const ADMIN_CLAIMS = {
  sub: ADMIN_ROW.user_id,
  email: ADMIN_ROW.email,
  app_metadata: { role: 'admin' },
}

/** Fake service-role client: the allow-list read plus `generateLink`. */
function makeAdminClient(
  plan: {
    rows?: unknown[] | null
    readError?: { message: string } | null
    linkError?: unknown
    tokenHash?: string | null
  } = {}
) {
  const chain = {
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    limit: vi.fn(async () => ({ data: plan.rows ?? [ADMIN_ROW], error: plan.readError ?? null })),
  }

  return {
    from: vi.fn(() => ({ select: vi.fn(() => chain) })),
    auth: {
      admin: {
        generateLink: vi.fn(async () => ({
          data:
            plan.tokenHash === null
              ? { properties: {} }
              : { properties: { hashed_token: plan.tokenHash ?? 'hashed-token' } },
          error: plan.linkError ?? null,
        })),
      },
    },
  }
}

/** Fake cookie-bound client: `verifyOtp`, `getClaims`, and the §10.16 `mfa` escalator. */
function makeSessionClient(
  plan: {
    otpError?: { message: string } | null
    claims?: unknown
    mfaVerifyError?: { message: string } | null
  } = {}
) {
  return {
    auth: {
      verifyOtp: vi.fn(async () => ({
        data: { user: { id: ADMIN_ROW.user_id }, session: { access_token: 'never-returned' } },
        error: plan.otpError ?? null,
      })),
      getClaims: vi.fn(async () => ({ data: { claims: plan.claims ?? ADMIN_CLAIMS }, error: null })),
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn(async () => ({ data: { currentLevel: 'aal1' } })),
        listFactors: vi.fn(async () => ({ data: { all: [] } })),
        enroll: vi.fn(async () => ({
          data: { id: 'factor-1', totp: { secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' } },
          error: null,
        })),
        challenge: vi.fn(async () => ({ data: { id: 'challenge-1' } })),
        verify: vi.fn(async () => ({ error: plan.mfaVerifyError ?? null })),
        unenroll: vi.fn(async () => ({ error: null })),
      },
    },
  }
}

const DEV_TOKEN = 'a'.repeat(32)

function request(
  host = 'localhost:3000',
  query = '',
  options: { token?: string | null; fetchSite?: string | null; host?: string } = {}
) {
  // A real server always receives a `Host` header; undici's `Request` does not
  // synthesise one, so the tests set it explicitly (that is the whole point of
  // OCT #10 — the gate must read the caller's Host, not the bind hostname).
  const headers: Record<string, string> = { host: options.host ?? host }
  if (options.token !== null) headers['x-dev-signin-token'] = options.token ?? DEV_TOKEN
  if (options.fetchSite) headers['sec-fetch-site'] = options.fetchSite
  return new NextRequest(`http://${host}/api/dev/session${query}`, { headers })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv('NODE_ENV', 'development')
  vi.stubEnv('ADMIN_DEV_SIGNIN_ENABLED', 'true')
  // OCT #10: the flag is not a gate on its own.
  vi.stubEnv('ADMIN_DEV_SIGNIN_TOKEN', DEV_TOKEN)
  vi.stubEnv('ADMIN_DEV_SIGNIN_ALLOW_HOSTED', 'true')
  vi.stubEnv('VERCEL', '')
  vi.stubEnv('VERCEL_ENV', '')
  mocks.getSupabaseAdmin.mockReturnValue(makeAdminClient())
  mocks.createServerSupabaseClient.mockResolvedValue(makeSessionClient())
})

describe('GET /api/dev/session — gates', () => {
  it('404s when the opt-in flag is absent, as if the route did not exist', async () => {
    vi.stubEnv('ADMIN_DEV_SIGNIN_ENABLED', '')
    expect((await GET(request())).status).toBe(404)
  })

  it('404s in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect((await GET(request())).status).toBe(404)
  })

  it('404s on Vercel, including preview', async () => {
    vi.stubEnv('VERCEL', '1')
    expect((await GET(request())).status).toBe(404)

    vi.stubEnv('VERCEL', '')
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect((await GET(request())).status).toBe(404)
  })

  it('404s off loopback even when the flag is set, and does no work', async () => {
    const response = await GET(request('rubysrelicsstudio.vercel.app'))
    expect(response.status).toBe(404)
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled()
  })

  // ── OCT #10: the flag alone was never a gate ────────────────────────────────
  it('404s without the shared token, before any Supabase client exists', async () => {
    const response = await GET(request('localhost:3000', '', { token: null }))

    expect(response.status).toBe(404)
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled()
  })

  it('404s with a wrong token', async () => {
    const response = await GET(request('localhost:3000', '', { token: 'b'.repeat(32) }))

    expect(response.status).toBe(404)
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled()
  })

  it('404s when the Host header is not loopback (DNS rebinding)', async () => {
    const response = await GET(request('localhost:3000', '', { host: 'evil.example' }))

    expect(response.status).toBe(404)
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled()
  })

  it('404s a cross-site fetch', async () => {
    const response = await GET(request('localhost:3000', '', { fetchSite: 'cross-site' }))

    expect(response.status).toBe(404)
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled()
  })

  it('accepts a bracketed IPv6 loopback Host with the right token', async () => {
    const response = await GET(request('localhost:3000', '', { host: '[::1]:3210' }))

    expect(response.status).toBe(200)
  })

  it('reads the Host header, never `nextUrl.hostname` (source contract)', () => {
    // Comments explain the bug, so strip them before asserting.
    const source = stripComments(
      readSourceFile('src/app/api/dev/session/route.ts')
    )

    expect(source).not.toContain('nextUrl.hostname')
    expect(source).toContain("headers.get('host')")
    expect(source).toContain('x-dev-signin-token')
  })
describe('GET /api/dev/session — it cannot widen access', () => {
  it('409s with the admin:grant hint when no active admin exists', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeAdminClient({ rows: [] }))
    const response = await GET(request())
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.error).toMatch(/admin:grant/)
  })

  it('500s when the allow-list cannot be read (fails closed)', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeAdminClient({ readError: { message: 'boom' } }))
    expect((await GET(request())).status).toBe(500)
  })

  it('refuses a session with no admin claim, and says how to fix it', async () => {
    mocks.createServerSupabaseClient.mockResolvedValue(
      makeSessionClient({ claims: { sub: ADMIN_ROW.user_id, app_metadata: {} } })
    )

    const response = await GET(request())
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.error).toMatch(/app_metadata\.role/)
    expect(payload.error).toMatch(/admin:grant/)
  })

  it('refuses when the redeemed session yields no usable subject', async () => {
    // readAuthClaims drops a payload without `sub`, which is the same "not signed
    // in" shape the gates use.
    mocks.createServerSupabaseClient.mockResolvedValue(
      makeSessionClient({ claims: { app_metadata: { role: 'admin' } } })
    )
    expect((await GET(request())).status).toBe(409)
  })
})

describe('GET /api/dev/session — failure paths', () => {
  it('502s when no sign-in token can be minted', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeAdminClient({ linkError: { message: 'nope' } }))
    expect((await GET(request())).status).toBe(502)
  })

  it('502s when the token response is missing its hashed_token', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeAdminClient({ tokenHash: null }))
    expect((await GET(request())).status).toBe(502)
  })

  it('401s when the one-time token cannot be redeemed', async () => {
    mocks.createServerSupabaseClient.mockResolvedValue(
      makeSessionClient({ otpError: { message: 'expired' } })
    )
    expect((await GET(request())).status).toBe(401)
  })

  it('502s when the MFA escalation cannot reach aal2 (§10.16)', async () => {
    mocks.createServerSupabaseClient.mockResolvedValue(
      makeSessionClient({ mfaVerifyError: { message: 'bad code' } })
    )
    expect((await GET(request())).status).toBe(502)
  })
})

describe('GET /api/dev/session — success', () => {
  it('establishes the session for the allow-listed admin and leaks nothing', async () => {
    const response = await GET(request())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      ok: true,
      userId: ADMIN_ROW.user_id,
      email: ADMIN_ROW.email,
      role: 'admin',
      note: expect.stringContaining('/admin'),
    })
    expect(response.headers.get('Cache-Control')).toContain('no-store')

    const body = JSON.stringify(payload)
    expect(body).not.toMatch(/access_token|refresh_token|hashed_token|Bearer|eyJ|SERVICE_ROLE|sb_/)
  })

  it('signs in as the allow-listed account, never one the caller supplies', async () => {
    const admin = makeAdminClient()
    mocks.getSupabaseAdmin.mockReturnValue(admin)

    await GET(request('localhost:3000', '?email=attacker@evil.example'))

    expect(admin.auth.admin.generateLink).toHaveBeenCalledWith({
      type: 'magiclink',
      email: ADMIN_ROW.email,
    })
  })
})
})