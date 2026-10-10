import { describe, expect, it, vi } from 'vitest'

import {
  assertGrantableUser,
  describeAuthUser,
  grantAdmin,
  userProviderNames,
} from '../../../scripts/lib/admin-allowlist.mjs'

/**
 * OCT #11(b): `grantAdmin()` resolves an account by email, so it must refuse the
 * shapes an attacker can pre-register — an unconfirmed address, or an account
 * with no Google identity. The guard has to run **before** any allow-list write,
 * which is what the "no upsert" assertions pin down.
 *
 * The real `.mjs` module is imported (not re-implemented), so the test exercises
 * the code the CLI actually runs.
 */

const GOOGLE_USER = {
  id: '443fb9f7-0000-4000-8000-000000000000',
  email: 'Owner@Example.com',
  created_at: '2026-09-01T10:00:00.000Z',
  email_confirmed_at: '2026-09-01T10:00:05.000Z',
  identities: [{ provider: 'google' }],
  app_metadata: { provider: 'google', providers: ['google'] },
}

/** Minimal fake of the service-role client surface `grantAdmin` touches. */
function makeClient(users: unknown[]) {
  const upsert = vi.fn(async () => ({ error: null }))
  const updateUserById = vi.fn(async () => ({ error: null }))

  const client = {
    auth: {
      admin: {
        listUsers: vi.fn(async () => ({ data: { users }, error: null })),
        updateUserById,
      },
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
      upsert,
    })),
  }

  return { client, upsert, updateUserById }
}

describe('userProviderNames', () => {
  it('reads identities, and the legacy app_metadata keys', () => {
    expect(userProviderNames(GOOGLE_USER)).toEqual(['google'])
    expect(userProviderNames({ app_metadata: { providers: ['email', 'GOOGLE'] } })).toEqual([
      'email',
      'google',
    ])
    expect(userProviderNames({})).toEqual([])
    expect(userProviderNames(null)).toEqual([])
  })
})

describe('assertGrantableUser (OCT #11(b))', () => {
  it('passes a confirmed account with a Google identity', () => {
    expect(assertGrantableUser(GOOGLE_USER)).toBe(GOOGLE_USER)
  })

  it('refuses an unconfirmed address, naming the reason', () => {
    const unconfirmed = { ...GOOGLE_USER, email_confirmed_at: undefined, confirmed_at: undefined }

    expect(() => assertGrantableUser(unconfirmed)).toThrow(/not confirmed/i)
  })

  it('accepts the legacy `confirmed_at` field as confirmation', () => {
    const legacy = { ...GOOGLE_USER, email_confirmed_at: undefined, confirmed_at: '2026-09-01T10:00:05.000Z' }

    expect(assertGrantableUser(legacy)).toBe(legacy)
  })

  it('refuses an account with no Google identity, naming the providers it saw', () => {
    const emailOnly = { ...GOOGLE_USER, identities: [{ provider: 'email' }], app_metadata: {} }

    expect(() => assertGrantableUser(emailOnly)).toThrow(/no Google identity/i)
    expect(() => assertGrantableUser(emailOnly)).toThrow(/providers: email/i)
  })

  it('refuses a missing row rather than throwing a type error', () => {
    expect(() => assertGrantableUser(null)).toThrow(/no auth\.users row/i)
    expect(() => assertGrantableUser({ email: 'x@y.z' })).toThrow(/no auth\.users row/i)
  })
})

describe('grantAdmin refuses before it writes (OCT #11(b))', () => {
  it('writes nothing for an unconfirmed account', async () => {
    const { client, upsert, updateUserById } = makeClient([
      { ...GOOGLE_USER, email_confirmed_at: undefined, confirmed_at: undefined },
    ])

    await expect(grantAdmin(client, { email: GOOGLE_USER.email })).rejects.toThrow(/not confirmed/i)
    expect(upsert).not.toHaveBeenCalled()
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('writes nothing for an account with no Google identity', async () => {
    const { client, upsert, updateUserById } = makeClient([
      { ...GOOGLE_USER, identities: [{ provider: 'email' }], app_metadata: {} },
    ])

    await expect(grantAdmin(client, { email: GOOGLE_USER.email })).rejects.toThrow(
      /no Google identity/i
    )
    expect(upsert).not.toHaveBeenCalled()
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('still grants a confirmed Google account', async () => {
    const { client, upsert, updateUserById } = makeClient([GOOGLE_USER])

    const result = await grantAdmin(client, { email: GOOGLE_USER.email })

    expect(result).toEqual({
      userId: GOOGLE_USER.id,
      email: 'owner@example.com',
      created: true,
      reactivated: false,
    })
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(updateUserById).toHaveBeenCalledWith(GOOGLE_USER.id, {
      app_metadata: { provider: 'google', providers: ['google'], role: 'admin' },
    })
  })
})

describe('describeAuthUser (OCT #11(b) confirmation prompt)', () => {
  it('shows the id, providers, created_at and confirmation state', () => {
    const summary = describeAuthUser(GOOGLE_USER)

    expect(summary).toContain(GOOGLE_USER.id)
    expect(summary).toContain('owner@example.com')
    expect(summary).toContain('providers:  google')
    expect(summary).toContain(GOOGLE_USER.created_at)
    expect(summary).toContain(GOOGLE_USER.email_confirmed_at)
    // Never a secret: this string goes to the console.
    expect(summary).not.toMatch(/eyJ|access_token|service_role/i)
  })
})
