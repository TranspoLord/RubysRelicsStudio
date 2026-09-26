import { describe, expect, it } from 'vitest'

import { ADMIN_ROLE, readAuthClaims } from '@/lib/auth/claims'
import {
  ADMIN_AUTH_EXEMPT_PATHS,
  decideAdminEdgeAccess,
  isAdminAuthExemptPath,
} from '@/lib/admin/edge-gate'

/**
 * The Edge gate is the piece that decides the panel's fate on every request,
 * and it runs where a database check is impossible. It is a pure function so
 * this matrix can exist — the 2026-09-17 outage (UI_AUDIT.md §15.10) came from a
 * *second* verification implementation that was never cross-checked.
 */
function claims(appMetadata: Record<string, unknown>): ReturnType<typeof readAuthClaims> {
  return readAuthClaims({
    sub: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    email: 'admin@example.com',
    iat: 1_800_000_000,
    app_metadata: appMetadata,
  })
}

describe('decideAdminEdgeAccess', () => {
  it('allows a session whose app_metadata carries the admin role', () => {
    expect(decideAdminEdgeAccess(claims({ role: ADMIN_ROLE }), '/admin')).toBe('allow')
    expect(decideAdminEdgeAccess(claims({ role: ADMIN_ROLE }), '/api/admin/orders')).toBe('allow')
    expect(decideAdminEdgeAccess(claims({ role: ADMIN_ROLE, provider: 'google' }), '/admin')).toBe(
      'allow'
    )
  })

  it('denies an absent session — the fail-closed default', () => {
    expect(decideAdminEdgeAccess(null, '/admin')).toBe('redirect-login')
    expect(decideAdminEdgeAccess(undefined, '/api/admin/orders')).toBe('unauthorized-api')
  })

  it('denies claims that carry no usable subject', () => {
    // getClaims() returns no claims for an expired or forged JWT, and
    // readAuthClaims() drops a payload without `sub`, so the two are
    // deliberately indistinguishable here.
    expect(readAuthClaims({ app_metadata: { role: ADMIN_ROLE } })).toBeNull()
    expect(readAuthClaims({ sub: '   ', app_metadata: { role: ADMIN_ROLE } })).toBeNull()
    expect(decideAdminEdgeAccess(null, '/admin')).toBe('redirect-login')
  })

  it('denies a signed-in non-admin, whatever the shape of the claim', () => {
    expect(decideAdminEdgeAccess(claims({}), '/admin')).toBe('redirect-login')
    expect(decideAdminEdgeAccess(claims({ role: 'customer' }), '/admin')).toBe('redirect-login')
    expect(decideAdminEdgeAccess(claims({ role: 'Admin' }), '/admin')).toBe('redirect-login')
    expect(decideAdminEdgeAccess(claims({ role: true }), '/admin')).toBe('redirect-login')
    expect(decideAdminEdgeAccess(claims({ roles: [ADMIN_ROLE] }), '/admin')).toBe('redirect-login')
  })

  it('answers APIs with 401 and pages with a redirect', () => {
    expect(decideAdminEdgeAccess(null, '/api/admin/homepage/sections')).toBe('unauthorized-api')
    expect(decideAdminEdgeAccess(null, '/api/admin/catalog/products')).toBe('unauthorized-api')
    expect(decideAdminEdgeAccess(null, '/admin/homepage')).toBe('redirect-login')
    expect(decideAdminEdgeAccess(null, '/admin')).toBe('redirect-login')
  })
})

describe('ADMIN_AUTH_EXEMPT_PATHS', () => {
  it('keeps the sign-in and not-authorized pages reachable', () => {
    expect(isAdminAuthExemptPath('/admin/login')).toBe(true)
    // Without this one the gate would bounce /admin/not-authorized back to
    // /admin/login and a signed-in non-admin would loop forever.
    expect(isAdminAuthExemptPath('/admin/not-authorized')).toBe(true)
    expect(ADMIN_AUTH_EXEMPT_PATHS).toHaveLength(2)
  })

  it('no longer exempts the retired key, MFA and custom-session paths', () => {
    expect(isAdminAuthExemptPath('/api/admin/session')).toBe(false)
    expect(isAdminAuthExemptPath('/admin/mfa-challenge')).toBe(false)
    expect(isAdminAuthExemptPath('/api/admin/send-mfa')).toBe(false)
    expect(isAdminAuthExemptPath('/api/admin/verify-mfa')).toBe(false)
  })

  it('does not exempt the panel itself, or near-miss paths', () => {
    expect(isAdminAuthExemptPath('/admin')).toBe(false)
    expect(isAdminAuthExemptPath('/admin/homepage')).toBe(false)
    expect(isAdminAuthExemptPath('/admin/login/extra')).toBe(false)
    expect(isAdminAuthExemptPath('/api/admin/orders')).toBe(false)
  })
})
