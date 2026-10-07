import { describe, expect, it, vi } from 'vitest'

import {
  DEV_SIGNIN_FLAG,
  describeDevSigninGate,
  escalateToAal2,
  findActiveAdmin,
  isDevSigninEnabled,
  isLoopbackHostname,
  type DevMfaFactor,
} from '@/lib/dev/dev-signin'

/**
 * The helper mints admin sessions, so its guards are the most security-sensitive
 * code in this batch. Each gate is asserted independently, and the "all three
 * must pass" property is asserted as a matrix — a config that only looks safe
 * (e.g. a preview deploy with the flag set) must still be refused.
 */

const SAFE_ENV = { NODE_ENV: 'development', [DEV_SIGNIN_FLAG]: 'true' }

describe('describeDevSigninGate', () => {
  it('allows only a local run that opted in explicitly', () => {
    expect(describeDevSigninGate(SAFE_ENV)).toEqual({
      allowed: true,
      reason: 'dev environment with the opt-in flag set',
    })
    expect(isDevSigninEnabled(SAFE_ENV)).toBe(true)
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

describe('escalateToAal2 (§10.16)', () => {
  function makeMfa(
    plan: {
      currentLevel?: string
      factors?: Array<{ id: string }>
      enrollError?: { message: string } | null
      verifyError?: { message: string } | null
    } = {}
  ) {
    const calls: string[] = []
    const mfa = {
      getAuthenticatorAssuranceLevel: vi.fn(async () => ({
        data: { currentLevel: plan.currentLevel ?? 'aal1' },
      })),
      listFactors: vi.fn(async () => ({ data: { totp: plan.factors ?? [] } })),
      enroll: vi.fn(async () => {
        calls.push('enroll')
        return { data: { id: 'factor-1', totp: { secret: RFC_SECRET } }, error: plan.enrollError ?? null }
      }),
      challenge: vi.fn(async () => {
        calls.push('challenge')
        return { data: { id: 'challenge-1' } }
      }),
      verify: vi.fn(async () => {
        calls.push('verify')
        return { error: plan.verifyError ?? null }
      }),
    }
    return { mfa, calls }
  }

  it('returns true immediately when already at aal2', async () => {
    const { mfa, calls } = makeMfa({ currentLevel: 'aal2' })
    expect(await escalateToAal2(mfa, () => null, () => {})).toBe(true)
    expect(calls).toEqual([])
  })

  it('enrols a fresh factor, persists it, and verifies a generated code', async () => {
    const { mfa, calls } = makeMfa()
    let persisted: DevMfaFactor | null = null

    expect(await escalateToAal2(mfa, () => null, (factor) => (persisted = factor))).toBe(true)
    expect(calls).toEqual(['enroll', 'challenge', 'verify'])
    expect(persisted).toEqual({ factorId: 'factor-1', secret: RFC_SECRET })
  })

  it('reuses a persisted factor without re-enrolling', async () => {
    const factor: DevMfaFactor = { factorId: 'factor-1', secret: RFC_SECRET }
    const { mfa, calls } = makeMfa({ factors: [{ id: 'factor-1' }] })

    expect(await escalateToAal2(mfa, () => factor, () => {})).toBe(true)
    expect(calls).toEqual(['challenge', 'verify'])
  })

  it('returns false when verification fails', async () => {
    const { mfa } = makeMfa({ verifyError: { message: 'bad code' } })
    expect(await escalateToAal2(mfa, () => null, () => {})).toBe(false)
  })
})