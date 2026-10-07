/**
 * Admin authorization gates (SEPT_IMPLEMENTATION_PLAN §10.3 / §10.4).
 *
 * Replaces the shared-key + emailed-MFA model. An account may act as an admin
 * only when both gates agree:
 *
 *   1. the verified Supabase JWT carries `app_metadata.role === 'admin'`
 *   2. the `exp_admin_users` row is active and not revoked (§10.1)
 *
 * The row is the **revocation authority**: a JWT stays valid until it expires,
 * so a claim-only check would let a revoked admin keep working for up to the
 * access-token lifetime. This is the same split the Edge gate documents
 * (`src/lib/admin/edge-gate.ts`) — Edge reads the claim, Node re-checks the DB.
 *
 * Fails closed at every step, including on database errors.
 */

import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'

import { hasAdminRole, hasAal2, readAuthClaims, type AuthClaims } from '@/lib/auth/claims'
import { sanitizeAdminNextPath } from '@/lib/auth/redirect'
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { requireCsrf } from '@/lib/security/csrf'
import { safeLogError } from '@/lib/security/logger'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/** Allow-list table created by migration `066`. */
const ADMIN_ALLOWLIST_TABLE = 'exp_admin_users'

export interface AdminApiContext {
  /** `auth.users.id` of the acting admin — the audit trail's actor (§10.7). */
  actorUserId: string
  /** Display copy; the allow-list row's email is the record. */
  actorEmail: string | null
  clientIp: string
}

interface AdminRateLimitOptions {
  key: string
  maxRequests: number
  windowMs: number
}

interface AdminAllowListRow {
  user_id: string
  email: string
  is_active: boolean
  revoked_at: string | null
  last_login_at: string | null
}

function unauthorizedResponse(): Response {
  return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 })
}

/** §10.16 — a signed-in admin who has not completed the MFA challenge. */
function mfaRequiredResponse(): Response {
  return NextResponse.json({ error: 'MFA required.', code: 'mfa_required' }, { status: 401 })
}

/**
 * Reads and verifies the Supabase session for this request.
 * Returns `null` for an absent, expired or forged session — all of which are
 * treated identically by the callers.
 */
async function readVerifiedClaims(): Promise<AuthClaims | null> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error) return null
  return readAuthClaims(data?.claims)
}

/**
 * Reads the allow-list row with the service role (`exp_admin_users` has RLS
 * enabled and no policies, so the cookie-bound client cannot read it).
 * Throws when the database cannot answer — callers fail closed.
 */
async function loadAllowListRow(userId: string): Promise<AdminAllowListRow | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from(ADMIN_ALLOWLIST_TABLE)
    .select('user_id, email, is_active, revoked_at, last_login_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(`Allow-list read failed: ${error.message}`)
  }

  return (data as AdminAllowListRow | null) ?? null
}

/** A row only grants access while it is active and not revoked. */
function isActiveAdminRow(row: AdminAllowListRow | null): row is AdminAllowListRow {
  if (!row) return false
  if (!row.is_active) return false
  if (row.revoked_at) return false
  return true
}

/**
 * §10.1's `last_login_at`, stamped once per sign-in: the page gate already has
 * the row in hand, and a JWT whose `iat` is newer than the stored timestamp
 * means this request is carrying a freshly minted token. Best-effort — a write
 * failure must never block the panel.
 */
function stampLastLoginIfNewSignIn(claims: AuthClaims, row: AdminAllowListRow): void {
  if (!claims.issuedAt) return

  const previous = row.last_login_at ? new Date(row.last_login_at).getTime() : 0
  if (claims.issuedAt * 1000 <= previous) return

  void (async () => {
    try {
      const supabase = getSupabaseAdmin()
      const { error } = await supabase
        .from(ADMIN_ALLOWLIST_TABLE)
        .update({ last_login_at: new Date().toISOString() })
        .eq('user_id', claims.sub)

      if (error) throw new Error(error.message)
    } catch (error) {
      safeLogError('[admin:auth] last_login_at update failed', error)
    }
  })()
}

// The shared-key helpers (`extractAdminSessionToken`, `getExpectedAdminKey`,
// `hasValidAdminKey`) lived here until §10.8/§10.10 deleted the key + MFA routes
// that were their only consumers. Admin authorization is now entirely
// `readVerifiedClaims()` + `loadAllowListRow()` above — there is no shared
// secret left in the request path.


/**
 * Route-handler / server-action gate (§10.3).
 *
 * Order is deliberate: CSRF first (unchanged model), then the identity claim,
 * then the allow-list row, then the rate limit. Fails closed on every failure,
 * including a database error during the allow-list read.
 */
export async function requireAdminApiSession(
  request: Request,
  rateLimitOptions?: AdminRateLimitOptions
): Promise<{ ok: true; context: AdminApiContext } | { ok: false; response: Response }> {
  try {
    // Enforce full CSRF checks for all state-changing admin requests.
    if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS') {
      const csrfResponse = requireCsrf(request)
      if (csrfResponse) {
        return {
          ok: false,
          response: csrfResponse,
        }
      }
    }

    const claims = await readVerifiedClaims()
    if (!claims || !hasAdminRole(claims)) {
      return { ok: false, response: unauthorizedResponse() }
    }

    // Revocation authority: a valid JWT is not enough — a revoked or
    // deactivated admin keeps a working token until it expires.
    const row = await loadAllowListRow(claims.sub)
    if (!isActiveAdminRow(row)) {
      safeLogError('[admin:auth] allow-list rejected', `user=${claims.sub}`)
      return { ok: false, response: unauthorizedResponse() }
    }

    // §10.16: mandatory second factor. `aal1` = signed in with Google but the
    // MFA challenge was not completed, so the request is refused at the door.
    if (!hasAal2(claims)) {
      return { ok: false, response: mfaRequiredResponse() }
    }

    const clientIp = getClientIp(request)

    if (rateLimitOptions) {
      const result = await rateLimit(
        `${rateLimitOptions.key}:${clientIp}`,
        rateLimitOptions.maxRequests,
        rateLimitOptions.windowMs
      )

      if (!result.allowed) {
        return {
          ok: false,
          response: rateLimitResponse(result.retryAfter ?? 60),
        }
      }
    }

    return {
      ok: true,
      context: {
        actorUserId: claims.sub,
        actorEmail: row.email ?? claims.email,
        clientIp,
      },
    }
  } catch (error) {
    safeLogError('[admin:auth]', error)
    return {
      ok: false,
      response: NextResponse.json({ error: 'Admin authorization check failed.' }, { status: 500 }),
    }
  }
}

/**
 * Server-component gate for the panel (§10.4).
 *
 * - no session → `/admin/login?next=…` (sanitized to `/admin/**`)
 * - session without the admin claim, without an allow-list row, or with a
 *   deactivated/revoked row → `/admin/not-authorized`
 *
 * A signed-in non-admin therefore never bounces between `/admin` and
 * `/admin/login`: the two outcomes are distinct pages, and
 * `/admin/not-authorized` is exempt from the Edge gate so it can actually be
 * rendered (see `ADMIN_AUTH_EXEMPT_PATHS`).
 */
export async function requireAdminPageSessionOrRedirect(nextPath = '/admin') {
  const target = sanitizeAdminNextPath(nextPath)
  const claims = await readVerifiedClaims()

  if (!claims) {
    redirect(`/admin/login?next=${encodeURIComponent(target)}`)
  }

  let row: AdminAllowListRow | null = null
  try {
    row = await loadAllowListRow(claims.sub)
  } catch (error) {
    // Fail closed: a database outage must never grant access.
    safeLogError('[admin:auth:page] allow-list read failed', error)
    redirect('/admin/not-authorized')
  }

  if (!hasAdminRole(claims) || !isActiveAdminRow(row)) {
    redirect('/admin/not-authorized')
  }

  // §10.16: mandatory second factor — an admin at `aal1` has signed in but not
  // completed the MFA challenge, so the panel redirects to the challenge page.
  if (!hasAal2(claims)) {
    redirect('/admin/mfa')
  }

  stampLastLoginIfNewSignIn(claims, row)

  return {
    actorUserId: claims.sub,
    actorEmail: row.email ?? claims.email,
  }
}

/**
 * §10.16 — server-component gate for `/admin/mfa` itself.
 *
 * This is `requireAdminPageSessionOrRedirect` *without* the AAL check: the MFA
 * page is the path *to* `aal2`, so an admin at `aal1` must be able to reach it.
 * The role and allow-list checks still apply, so a non-admin never sees the
 * challenge page (and an admin without a session goes to `/admin/login`).
 */
export async function requireAdminPageMfaSessionOrRedirect() {
  const claims = await readVerifiedClaims()

  if (!claims) {
    redirect('/admin/login')
  }

  let row: AdminAllowListRow | null = null
  try {
    row = await loadAllowListRow(claims.sub)
  } catch (error) {
    safeLogError('[admin:auth:mfa] allow-list read failed', error)
    redirect('/admin/not-authorized')
  }

  if (!hasAdminRole(claims) || !isActiveAdminRow(row)) {
    redirect('/admin/not-authorized')
  }

  return {
    actorUserId: claims.sub,
    actorEmail: row.email ?? claims.email,
  }
}
