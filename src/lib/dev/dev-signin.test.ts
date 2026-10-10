import { describe, expect, it, vi } from 'vitest'

import {
  DEV_SIGNIN_ALLOW_HOSTED_ENV,
  DEV_SIGNIN_FLAG,
  DEV_SIGNIN_TOKEN_ENV,
  DEV_SIGNIN_TOKEN_MIN_LENGTH,
  DEV_MFA_FRIENDLY_PREFIX,
  describeDevSigninGate,
  escalateToAal2,
  findActiveAdmin,
  isAllowedSupabaseHost,
  isDevSigninEnabled,
  isLoopbackHostHeader,
  isLoopbackHostname,
  isValidDevSigninToken,
} from '@/lib/dev/dev-signin'

/**
 * The helper mints admin sessions, so its guards are the most security-sensitive
 * code in this batch. Each gate is asserted independently, and the "all of them
 * must pass" property is asserted as a matrix — a config that only looks safe
 * (e.g. a preview deploy with the flag set) must still be refused.
 *
 * OCT #10: the flag, a ≥ 32-character token and a local (or explicitly allowed)
 * Supabase project are all required, because `next dev` binds every interface.
 */

const SAFE_TOKEN = 'a'.repeat(DEV_SIGNIN_TOKEN_MIN_LENGTH)

const SAFE_ENV = {
  NODE_ENV: 'development',
  [DEV_SIGNIN_FLAG]: 'true',
  [DEV_SIGNIN_TOKEN_ENV]: SAFE_TOKEN,
  [DEV_SIGNIN_ALLOW_HOSTED_ENV]: 'true',
}

describe('describeDevSigninGate', () => {
  it('allows only a local run that opted in explicitly', () => {
    expect(describeDevSigninGate(SAFE_ENV)).toEqual({
      allowed: true,
      reason: 'dev environment with the opt-in flag set',
    })
    expect(isDevSigninEnabled(SAFE_ENV)).toBe(true)
  })

  it('accepts a local Supabase project without the hosted override', () => {
    const decision = describeDevSigninGate({
      ...SAFE_ENV,
      [DEV_SIGNIN_ALLOW_HOSTED_ENV]: undefined,
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    })
    expect(decision.allowed).toBe(true)
  })

  it('refuses everything else, with a reason that names the cause', () => {
    const cases: Array<[Record<string, string | undefined>, string]> = [
      [{ ...SAFE_ENV, NODE_ENV: 'production' }, 'NODE_ENV is production'],
      [{ ...SAFE_ENV, VERCEL: '1' }, 'running on Vercel'],
      // Preview deployments are public; the flag must not enable this there.
      [{ ...SAFE_ENV, VERCEL: undefined, VERCEL_ENV: 'preview' }, 'running on Vercel'],
      [{ NODE_ENV: 'development' }, `${DEV_SIGNIN_FLAG} is not 'true'`],
      [{ NODE_ENV: 'development', [DEV_SIGNIN_FLAG]: '1' }, `${DEV_SIGNIN_FLAG} is not 'true'`],
      [{ NODE_ENV: 'development', [DEV_SIGNIN_FLAG]: 'TRUE' }, `${DEV_SIGNIN_FLAG} is not 'true'`],
      [{}, `${DEV_SIGNIN_FLAG} is not 'true'`],
      // OCT #10: the flag is not enough — a LAN peer needs the token too.
      [
        { ...SAFE_ENV, [DEV_SIGNIN_TOKEN_ENV]: undefined },
        `${DEV_SIGNIN_TOKEN_ENV} must be at least ${DEV_SIGNIN_TOKEN_MIN_LENGTH} characters`,
      ],
      [
        { ...SAFE_ENV, [DEV_SIGNIN_TOKEN_ENV]: 'too-short' },
        `${DEV_SIGNIN_TOKEN_ENV} must be at least ${DEV_SIGNIN_TOKEN_MIN_LENGTH} characters`,
      ],
      // …and a hosted project needs the second, explicit opt-in.
      [
        {
          ...SAFE_ENV,
          [DEV_SIGNIN_ALLOW_HOSTED_ENV]: undefined,
          NEXT_PUBLIC_SUPABASE_URL: 'https://cvkhrpejzsnzsjffrvnr.supabase.co',
        },
        `NEXT_PUBLIC_SUPABASE_URL is not local (set ${DEV_SIGNIN_ALLOW_HOSTED_ENV}=true to override)`,
      ],
    ]

    for (const [env, reason] of cases) {
      const decision = describeDevSigninGate(env)
      expect(decision.allowed, JSON.stringify(env)).toBe(false)
      expect(decision.reason).toBe(reason)
      expect(isDevSigninEnabled(env)).toBe(false)
    }
  })

  it('checks production before the flag, so a prod box cannot opt itself in', () => {
    const decision = describeDevSigninGate({
      NODE_ENV: 'production',
      VERCEL: '1',
      [DEV_SIGNIN_FLAG]: 'true',
    })
    expect(decision).toEqual({ allowed: false, reason: 'NODE_ENV is production' })
  })
})

describe('isLoopbackHostHeader (OCT #10)', () => {
  it('accepts the harness origins from the raw Host header', () => {
    for (const host of ['localhost', 'localhost:3210', '127.0.0.1', '127.0.0.1:3210', '[::1]:3210', '[::1]']) {
      expect(isLoopbackHostHeader(host), host).toBe(true)
    }
  })

  it('refuses a LAN address, a DNS-rebinding name and an unbracketed IPv6', () => {
    for (const host of [
      'evil.example',
      'rubysrelicsstudio.vercel.app',
      'localhost.evil.com',
      '127.0.0.1.evil.com',
      '192.168.1.20:3000',
      '10.0.0.2',
      '::1',
      '[::1',
      '',
      null,
      undefined,
    ]) {
      expect(isLoopbackHostHeader(host), String(host)).toBe(false)
    }
  })
})

describe('isValidDevSigninToken (OCT #10)', () => {
  it('accepts only an exact match', () => {
    expect(isValidDevSigninToken(SAFE_TOKEN, SAFE_TOKEN)).toBe(true)
    expect(isValidDevSigninToken('b'.repeat(32), SAFE_TOKEN)).toBe(false)
    expect(isValidDevSigninToken('short', SAFE_TOKEN)).toBe(false)
    expect(isValidDevSigninToken(SAFE_TOKEN, undefined)).toBe(false)
    expect(isValidDevSigninToken(null, SAFE_TOKEN)).toBe(false)
  })
})

describe('isAllowedSupabaseHost (OCT #10)', () => {
  it('allows local projects, and anything with the explicit override', () => {
    expect(isAllowedSupabaseHost('http://127.0.0.1:54321', undefined)).toBe(true)
    expect(isAllowedSupabaseHost('http://localhost:54321', undefined)).toBe(true)
    expect(isAllowedSupabaseHost('https://db.example.supabase.co', 'true')).toBe(true)
  })

  it('refuses a hosted project without the override, and an unusable URL', () => {
    expect(isAllowedSupabaseHost('https://db.example.supabase.co', undefined)).toBe(false)
    expect(isAllowedSupabaseHost('https://db.example.supabase.co', 'false')).toBe(false)
    expect(isAllowedSupabaseHost(undefined, undefined)).toBe(false)
    expect(isAllowedSupabaseHost('not-a-url', undefined)).toBe(false)
  })
})

describe('isLoopbackHostname', () => {
  it('accepts the harness origins', () => {
    for (const host of ['localhost', 'localhost:3210', '127.0.0.1', '127.0.0.1:3210', '[::1]', '::1']) {
      expect(isLoopbackHostname(host), host).toBe(true)
    }
  })

  it('refuses any other host, including near-misses', () => {
    for (const host of [
      'rubysrelicsstudio.vercel.app',
      'example.com',
      'localhost.evil.com',   // not a loopback name
      '127.0.0.1.evil.com',
      '10.0.0.2',
      '',
      null,
      undefined,
    ]) {
      expect(isLoopbackHostname(host), String(host)).toBe(false)
    }
  })
})

/** Minimal fake of the Supabase table chain `findActiveAdmin` uses. */
function makeAllowListClient(rows: unknown[] | null, error: { message: string } | null = null) {
  const calls: Array<[string, unknown]> = []
  const chain = {
    eq(column: string, value: unknown) {
      calls.push([column, value])
      return this
    },
    is(column: string, value: unknown) {
      calls.push([column, value])
      return this
    },
    limit: async (count: number) => {
      calls.push(['limit', count])
      return { data: rows, error }
    },
  }
  return {
    client: {
      from(table: string) {
        calls.push(['from', table])
        return { select: () => chain }
      },
    },
    calls,
  }
}

describe('findActiveAdmin', () => {
  it('returns the first active, un-revoked admin', async () => {
    const { client, calls } = makeAllowListClient([
      { user_id: '443fb9f7-0000-4000-8000-000000000000', email: 'owner@example.com' },
    ])

    await expect(findActiveAdmin(client)).resolves.toEqual({
      userId: '443fb9f7-0000-4000-8000-000000000000',
      email: 'owner@example.com',
    })

    // It must filter on both revocation columns, not just `is_active`.
    expect(calls).toContainEqual(['is_active', true])
    expect(calls).toContainEqual(['revoked_at', null])
    expect(calls).toContainEqual(['from', 'exp_admin_users'])
  })

  it('returns null for an empty or revoked-only allow-list', async () => {
    await expect(findActiveAdmin(makeAllowListClient([]).client)).resolves.toBeNull()
    await expect(findActiveAdmin(makeAllowListClient(null).client)).resolves.toBeNull()
  })

  it('returns null when the row is missing the fields it needs', async () => {
    await expect(findActiveAdmin(makeAllowListClient([{ email: 'x@y.z' }]).client)).resolves.toBeNull()
  })

  it('throws on a database error so the route can fail closed', async () => {
    await expect(
      findActiveAdmin(makeAllowListClient(null, { message: 'boom' }).client)
    ).rejects.toThrow(/allow-list read failed/i)
  })
})

const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' // base32 of "12345678901234567890"

describe('escalateToAal2 (§10.16, OCT #10)', () => {
  function makeMfa(
    plan: {
      currentLevel?: string
      factors?: Array<{ id: string; friendly_name?: string }>
      enrollError?: { message: string } | null
      verifyError?: { message: string } | null
    } = {}
  ) {
    const calls: string[] = []
    const mfa = {
      getAuthenticatorAssuranceLevel: vi.fn(async () => ({
        data: { currentLevel: plan.currentLevel ?? 'aal1' },
      })),
      listFactors: vi.fn(async () => ({ data: { all: plan.factors ?? [] } })),
      enroll: vi.fn(async (opts: { factorType: string; friendlyName?: string }) => {
        calls.push(`enroll:${opts.friendlyName ?? ''}`)
        return {
          data: { id: 'factor-new', totp: { secret: RFC_SECRET } },
          error: plan.enrollError ?? null,
        }
      }),
      challenge: vi.fn(async () => {
        calls.push('challenge')
        return { data: { id: 'challenge-1' } }
      }),
      verify: vi.fn(async () => {
        calls.push('verify')
        return { error: plan.verifyError ?? null }
      }),
      unenroll: vi.fn(async (opts: { factorId: string }) => {
        calls.push(`unenroll:${opts.factorId}`)
        return { error: null }
      }),
    }
    return { mfa, calls }
  }

  it('returns true immediately when already at aal2', async () => {
    const { mfa, calls } = makeMfa({ currentLevel: 'aal2' })
    expect(await escalateToAal2(mfa, () => null, () => {})).toBe(true)
    expect(calls).toEqual([])
  })

  it('enrols a fresh named factor, remembers only its id, and verifies a code', async () => {
    const { mfa, calls } = makeMfa()
    const written: string[] = []

    expect(await escalateToAal2(mfa, () => null, (id) => written.push(id))).toBe(true)

    // OCT #10: only the factor id is remembered — never the secret.
    expect(written).toEqual(['factor-new'])
    expect(calls[0]).toMatch(new RegExp(`^enroll:${DEV_MFA_FRIENDLY_PREFIX}-`))
    expect(calls).toContain('challenge')
    expect(calls).toContain('verify')
  })

  it('unenrolls what a previous run left behind before enrolling again', async () => {
    const { mfa, calls } = makeMfa({
      factors: [
        { id: 'factor-stale', friendly_name: `${DEV_MFA_FRIENDLY_PREFIX}-1700000000000` },
        { id: 'factor-owner', friendly_name: 'Ada authenticator' },
      ],
    })

    expect(await escalateToAal2(mfa, () => 'factor-old', () => {})).toBe(true)

    expect(calls).toContain('unenroll:factor-old')
    expect(calls).toContain('unenroll:factor-stale')
    // The owner's own authenticator is never touched.
    expect(calls).not.toContain('unenroll:factor-owner')
  })

  it('returns false when verification fails', async () => {
    const { mfa } = makeMfa({ verifyError: { message: 'bad code' } })
    expect(await escalateToAal2(mfa, () => null, () => {})).toBe(false)
  })

  it('returns false when the factor cannot be enrolled', async () => {
    const { mfa } = makeMfa({ enrollError: { message: 'limit reached' } })
    expect(await escalateToAal2(mfa, () => null, () => {})).toBe(false)
  })
})