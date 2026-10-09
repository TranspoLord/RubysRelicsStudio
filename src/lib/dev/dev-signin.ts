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
 * flag so a misconfigured deployment cannot enable this by accident, and the
 * flag is required so that even a local run is an explicit choice.
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
// escalates that session: enrol a dedicated TOTP factor once (persisting its
// secret, which `enrol()` only returns at creation time), then challenge +
// verify with a freshly generated code. This is dev-only and shares nothing with
// the owner's real factor.

export interface DevMfaFactor {
  factorId: string
  secret: string
}

/** The shape of `supabase.auth.mfa` the escalator needs (kept structural for tests). */
export interface DevMfaClient {
  getAuthenticatorAssuranceLevel: () => Promise<{ data: { currentLevel: string } | null }>
  listFactors: () => Promise<{ data: { totp?: Array<{ id: string }> } | null }>
  enroll: (opts: { factorType: string }) => Promise<{
    data: { id: string; totp: { secret: string } } | null
    error: unknown
  }>
  challenge: (opts: { factorId: string }) => Promise<{ data: { id: string } | null }>
  verify: (opts: { factorId: string; challengeId: string; code: string }) => Promise<{ error: unknown }>
}

const MFA_FACTOR_FILE = join(tmpdir(), 'rrs-dev-mfa-factor.json')

function readPersistedFactor(): DevMfaFactor | null {
  try {
    if (!existsSync(MFA_FACTOR_FILE)) return null
    return JSON.parse(readFileSync(MFA_FACTOR_FILE, 'utf8')) as DevMfaFactor
  } catch {
    return null
  }
}

function writePersistedFactor(factor: DevMfaFactor): void {
  try {
    writeFileSync(MFA_FACTOR_FILE, JSON.stringify(factor), 'utf8')
  } catch {
    // Non-fatal: a re-enrol on the next run leaves an orphaned factor, which the
    // recovery script (`npm run admin:reset-mfa`) can clear.
  }
}

/**
 * Returns `true` once the session is at `aal2`, enrolling and completing a TOTP
 * challenge as needed. Persistence is injected so the unit test does not touch
 * the real temp file.
 */
export async function escalateToAal2(
  mfa: DevMfaClient,
  readPersisted: () => DevMfaFactor | null = readPersistedFactor,
  writePersisted: (factor: DevMfaFactor) => void = writePersistedFactor
): Promise<boolean> {
  const { data: aal } = await mfa.getAuthenticatorAssuranceLevel()
  if (aal?.currentLevel === 'aal2') return true

  const { data: factors } = await mfa.listFactors()
  const totp = factors?.totp ?? []

  let factorId: string
  let secret: string

  const persisted = readPersisted()
  if (persisted && totp.some((factor) => factor.id === persisted.factorId)) {
    factorId = persisted.factorId
    secret = persisted.secret
  } else {
    const { data: enrolled, error: enrollError } = await mfa.enroll({ factorType: 'totp' })
    if (enrollError || !enrolled) return false
    factorId = enrolled.id
    secret = enrolled.totp.secret
    writePersisted({ factorId, secret })
  }

  const { data: challenge } = await mfa.challenge({ factorId })
  if (!challenge) return false

  const code = generateTotpCode(secret)
  const { error: verifyError } = await mfa.verify({ factorId, challengeId: challenge.id, code })
  return !verifyError
}