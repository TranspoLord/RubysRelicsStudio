import { timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { generateTotpCode } from '@/lib/auth/totp'

/**
 * Dev-only admin sign-in helper (docs/archive/SEPT_IMPLEMENTATION_PLAN §8, Batch 8).
 *
 * Why this exists: the panel's credential is a Supabase Google-OAuth session
 * (§10), so the visual-audit harness (`UI_AUDIT.md` §4–§7) cannot reach `/admin`
 * at all — `UI_AUDIT.md` §15's dev-token method died with the custom
 * `rr_admin_session` stack. Without a session there is no way to *measure* the
 * admin findings (§9.4, §9.11, §8.6, §9.7 leftovers), and unmeasured CSS claims
 * are exactly what this project refuses to ship.
 *
 * What it does **not** do, deliberately:
 *   - it never creates a user account;
 *   - it never grants or changes the admin role;
 *   - it can only mint a session for an account that is **already** active on the
 *     `exp_admin_users` allow-list (§10.1), so it cannot widen access;
 *   - it never returns or logs a token, a secret or a key — the session lands in
 *     cookies for the calling browser, which is the point.
 *
 * Three independent gates must all pass (see `describeDevSigninGate()`), so the
 * route is inert in production, on any Vercel deployment, and off loopback.
 */

/** Opt-in flag. Must be `true` in the environment for the route to do anything. */
export const DEV_SIGNIN_FLAG = 'ADMIN_DEV_SIGNIN_ENABLED'

/**
 * OCT #10: the shared secret the harness must send in `x-dev-signin-token`.
 *
 * The flag alone is not a gate: `npm run dev` binds every interface, so a peer on
 * the same Wi-Fi can reach the route, and `request.nextUrl.hostname` reports the
 * *bind* host (always `localhost`) rather than the caller's. The token is what
 * actually keeps this helper private.
 */
export const DEV_SIGNIN_TOKEN_ENV = 'ADMIN_DEV_SIGNIN_TOKEN'
/** Second opt-in required when `NEXT_PUBLIC_SUPABASE_URL` is not local. */
export const DEV_SIGNIN_ALLOW_HOSTED_ENV = 'ADMIN_DEV_SIGNIN_ALLOW_HOSTED'
export const DEV_SIGNIN_TOKEN_MIN_LENGTH = 32
/** Every TOTP factor this helper enrols is named with this prefix. */
export const DEV_MFA_FRIENDLY_PREFIX = 'dev-harness'

export interface DevSigninDecision {
  allowed: boolean
  /** Short, log-safe explanation. Never contains a secret. */
  reason: string
}

type EnvLike = Record<string, string | undefined>

/**
 * Whether the helper may run at all.
 *
 * Order matters for the message: production and Vercel are checked before the
 * flag so a misconfigured deployment cannot enable this by accident, and then the
 * flag, the token and a local Supabase project are all required.
 */
export function describeDevSigninGate(env: EnvLike = process.env): DevSigninDecision {
  if (env.NODE_ENV === 'production') {
    return { allowed: false, reason: 'NODE_ENV is production' }
  }

  // Any Vercel environment — including preview — is publicly reachable, so an
  // endpoint that mints admin sessions must never be active there.
  if (env.VERCEL || env.VERCEL_ENV) {
    return { allowed: false, reason: 'running on Vercel' }
  }

  if (env[DEV_SIGNIN_FLAG] !== 'true') {
    return { allowed: false, reason: `${DEV_SIGNIN_FLAG} is not 'true'` }
  }

  // OCT #10: the token is the control that actually stops a LAN peer.
  const token = env[DEV_SIGNIN_TOKEN_ENV]
  if (typeof token !== 'string' || token.length < DEV_SIGNIN_TOKEN_MIN_LENGTH) {
    return {
      allowed: false,
      reason: `${DEV_SIGNIN_TOKEN_ENV} must be at least ${DEV_SIGNIN_TOKEN_MIN_LENGTH} characters`,
    }
  }

  // OCT #10: the dev environment uses the production Supabase project
  // (OCT-14/OCT-18), so minting a session there needs a second explicit opt-in.
  if (!isAllowedSupabaseHost(env.NEXT_PUBLIC_SUPABASE_URL, env[DEV_SIGNIN_ALLOW_HOSTED_ENV])) {
    return {
      allowed: false,
      reason: `NEXT_PUBLIC_SUPABASE_URL is not local (set ${DEV_SIGNIN_ALLOW_HOSTED_ENV}=true to override)`,
    }
  }

  return { allowed: true, reason: 'dev environment with the opt-in flag set' }
}

export function isDevSigninEnabled(env: EnvLike = process.env): boolean {
  return describeDevSigninGate(env).allowed
}

const LOOPBACK_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]', '::1']

/**
 * The helper is refused on any host that is not loopback.
 *
 * This is belt-and-braces on top of the env gate: a non-Vercel "production"
 * staging box would still be refused, and it keeps the helper's blast radius to
 * the machine it runs on. The harness always uses `http://localhost:<port>`
 * anyway (`UI_AUDIT.md` §3).
 */
export function isLoopbackHostname(hostname: string | null | undefined): boolean {
  if (!hostname) return false
  const bare = hostname.split(':')[0].toLowerCase()
  return LOOPBACK_HOSTNAMES.includes(bare) || LOOPBACK_HOSTNAMES.includes(hostname.toLowerCase())
}

/**
 * OCT #10: the loopback check has to read the caller's **Host header**, not
 * `request.nextUrl.hostname`. On a real Next server the latter is built from the
 * server's *bind* hostname (`opts.hostname || 'localhost'`), so with
 * `npm run dev` every request — including one from the café Wi-Fi — looked like
 * `localhost` and passed.
 *
 * Handles the bracketed IPv6 form (`[::1]:3210`).
 */
export function isLoopbackHostHeader(host: string | null | undefined): boolean {
  if (!host) return false
  const value = host.trim().toLowerCase()

  if (value.startsWith('[')) {
    const end = value.indexOf(']')
    if (end === -1) return false
    return value.slice(1, end) === '::1'
  }

  const hostname = value.split(':')[0]
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

/**
 * OCT #10: constant-time comparison of the dev sign-in token. A wrong length is
 * refused before `timingSafeEqual` (which throws on mismatched buffers).
 */
export function isValidDevSigninToken(
  provided: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (!provided || !expected) return false
  const providedBuf = Buffer.from(provided)
  const expectedBuf = Buffer.from(expected)
  if (providedBuf.length !== expectedBuf.length) return false
  return timingSafeEqual(providedBuf, expectedBuf)
}

/**
 * OCT #10: the helper mints a session against whatever `NEXT_PUBLIC_SUPABASE_URL`
 * points at, and this project's dev environment uses the **production** project
 * (OCT-14/OCT-18). A hosted URL therefore needs a second, explicit opt-in.
 */
export function isAllowedSupabaseHost(
  supabaseUrl: string | undefined,
  allowHosted: string | undefined
): boolean {
  if (allowHosted === 'true') return true
  if (!supabaseUrl) return false

  try {
    const hostname = new URL(supabaseUrl).hostname.toLowerCase()
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch {
    return false
  }
}

/** The subset of `exp_admin_users` the helper needs. */
export interface DevSigninAdmin {
  userId: string
  email: string
}

interface AllowListClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        is(column: string, value: unknown): {
          limit(count: number): PromiseLike<{ data: unknown; error: { message: string } | null }>
        }
      }
    }
  }
}

export type { AllowListClient }

/**
 * Picks the admin the helper signs in as.
 *
 * Filters to active, un-revoked rows so the helper can never resurrect a revoked
 * admin (which is the DB gate's whole job, §10.3). Returns `null` when the
 * allow-list is empty — the caller then tells the operator to run
 * `npm run admin:grant`, rather than inventing an account.
 */
export async function findActiveAdmin(
  client: AllowListClient,
  table = 'exp_admin_users'
): Promise<DevSigninAdmin | null> {
  const { data, error } = await client
    .from(table)
    .select('user_id, email')
    .eq('is_active', true)
    .is('revoked_at', null)
    .limit(1)

  if (error) {
    throw new Error(`Allow-list read failed: ${error.message}`)
  }

  const rows = Array.isArray(data) ? data : []
  const row = rows[0] as { user_id?: unknown; email?: unknown } | undefined
  if (!row || typeof row.user_id !== 'string' || typeof row.email !== 'string') {
    return null
  }

  return { userId: row.user_id, email: row.email }
}

// ─── §10.16: mint an `aal2` session so the harness passes mandatory MFA ─────────
//
// Mandatory MFA means the gate demands `aal2`, but the magic-link session the
// helper creates is inherently `aal1`. To keep the harness working, the helper
// escalates it: enrol a TOTP factor, then challenge + verify with a generated code.
//
// OCT #10: the factor is **named** (`dev-harness-<timestamp>`) and its secret is
// never written to disk. Only the factor id is remembered, so the next run can
// unenroll it — and anything left behind by an older build, whose file also held
// the secret — before enrolling a fresh one.

/** The shape of a listed factor the stale sweep needs. */
export interface DevMfaFactorSummary {
  id: string
  friendly_name?: string
  friendlyName?: string
}

/** The shape of `supabase.auth.mfa` the escalator needs (kept structural for tests). */
export interface DevMfaClient {
  getAuthenticatorAssuranceLevel: () => Promise<{ data: { currentLevel: string } | null }>
  listFactors: () => Promise<{
    data: { all?: DevMfaFactorSummary[]; totp?: DevMfaFactorSummary[] } | null
  }>
  enroll: (opts: { factorType: string; friendlyName?: string }) => Promise<{
    data: { id: string; totp: { secret: string } } | null
    error: unknown
  }>
  challenge: (opts: { factorId: string }) => Promise<{ data: { id: string } | null }>
  verify: (opts: { factorId: string; challengeId: string; code: string }) => Promise<{ error: unknown }>
  unenroll: (opts: { factorId: string }) => Promise<{ error?: unknown }>
}

const MFA_FACTOR_FILE = join(tmpdir(), 'rrs-dev-mfa-factor.json')

/**
 * The id of the factor the last run enrolled. A factor id is not a credential —
 * it cannot generate a code — so remembering it is safe; the secret never is.
 */
function readPersistedFactorId(): string | null {
  try {
    if (!existsSync(MFA_FACTOR_FILE)) return null
    const parsed = JSON.parse(readFileSync(MFA_FACTOR_FILE, 'utf8')) as { factorId?: unknown }
    return typeof parsed?.factorId === 'string' ? parsed.factorId : null
  } catch {
    return null
  }
}

function writePersistedFactorId(factorId: string): void {
  try {
    writeFileSync(MFA_FACTOR_FILE, JSON.stringify({ factorId }), 'utf8')
  } catch {
    // Non-fatal: the factor carries the dev name prefix, so the next run's name
    // sweep still finds it.
  }
}

/**
 * Returns `true` once the session is at `aal2`, enrolling and completing a TOTP
 * challenge as needed. The id persistence is injected so the unit test never
 * touches the real temp file.
 */
export async function escalateToAal2(
  mfa: DevMfaClient,
  readFactorId: () => string | null = readPersistedFactorId,
  writeFactorId: (factorId: string) => void = writePersistedFactorId
): Promise<boolean> {
  const { data: aal } = await mfa.getAuthenticatorAssuranceLevel()
  if (aal?.currentLevel === 'aal2') return true

  const { data: factors } = await mfa.listFactors()
  const listed = factors?.all ?? factors?.totp ?? []

  // OCT #10: unenroll whatever a previous run left behind — the id we remembered,
  // plus anything carrying the dev name prefix — before enrolling a fresh factor.
  // At most one dev factor exists at a time and its secret is never persisted.
  const staleIds = new Set<string>()
  const persistedId = readFactorId()
  if (persistedId) staleIds.add(persistedId)
  for (const factor of listed) {
    const name = factor.friendly_name ?? factor.friendlyName ?? ''
    if (name.startsWith(DEV_MFA_FRIENDLY_PREFIX)) staleIds.add(factor.id)
  }
  for (const factorId of staleIds) {
    await mfa.unenroll({ factorId })
  }

  const { data: enrolled, error: enrollError } = await mfa.enroll({
    factorType: 'totp',
    friendlyName: `${DEV_MFA_FRIENDLY_PREFIX}-${Date.now()}`,
  })
  if (enrollError || !enrolled) return false

  writeFactorId(enrolled.id)

  const { data: challenge } = await mfa.challenge({ factorId: enrolled.id })
  if (!challenge) return false

  const code = generateTotpCode(enrolled.totp.secret)
  const { error: verifyError } = await mfa.verify({
    factorId: enrolled.id,
    challengeId: challenge.id,
    code,
  })
  return !verifyError
}