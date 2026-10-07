/**
 * Supabase JWT claim helpers.
 *
 * `getClaims()` hands back a decoded payload whose *shape* we do not control, so
 * every identity decision in the app goes through `readAuthClaims()`.
 *
 * SECURITY: authorization data is read from `app_metadata` only.
 * `user_metadata` (`raw_user_meta_data`) is writable by the signed-in user, so a
 * token carrying `user_metadata.role === 'admin'` is **not** an admin
 * (SEPT_IMPLEMENTATION_PLAN §10.0).
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
  /** Service-role-written metadata. Never `user_metadata`. */
  appMetadata: Record<string, unknown>
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

  return {
    sub,
    email: typeof raw.email === 'string' ? raw.email : null,
    issuedAt: typeof raw.iat === 'number' ? raw.iat : null,
    aal: typeof raw.aal === 'string' ? raw.aal : null,
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
