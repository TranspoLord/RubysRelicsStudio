import { describe, expect, it } from 'vitest'

import { readSourceFile, stripComments } from '@/lib/testing/source-contract'

/**
 * OCT #34: the Settings page advertised `admin_session.ttl_hours` ("Controls how
 * long an admin login remains valid before re-authentication is required") while
 * **nothing read it** — `getAdminSessionSettings` had zero callers, so a session
 * lasted until sign-out no matter what the owner configured.
 *
 * This contract keeps the setting wired to the gate. It is a source check on
 * purpose: `tsc` cannot see a value that is read but never enforced, which is
 * exactly how the dead control survived.
 */
const auth = stripComments(readSourceFile('src/lib/admin/auth.ts'))
const claims = stripComments(readSourceFile('src/lib/auth/claims.ts'))
const loginView = stripComments(readSourceFile('src/components/admin/AdminLoginView.tsx'))
const loginPage = stripComments(readSourceFile('src/app/admin/login/page.tsx'))

describe('admin session TTL is enforced (OCT #34)', () => {
  it('the gate reads the configured TTL', () => {
    expect(auth).toContain('getAdminSessionSettings(')
    expect(auth).toContain('isAdminSessionFresh(')
  })

  it('the API gate answers 401 with a machine-readable code', () => {
    expect(auth).toContain('admin_session_expired')
    expect(auth).toContain('Admin session expired. Sign in again.')
  })

  it('the page gate redirects to login with reason=expired', () => {
    expect(auth).toMatch(/\/admin\/login\?reason=expired&next=/)
  })

  it('the TTL is measured from amr, not from the token issue time', () => {
    expect(claims).toContain('authenticatedAt')
    expect(claims).toContain('readAuthenticatedAt(')
    // `iat` moves on every refresh, so it must not be what the TTL measures.
    expect(auth).not.toMatch(/issuedAt\s*[<>]/)
  })

  it('the login view signs the stale session out before offering Google again', () => {
    expect(loginView).toContain('sessionExpiredNotice')
    expect(loginView).toMatch(/signOut\(\)/)
    expect(loginPage).toContain("reason === 'expired'")
  })
})

describe('the contract bites (planted offences)', () => {
  it('flags a gate that never reads the TTL setting', () => {
    const planted = stripComments(`
      import { hasAdminRole } from '@/lib/auth/claims'
      export async function requireAdminApiSession() {
        return { ok: true }
      }
    `)

    expect(planted).not.toContain('getAdminSessionSettings(')
    expect(planted).not.toContain('admin_session_expired')
  })

  it('does not count a TTL read that only appears in a comment', () => {
    const planted = stripComments(`
      // getAdminSessionSettings() should be enforced here
      export const placeholder = true
    `)

    expect(planted).not.toContain('getAdminSessionSettings(')
  })
})
