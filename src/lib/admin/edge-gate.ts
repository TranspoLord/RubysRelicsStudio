/**
 * Edge gate for the admin panel (docs/archive/SEPT_IMPLEMENTATION_PLAN §10.5).
 *
 * The proxy (src/proxy.ts — `middleware` before Next 16) runs before the route
 * handler, so it can read a verified JWT claim but cannot query Postgres before
 * the response is committed. That makes this gate an *optimisation*: it keeps
 * non-admins out without a database round trip, while the revocation authority
 * stays in `requireAdminApiSession` / `requireAdminPageSessionOrRedirect`,
 * which re-check `exp_admin_users` on every request (§10.3).
 *
 * The decision is a pure function on purpose. A second, diverging
 * verification implementation is exactly what locked every admin out of the
 * panel on 2026-09-17 (§9.1), so this matrix is unit-tested rather than inlined
 * into the proxy file.
 */

import { hasAdminRole, type AuthClaims } from '@/lib/auth/claims'

/**
 * Paths under `/admin` that must stay reachable without an admin claim.
 *
 * - `/admin/login` — where Google sign-in starts (the key form is gone).
 * - `/admin/not-authorized` — §10.4's landing page for a signed-in non-admin.
 *   Omitting it here would bounce that page straight back to `/admin/login`
 *   and the two would loop.
 *
 * That is the whole list. Every other `/admin` or `/api/admin` path needs the
 * admin claim — including the retired `/admin/mfa-challenge`,
 * `/api/admin/session`, `/api/admin/send-mfa` and `/api/admin/verify-mfa`
 * paths, whose files were deleted by §10.8–§10.10.
 */
export const ADMIN_AUTH_EXEMPT_PATHS = [
  '/admin/login',
  '/admin/not-authorized',
] as const

export function isAdminAuthExemptPath(pathname: string): boolean {
  return (ADMIN_AUTH_EXEMPT_PATHS as readonly string[]).includes(pathname)
}

export type AdminEdgeDecision = 'allow' | 'unauthorized-api' | 'redirect-login'

/**
 * Decides what the Edge should do with an `/admin` or `/api/admin` request.
 *
 * `claims` is `null` whenever the session is absent, expired, or otherwise
 * unverifiable, so all of those cases take the same fail-closed path.
 */
export function decideAdminEdgeAccess(
  claims: AuthClaims | null | undefined,
  pathname: string
): AdminEdgeDecision {
  if (hasAdminRole(claims)) return 'allow'
  return pathname.startsWith('/api/') ? 'unauthorized-api' : 'redirect-login'
}
