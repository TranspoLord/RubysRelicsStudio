import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

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

/** Fake cookie-bound client: `verifyOtp` then `getClaims`. */
function makeSessionClient(
  plan: { otpError?: { message: string } | null; claims?: unknown } = {}
) {
  return {
    auth: {
      verifyOtp: vi.fn(async () => ({
        data: { user: { id: ADMIN_ROW.user_id }, session: { access_token: 'never-returned' } },
        error: plan.otpError ?? null,
      })),
      getClaims: vi.fn(async () => ({ data: { claims: plan.claims ?? ADMIN_CLAIMS }, error: null })),
    },
  }
}

function request(host = 'localhost:3000', query = '') {
  return new NextRequest(`http://${host}/api/dev/session${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv('NODE_ENV', 'development')
  vi.stubEnv('ADMIN_DEV_SIGNIN_ENABLED', 'true')
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