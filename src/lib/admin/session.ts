import { createHmac, hkdfSync, randomUUID, timingSafeEqual } from 'node:crypto'
import { getAdminSessionSettings } from '@/lib/storefront-settings'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { safeLogError } from '@/lib/security/logger'

export const ADMIN_COOKIE_NAME = 'rr_admin_session'

// SEC-047: Bumped to v2 to include mfaVerified flag in the token payload.
// This invalidates all v1 sessions (admins must log in again).
const SESSION_VERSION = 'v2'
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 12

// SEC- BATCH1-H2: Independent high-entropy signing/hash keys derived from
// dedicated env secrets. ADMIN_LOGIN_KEY is used ONLY for the login comparison.

function loadHexSeed(envVar: string): Buffer {
  const value = process.env[envVar]
  if (!value) {
    throw new Error(`${envVar} must be set to a 32-byte hex string.`)
  }
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${envVar} must be a 64-character hex string (32 bytes).`)
  }
  return Buffer.from(value, 'hex')
}

function deriveHmacKey(seed: Buffer, salt: string, info: string): Buffer {
  return Buffer.from(hkdfSync('sha256', seed, Buffer.from(salt), Buffer.from(info), 32))
}

let SESSION_SIGNING_KEY: Buffer | null = null
function getSessionSigningKey(): Buffer {
  if (!SESSION_SIGNING_KEY) {
    SESSION_SIGNING_KEY = deriveHmacKey(
      loadHexSeed('SESSION_SIGNING_KEY_SEED'),
      'rr-admin-session-signing-v1',
      'rr-admin'
    )
  }
  return SESSION_SIGNING_KEY
}

let SESSION_HASH_KEY: Buffer | null = null
function getSessionHashKey(): Buffer {
  if (!SESSION_HASH_KEY) {
    SESSION_HASH_KEY = deriveHmacKey(
      loadHexSeed('SESSION_HASH_KEY_SEED'),
      'rr-admin-session-hash-v1',
      'rr-admin'
    )
  }
  return SESSION_HASH_KEY
}

function signPayload(payload: string): string {
  return createHmac('sha256', getSessionSigningKey()).update(payload).digest('hex')
}

function hashToken(token: string): string {
  return createHmac('sha256', getSessionHashKey()).update(token).digest('hex')
}

/**
 * SEC-047: Dev-only convenience. A Supabase outage in production must NOT
 * silently disable session-revoke checks, so the fallback is force-disabled in
 * Vercel/production. It only takes effect in local (non-Vercel, non-production)
 * dev when the env var is explicitly set to 'true'.
 */
function allowLegacySessionFallback(): boolean {
  if (process.env.VERCEL) return false
  if (process.env.NODE_ENV === 'production') return false
  return process.env.ALLOW_LEGACY_ADMIN_SESSION_FALLBACK === 'true'
}

/**
 * SEC-011: Create an admin session token with a JTI (UUID).
 * SEC-047: Token format is now v2.{exp}.{jti}.{mfaFlag}.{sig} where mfaFlag
 * is '1' if MFA has been verified, '0' otherwise. This cryptographically
 * binds the MFA-verified state to the session, preventing cookie forgery.
 * A corresponding row is inserted into exp_admin_sessions.
 */
export async function createAdminSessionToken(
  ttlSeconds = DEFAULT_SESSION_TTL_SECONDS,
  metadata?: { ipAddress?: string; userAgent?: string; mfaVerified?: boolean }
): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds
  const jti = randomUUID()
  const mfaFlag = metadata?.mfaVerified ? '1' : '0'
  const payload = `${SESSION_VERSION}.${expiresAt}.${jti}.${mfaFlag}`
  const sig = signPayload(payload)
  const token = `${payload}.${sig}`

  // SEC-011: Insert a session row for revocation support
  try {
    const supabase = getSupabaseAdmin()
    await supabase.from('exp_admin_sessions').insert({
      token_hash: hashToken(token),
      jti,
      ip_address: metadata?.ipAddress || null,
      user_agent: metadata?.userAgent || null,
      expires_at: new Date(expiresAt * 1000).toISOString(),
    })
  } catch (err) {
    // Non-fatal — the token is still valid via HMAC verification.
    // DB lookup is a defense-in-depth revocation check.
    safeLogError('[admin:session]', err)
  }

  return token
}

/**
 * SEC-011: Verify an admin session token.
 * Checks HMAC signature, expiration, AND that the session row exists
 * and has not been revoked.
 */
export async function verifyAdminSessionToken(
  token: string | null | undefined,
  _adminKey?: string,
  requireMfa = true
): Promise<boolean> {
  if (!token) return false

  const parts = token.split('.')
  if (parts.length !== 5) return false // v2: version.exp.jti.mfaFlag.sig

  const [version, expRaw, jti, mfaFlag, signature] = parts
  if (version !== SESSION_VERSION) return false

  const exp = Number.parseInt(expRaw, 10)
  if (!Number.isFinite(exp)) return false
  if (exp < Math.floor(Date.now() / 1000)) return false

  // SEC-047: Enforce MFA flag — reject tokens that haven't completed MFA
  if (requireMfa && mfaFlag !== '1') return false

  // Verify HMAC signature using the dedicated signing key (never ADMIN_LOGIN_KEY).
  const payload = `${version}.${exp}.${jti}.${mfaFlag}`
  const expectedSignature = signPayload(payload)

  const actualBuf = Buffer.from(signature)
  const expectedBuf = Buffer.from(expectedSignature)

  if (actualBuf.length !== expectedBuf.length) return false
  if (!timingSafeEqual(actualBuf, expectedBuf)) return false

  // SEC-011: Check the session row exists and is not revoked.
  // Fail closed when revocation state cannot be validated. A temporary
  // compatibility bypass is available via ALLOW_LEGACY_ADMIN_SESSION_FALLBACK=true.
  try {
    const supabase = getSupabaseAdmin()
    const { data: session, error } = await supabase
      .from('exp_admin_sessions')
      .select('id, revoked_at, expires_at')
      .eq('jti', jti)
      .maybeSingle()

    if (error) {
      if (allowLegacySessionFallback()) {
        return true
      }
      safeLogError('[admin:session:verify]', error)
      return false
    }

    if (!session) {
      return allowLegacySessionFallback()
    }

    // Session found — check revocation
    if (session.revoked_at) return false
    // Check DB expiry (in case it was shortened)
    if (new Date(session.expires_at) < new Date()) return false
  } catch (err) {
    if (allowLegacySessionFallback()) {
      return true
    }
    safeLogError('[admin:session:verify]', err)
    return false
  }

  return true
}

/**
 * SEC-011: Revoke a specific admin session by JTI.
 */
export async function revokeAdminSession(jti: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin()
    const { error } = await supabase
      .from('exp_admin_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('jti', jti)
      .is('revoked_at', null)

    return !error
  } catch (err) {
    safeLogError('[admin:session:revoke]', err)
    return false
  }
}

/**
 * SEC-011: Revoke all admin sessions except the one with the given JTI.
 */
export async function revokeOtherAdminSessions(currentJti: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin()
    const { error } = await supabase
      .from('exp_admin_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .neq('jti', currentJti)
      .is('revoked_at', null)

    return !error
  } catch (err) {
    safeLogError('[admin:session:revoke-others]', err)
    return false
  }
}

/**
 * SEC-011: List all active admin sessions.
 */
export async function listAdminSessions() {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_admin_sessions')
      .select('id, jti, ip_address, user_agent, created_at, expires_at, last_activity_at')
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })

    if (error) {
      safeLogError('[admin:session:list]', error)
      return []
    }

    return data || []
  } catch (err) {
    safeLogError('[admin:session:list]', err)
    return []
  }
}

/**
 * Extract the JTI from a session token (without verifying).
 */
export function extractJtiFromToken(token: string | null | undefined): string | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 5) return null // v2: version.exp.jti.mfaFlag.sig
  return parts[2]
}

/**
 * Extract the MFA verification flag from a session token (without verifying).
 * Returns '1' if MFA is verified, '0' if not, or null if the token is invalid.
 * SEC-047: Used by /api/admin/session GET to report MFA status to the client.
 */
export function extractMfaFlagFromToken(token: string | null | undefined): string | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 5) return null // v2: version.exp.jti.mfaFlag.sig
  return parts[3]
}

export async function getAdminSessionMaxAgeSeconds(): Promise<number> {
  const settings = await getAdminSessionSettings()
  return Math.floor(settings.ttl_hours * 60 * 60)
}