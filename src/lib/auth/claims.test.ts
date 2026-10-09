import { describe, expect, it } from 'vitest'

import { ADMIN_ROLE, hasAdminRole, hasAal2, readAuthClaims } from '@/lib/auth/claims'

/**
 * Claim narrowing is a security boundary: everything downstream trusts its
 * output, and the one rule it enforces is that authorization data comes from
 * `app_metadata` (service-role writable) and never from `user_metadata`
 * (user-writable) — docs/archive/SEPT_IMPLEMENTATION_PLAN §10.0.
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
      appMetadata: {},
    })
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
