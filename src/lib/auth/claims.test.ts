import { describe, expect, it } from 'vitest'

import {
  ADMIN_ROLE,
  hasAdminRole,
  hasAal2,
  readAuthClaims,
  readAuthenticatedAt,
} from '@/lib/auth/claims'

/**
 * Claim narrowing is a security boundary: everything downstream trusts its
 * output, and the one rule it enforces is that authorization data comes from
 * `app_metadata` (service-role writable) and never from `user_metadata`
 * (user-writable) — docs/archive/SEPT_IMPLEMENTATION_PLAN §10.0.
 *
 * OCT #34 added `authenticatedAt`, the `amr`-derived timestamp the admin session
 * TTL is measured from.
 */
describe('readAuthClaims', () => {
  it('reads the subject, email, aal and app_metadata', () => {
    const claims = readAuthClaims({
      sub: 'user-1',
      email: 'admin@example.com',
      iat: 1_800_000_000,
      aal: 'aal2',
      app_metadata: { role: ADMIN_ROLE, provider: 'google' },
    })

    expect(claims).toEqual({
      sub: 'user-1',
      email: 'admin@example.com',
      issuedAt: 1_800_000_000,
      aal: 'aal2',
      authenticatedAt: null,
      authenticationMethods: [],
      appMetadata: { role: ADMIN_ROLE, provider: 'google' },
    })
  })

  it('ignores user_metadata entirely', () => {
    const claims = readAuthClaims({
      sub: 'user-1',
      user_metadata: { role: ADMIN_ROLE },
    })

    expect(claims?.appMetadata).toEqual({})
    expect(hasAdminRole(claims)).toBe(false)
  })

  it('does not treat a user_metadata role as admin even when app_metadata is present', () => {
    const claims = readAuthClaims({
      sub: 'user-1',
      app_metadata: { provider: 'google' },
      user_metadata: { role: ADMIN_ROLE },
    })

    expect(hasAdminRole(claims)).toBe(false)
  })

  it('rejects payloads that are not objects', () => {
    expect(readAuthClaims(null)).toBeNull()
    expect(readAuthClaims(undefined)).toBeNull()
    expect(readAuthClaims('token')).toBeNull()
    expect(readAuthClaims(42)).toBeNull()
    expect(readAuthClaims(['sub'])).toBeNull()
  })

  it('rejects a payload without a usable subject', () => {
    expect(readAuthClaims({})).toBeNull()
    expect(readAuthClaims({ sub: '' })).toBeNull()
    expect(readAuthClaims({ sub: '   ' })).toBeNull()
    expect(readAuthClaims({ sub: 123 })).toBeNull()
  })

  it('degrades optional fields instead of throwing', () => {
    const claims = readAuthClaims({ sub: 'user-1', email: 5, iat: 'soon', app_metadata: 'nope' })

    expect(claims).toEqual({
      sub: 'user-1',
      email: null,
      issuedAt: null,
      aal: null,
      authenticatedAt: null,
      authenticationMethods: [],
      appMetadata: {},
    })
  })
})

describe('readAuthClaims — amr (OCT #34)', () => {
  it('records the methods and the newest timestamp', () => {
    const claims = readAuthClaims({
      sub: 'user-1',
      amr: [
        { method: 'oauth', timestamp: 1_800_000_000 },
        { method: 'totp', timestamp: 1_800_000_060 },
      ],
    })

    expect(claims?.authenticationMethods).toEqual(['oauth', 'totp'])
    expect(claims?.authenticatedAt).toBe(1_800_000_060)
  })

  it('measures from the totp entry when there is one, not the newest overall', () => {
    // A refreshed session can carry a later non-MFA entry; the TTL must still be
    // measured from the last time the second factor was actually completed.
    const claims = readAuthClaims({
      sub: 'user-1',
      amr: [
        { method: 'totp', timestamp: 1_800_000_000 },
        { method: 'token_refresh', timestamp: 1_800_090_000 },
      ],
    })

    expect(claims?.authenticatedAt).toBe(1_800_000_000)
  })

  it('falls back to the newest entry when no totp entry exists yet', () => {
    const claims = readAuthClaims({
      sub: 'user-1',
      amr: [{ method: 'oauth', timestamp: 1_800_000_010 }],
    })

    expect(claims?.authenticatedAt).toBe(1_800_000_010)
  })

  it('yields null rather than a guess for a missing or unusable amr', () => {
    expect(readAuthClaims({ sub: 'user-1' })?.authenticatedAt).toBeNull()
    expect(readAuthClaims({ sub: 'user-1', amr: 'totp' })?.authenticatedAt).toBeNull()
    expect(readAuthClaims({ sub: 'user-1', amr: [] })?.authenticatedAt).toBeNull()
    expect(readAuthClaims({ sub: 'user-1', amr: [null, 'x', 7] })?.authenticatedAt).toBeNull()
    // An entry without a numeric timestamp is dropped, not coerced to 0/NaN.
    expect(
      readAuthClaims({ sub: 'user-1', amr: [{ method: 'totp', timestamp: 'soon' }] })
        ?.authenticatedAt
    ).toBeNull()
    expect(
      readAuthClaims({ sub: 'user-1', amr: [{ timestamp: 1_800_000_000 }] })?.authenticatedAt
    ).toBeNull()
  })

  it('ignores entries whose timestamp is not finite', () => {
    expect(
      readAuthClaims({
        sub: 'user-1',
        amr: [
          { method: 'oauth', timestamp: Number.NaN },
          { method: 'totp', timestamp: 1_800_000_000 },
        ],
      })?.authenticatedAt
    ).toBe(1_800_000_000)
  })
})

describe('readAuthenticatedAt', () => {
  it('takes the max across totp entries', () => {
    expect(
      readAuthenticatedAt([
        { method: 'totp', timestamp: 1_700_000_000 },
        { method: 'totp', timestamp: 1_800_000_000 },
      ])
    ).toBe(1_800_000_000)
  })

  it('returns null for no entries', () => {
    expect(readAuthenticatedAt([])).toBeNull()
  })
})

describe('hasAal2', () => {
  it('accepts only an explicit aal2 claim', () => {
    expect(hasAal2(readAuthClaims({ sub: 'u', aal: 'aal2' }))).toBe(true)
    expect(hasAal2(readAuthClaims({ sub: 'u', aal: 'aal1' }))).toBe(false)
    expect(hasAal2(readAuthClaims({ sub: 'u' }))).toBe(false)
    expect(hasAal2(null)).toBe(false)
    expect(hasAal2(undefined)).toBe(false)
  })
})

describe('hasAdminRole', () => {
  it('accepts only the exact role string in app_metadata', () => {
    expect(hasAdminRole(readAuthClaims({ sub: 'u', app_metadata: { role: ADMIN_ROLE } }))).toBe(true)
  })

  it('rejects null, undefined and everything else', () => {
    expect(hasAdminRole(null)).toBe(false)
    expect(hasAdminRole(undefined)).toBe(false)
    expect(hasAdminRole(readAuthClaims({ sub: 'u' }))).toBe(false)
    expect(hasAdminRole(readAuthClaims({ sub: 'u', app_metadata: { role: 'Admin' } }))).toBe(false)
    expect(hasAdminRole(readAuthClaims({ sub: 'u', app_metadata: { role: 'admin ' } }))).toBe(false)
  })
})
