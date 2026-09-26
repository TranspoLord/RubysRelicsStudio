import { NextResponse } from 'next/server'
import { requireAdminApiSession } from '@/lib/admin/auth'

/**
 * Retired with the custom admin-session model (SEPT_IMPLEMENTATION_PLAN §10.10).
 *
 * The actions this route exposed (`revoke_one`, `revoke_others`) were keyed off
 * the JTI inside the bespoke `rr_admin_session` token, which no longer exists
 * now that the panel authenticates with Supabase Auth. Real revocation happens
 * in the allow-list instead — `npm run admin:revoke` sets
 * `exp_admin_users.is_active = false`, and `requireAdminApiSession` re-checks
 * that row on every request, so revocation takes effect immediately rather than
 * at the next token expiry. A hard cut is available through Supabase's own
 * `auth.admin.signOut(jwt, scope)` (§10.17).
 *
 * The route still authenticates so it cannot be probed anonymously, and answers
 * `410 Gone` so a forgotten caller fails loudly instead of believing a session
 * was revoked. The file is deleted with the rest of the stack in §10.10.
 */
const RETIRED_MESSAGE = 'Session management moved to the admin allow-list.'

export async function GET(request: Request) {
  const auth = await requireAdminApiSession(request)
  if (!auth.ok) return auth.response

  return NextResponse.json({ error: RETIRED_MESSAGE, code: 'retired' }, { status: 410 })
}

export async function POST(request: Request) {
  const auth = await requireAdminApiSession(request)
  if (!auth.ok) return auth.response

  return NextResponse.json({ error: RETIRED_MESSAGE, code: 'retired' }, { status: 410 })
}
