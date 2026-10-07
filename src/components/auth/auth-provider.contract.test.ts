import { describe, expect, it } from 'vitest'

import { readSourceFile, stripComments } from '@/lib/testing/source-contract'

/**
 * §10.17 — "sign out everywhere except this device". No DOM harness (OCT-5), so
 * this pins the contract at the source level: the auth context must expose a
 * `signOutOthers` that calls Supabase's `signOut({ scope: 'others' })`, and the
 * panel shell must wire a visible action to it (so the capability is reachable).
 */

const PROVIDER = stripComments(readSourceFile('src/components/auth/AuthProvider.tsx'))
const SHELL = stripComments(readSourceFile('src/components/admin/AdminShell.tsx'))

describe('sign-out-others contract (§10.17)', () => {
  it('exposes signOutOthers backed by scope:others revocation', () => {
    expect(PROVIDER).toMatch(/signOutOthers: \(\) => Promise<void>/)
    expect(PROVIDER).toContain("signOut({ scope: 'others' })")
    // Exposed on the context value, not just declared.
    expect(PROVIDER).toContain('signOutOthers,')
  })

  it('wires a reachable action in the admin shell', () => {
    expect(SHELL).toContain('signOutOthers')
    expect(SHELL).toContain('Sign out other sessions')
  })
})