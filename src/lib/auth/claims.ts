/**
 * Supabase JWT claim helpers.
 *
 * `getClaims()` hands back a decoded payload whose *shape* we do not control, so
 * every identity decision in the app goes through `readAuthClaims()`.
 *
 * SECURITY: authorization data is read from `app_metadata` only.
 * `user_metadata` (`raw_user_meta_data`) is writable by the signed-in user, so a
 * token carrying `user_metadata.role === 'admin'` is **not** an admin
 * (docs/archive/SEPT_IMPLEMENTATION_PLAN §10.0).
 */

/** Role value written by `scripts/grant-admin.mjs` (§10.2). */
export const ADMIN_ROLE = 'admin'

export interface AuthClaims {
  /** `auth.users.id` — the only key authorization may be based on. */
  sub: string
  /** Display copy of the email claim; never used to grant access. */
  email: string | null
  /** JWT `iat` in seconds, when the issuer provided it. */
  issuedAt: number | null
  /** JWT `aal` claim — `'aal1'` or `'aal2'` (second factor completed, §10.16). */
  aal: string | null
  /**
   * OCT #34: when this session last cleared an authentication ceremony, in
   * seconds since the epoch. Taken from the `totp` entry when the token has one,
   * so the admin session TTL is measured from the second factor and
   * re-authenticating means re-doing MFA. `null` when `amr` is absent or
   * unusable — callers must treat that as "expired".
   */
  authenticatedAt: number | null
  /** `amr[].method` values, in token order (e.g. `['google', 'totp']`). */
  authenticationMethods: string[]
  /** Service-role-written metadata. Never `user_metadata`. */
  appMetadata: Record<string, unknown>
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

interface AuthenticationMethodEntry {
  method: string
  timestamp: number
}

/**
 * Narrows the `amr` claim. GoTrue emits `[{ method, timestamp }, …]`; anything
 * else (missing, a string, an entry without a numeric timestamp) is dropped
 * rather than coerced — an unreadable `amr` must not look like a fresh session.
 */
function readAuthenticationMethodEntries(raw: unknown): AuthenticationMethodEntry[] {
  if (!Array.isArray(raw)) return []

  const entries: AuthenticationMethodEntry[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue

    const method = typeof item.method === 'string' && item.method.trim() ? item.method.trim() : null
    const timestamp =
      typeof item.timestamp === 'number' && Number.isFinite(item.timestamp) ? item.timestamp : null

    if (!method || timestamp === null) continue
    entries.push({ method, timestamp })
  }

  return entries
}

/**
 * OCT #34: the moment the session last authenticated for TTL purposes.
 *
 * The `totp` entry wins when present: a refresh token keeps its `aal2` level, so
 * measuring from the newest entry of *any* method would let a session that was
 * only ever refreshed look freshly authenticated. With no `totp` entry (a
 * session that has not reached the MFA challenge yet) the newest timestamp wins,
 * so a brand-new sign-in is fresh rather than instantly expired.
 */
export function readAuthenticatedAt(entries: AuthenticationMethodEntry[]): number | null {
  const totpEntries = entries.filter((entry) => entry.method === 'totp')
  const candidates = totpEntries.length > 0 ? totpEntries : entries

  if (candidates.length === 0) return null
  return Math.max(...candidates.map((entry) => entry.timestamp))
}

/**
 * Narrows a raw JWT payload to the fields the app reasons about.
 * Returns `null` when there is no usable subject, which callers treat as
 * "not signed in".
 */
export function readAuthClaims(raw: unknown): AuthClaims | null {
  if (!isRecord(raw)) return null

  const sub = typeof raw.sub === 'string' && raw.sub.trim().length > 0 ? raw.sub : null
  if (!sub) return null

  const authenticationMethods = readAuthenticationMethodEntries(raw.amr)

  return {
    sub,
    email: typeof raw.email === 'string' ? raw.email : null,
    issuedAt: typeof raw.iat === 'number' ? raw.iat : null,
    aal: typeof raw.aal === 'string' ? raw.aal : null,
    authenticatedAt: readAuthenticatedAt(authenticationMethods),
    authenticationMethods: authenticationMethods.map((entry) => entry.method),
    appMetadata: isRecord(raw.app_metadata) ? raw.app_metadata : {},
  }
}

/** `true` when verified claims carry the admin role (§10.3 / §10.5). */
export function hasAdminRole(claims: AuthClaims | null | undefined): boolean {
  if (!claims) return false
  return claims.appMetadata.role === ADMIN_ROLE
}

/** §10.16 — `true` when the session completed a second-factor challenge. */
export function hasAal2(claims: AuthClaims | null | undefined): boolean {
  if (!claims) return false
  return claims.aal === 'aal2'
}
