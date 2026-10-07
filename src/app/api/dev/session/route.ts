import { NextResponse, type NextRequest } from 'next/server'

import { hasAal2, hasAdminRole, readAuthClaims } from '@/lib/auth/claims'
import { describeDevSigninGate, escalateToAal2, findActiveAdmin, isLoopbackHostname, type AllowListClient, type DevMfaClient } from '@/lib/dev/dev-signin'
import { safeLogError } from '@/lib/security/logger'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// Establishes a session (sets cookies), so it must never be cached.
export const dynamic = 'force-dynamic'

function json(body: unknown, status: number): NextResponse {
  const response = NextResponse.json(body, { status })
  response.headers.set('Cache-Control', 'private, no-store, max-age=0')
  return response
}

/**
 * Dev-only admin sign-in helper (§8, Batch 8).
 *
 * GET /api/dev/session → mints a Supabase session for the **already
 * allow-listed** admin and leaves it in cookies, so the visual-audit harness can
 * capture `/admin` (`UI_AUDIT.md` §15). Disabled unless three gates pass (see
 * `describeDevSigninGate`) plus a loopback host.
 *
 * How the session is obtained without a password or a real Google round trip:
 *   `auth.admin.generateLink({ type: 'magiclink' })` (service role, so no email is
 *   sent) produces a one-time `hashed_token`, which is immediately redeemed with
 *   `verifyOtp({ token_hash })` on the cookie-bound server client — the same
 *   client `src/app/auth/callback/route.ts` uses for `exchangeCodeForSession`, so
 *   the cookies are written exactly the way a real sign-in writes them. A token
 *   minted this way carries current `app_metadata`, which also sidesteps the
 *   stale-claim gotcha §10.2 records.
 *
 * It never creates a user, never grants a role, never widens access, and never
 * returns a token or secret — only a log-safe summary.
 */
export async function GET(request: NextRequest) {
  const gate = describeDevSigninGate()

  // A disabled helper is indistinguishable from a missing route, so a probe on a
  // real deployment learns nothing.
  if (!gate.allowed || !isLoopbackHostname(request.nextUrl.hostname)) {
    return json({ error: 'Not found.' }, 404)
  }

  const admin = getSupabaseAdmin()

  let adminRow
  try {
    // The cast is deliberate: Supabase's generic filter-builder chain is too deep
    // for a structural match (TS2589), so the *shape* is declared in the helper
    // and the concrete client is adapted here. The runtime contract is asserted
    // by the helper's tests.
    adminRow = await findActiveAdmin(admin as unknown as AllowListClient)
  } catch (error) {
    safeLogError('[dev-signin] allow-list read failed', error)
    return json({ error: 'Could not read the admin allow-list.' }, 500)
  }

  if (!adminRow) {
    // No account is invented here: access is granted by `npm run admin:grant`.
    return json(
      {
        error:
          'No active, un-revoked admin is on the allow-list. Run: npm run admin:grant -- <google-email>',
      },
      409
    )
  }

  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: adminRow.email })
  const tokenHash = link.data?.properties?.hashed_token
  if (link.error || !tokenHash) {
    safeLogError('[dev-signin] generateLink failed', link.error ?? 'missing hashed_token')
    return json({ error: 'Could not mint a sign-in token for the allow-listed admin.' }, 502)
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash })

  if (error) {
    safeLogError('[dev-signin] verifyOtp failed', error.message)
    return json({ error: 'Could not establish the session.' }, 401)
  }

  // `verifyOtp` returns the session, not verified claims. Read them the same way
  // every other gate does (§10.3's `requireAdminApiSession`), so this check is
  // exercising the real claim path rather than a shortcut.
  const { data: claimData } = await supabase.auth.getClaims()
  const claims = readAuthClaims(claimData?.claims)

  // The Edge gate needs `app_metadata.role === 'admin'` (§10.5). If the session
  // exists but the claim does not, the allow-list and the JWT disagree — the
  // exact state §10.2 describes, and the operator fix is a re-grant, not a retry.
  if (!claims || !hasAdminRole(claims)) {
    return json(
      {
        error:
          'Session established but the JWT has no app_metadata.role=admin claim. Re-run: npm run admin:grant -- ' +
          adminRow.email,
      },
      409
    )
  }

  // §10.16: mandatory MFA — `verifyOtp` yields an `aal1` session, but the gate
  // demands `aal2`. Enrol/complete a dedicated TOTP factor so the harness can
  // actually reach the panel once the gate is live.
  if (!hasAal2(claims)) {
    // `supabase.auth.mfa`'s concrete type is deeper than the structural
    // `DevMfaClient` the escalator needs (TS2589-style instantiation), so adapt
    // here; the runtime contract is covered by the escalator's own tests.
    const escalated = await escalateToAal2(supabase.auth.mfa as unknown as DevMfaClient)
    if (!escalated) {
      safeLogError('[dev-signin] aal2 escalation failed', 'escalateToAal2 returned false')
      return json({ error: 'Could not complete the MFA challenge for the harness.' }, 502)
    }
  }

  return json(
    {
      ok: true,
      userId: claims.sub,
      email: claims.email ?? adminRow.email,
      role: 'admin',
      note: 'Session cookies set. Navigate to /admin/* in this browser profile.',
    },
    200
  )
}