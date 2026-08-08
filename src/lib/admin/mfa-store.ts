/**
 * Persistent store for email-based MFA codes (SEC-005, SEC-007).
 *
 * Uses Supabase so codes survive across Vercel serverless instance rotations.
 * No in-memory fallback is permitted — MFA MUST fail closed if Supabase is
 * unavailable (SEC-007).
 *
 * IMPORTANT: Codes are keyed by a cryptographically random challenge token
 * (stored in an httpOnly cookie), NOT by IP address. IP-based lookup was
 * unreliable on Vercel serverless because x-forwarded-for can change between
 * the send-mfa and verify-mfa requests (different edge nodes, cold starts).
 *
 * The table is `admin_mfa_codes` (not `exp_admin_mfa_codes`).
 */

import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { safeLogError } from '@/lib/security/logger'

interface MFACodeEntry {
  code: string
  challengeToken: string
  createdAt: number
  expiresAt: number
  deviceFingerprint?: string
}

const MFA_CODE_HASH_PREFIX = 'h1$'

function getMfaCodeHashKey(): string {
  const key = process.env.MFA_CODE_HASH_KEY || process.env.ADMIN_LOGIN_KEY
  if (!key) {
    throw new Error('MFA_CODE_HASH_KEY or ADMIN_LOGIN_KEY must be set for MFA code hashing.')
  }
  return key
}

function hashMfaCode(challengeToken: string, code: string): string {
  return createHmac('sha256', getMfaCodeHashKey())
    .update(`${challengeToken}:${code}`)
    .digest('hex')
}

function encodeStoredMfaCode(challengeToken: string, code: string): string {
  return `${MFA_CODE_HASH_PREFIX}${hashMfaCode(challengeToken, code)}`
}

function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

function verifyStoredMfaCode(storedCode: string, challengeToken: string, providedCode: string): boolean {
  if (!storedCode || !providedCode) return false

  if (storedCode.startsWith(MFA_CODE_HASH_PREFIX)) {
    try {
      const expected = `${MFA_CODE_HASH_PREFIX}${hashMfaCode(challengeToken, providedCode)}`
      return safeEquals(storedCode, expected)
    } catch {
      return false
    }
  }

  // Backward compatibility: old rows store plaintext 6-digit codes.
  return safeEquals(storedCode, providedCode)
}

/**
 * Check if a Supabase error is a "column not found" error.
 */
function isColumnNotFound(error: any): boolean {
  if (!error) return false
  const msg = String(error.message ?? error).toLowerCase()
  return msg.includes('column') && (msg.includes('not exist') || msg.includes('does not exist') || msg.includes('not found'))
}

/**
 * Generate and store a 6-digit MFA code (SEC-005: uses crypto.randomInt).
 * Returns both the code and a cryptographically random challenge token.
 * The challenge token is used as the lookup key (not IP).
 *
 * SEC-007: Fails closed if Supabase is unavailable — no in-memory fallback.
 */
export async function createMFACode(deviceFingerprint?: string): Promise<{ code: string; challengeToken: string }> {
  // SEC-005: Use crypto.randomInt instead of Math.random
  const code = randomInt(100000, 1000000).toString()
  const challengeToken = randomUUID()
  const now = Date.now()
  const expiresAt = now + 10 * 60 * 1000 // 10 minutes

  const supabase = getSupabaseAdmin()
  const storedCode = encodeStoredMfaCode(challengeToken, code)

  // Try new schema first: challenge_token + device_fingerprint columns
  const insertPayload: Record<string, any> = {
    challenge_token: challengeToken,
    code: storedCode,
    expires_at: new Date(expiresAt).toISOString(),
    ip: challengeToken, // Also populate ip for backward compat with migration 040
  }

  if (deviceFingerprint) {
    insertPayload.device_fingerprint = deviceFingerprint
  }

  const { error } = await supabase.from('admin_mfa_codes').insert(insertPayload)

  if (!error) {
    // Prune expired codes asynchronously
    supabase.from('admin_mfa_codes').delete().lt('expires_at', new Date().toISOString()).then(null, () => {})
    return { code, challengeToken }
  }

  // If column not found, the migration hasn't run — fall back to old schema (ip only)
  if (isColumnNotFound(error)) {
    const legacyPayload: Record<string, any> = {
      ip: challengeToken, // Store challenge token in the ip column
      code: storedCode,
      expires_at: new Date(expiresAt).toISOString(),
    }

    const { error: legacyError } = await supabase.from('admin_mfa_codes').insert(legacyPayload)

    if (!legacyError) {
      supabase.from('admin_mfa_codes').delete().lt('expires_at', new Date().toISOString()).then(null, () => {})
      return { code, challengeToken }
    }

    // SEC-007: Fail closed — no in-memory fallback
    safeLogError('[MFA Store] Legacy insert failed:', legacyError)
    throw new Error('Failed to store MFA code — Supabase unavailable')
  }

  // SEC-007: Fail closed — no in-memory fallback
  safeLogError('[MFA Store] Insert failed:', error)
  throw new Error('Failed to store MFA code — Supabase unavailable')
}

/**
 * Verify an MFA code for the given challenge token.
 * Handles both new schema (challenge_token column) and old schema (ip column).
 *
 * SEC-007: Fails closed if Supabase is unavailable — no in-memory fallback.
 */
export async function verifyMFACode(challengeToken: string, code: string, deviceFingerprint?: string): Promise<boolean> {
  if (!challengeToken) {
    return false
  }

  // Try new schema first (challenge_token column)
  const result = await tryVerifyWithColumn(challengeToken, code, deviceFingerprint, 'challenge_token')

  if (result === true) return true

  // If the error was "column not found", try old schema (ip column)
  if (result === 'column_not_found') {
    const legacyResult = await tryVerifyWithColumn(challengeToken, code, deviceFingerprint, 'ip')
    if (legacyResult === true) return true
  }

  // SEC-007: No in-memory fallback — fail closed
  return false
}

/**
 * Invalidate a challenge token after too many failed attempts (SEC-006).
 * Marks all codes for this challenge token as used.
 */
export async function invalidateChallengeToken(challengeToken: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()

    // Try new schema first
    const { error } = await supabase
      .from('admin_mfa_codes')
      .update({ used: true })
      .eq('challenge_token', challengeToken)

    if (error && isColumnNotFound(error)) {
      // Fall back to ip column
      await supabase
        .from('admin_mfa_codes')
        .update({ used: true })
        .eq('ip', challengeToken)
    }
  } catch (err) {
    safeLogError('[MFA Store] Failed to invalidate challenge token:', err)
  }
}

/**
 * Try to verify a code by looking up the given column name.
 * Returns true on success, false if code doesn't match, or 'column_not_found'
 * if the column doesn't exist in the database.
 */
async function tryVerifyWithColumn(
  challengeToken: string,
  code: string,
  deviceFingerprint: string | undefined,
  column: string
): Promise<boolean | 'column_not_found'> {
  try {
    const supabase = getSupabaseAdmin()

    const selectFields = column === 'challenge_token'
      ? 'id, code, expires_at, device_fingerprint'
      : 'id, code, expires_at'
    const { data, error } = await supabase
      .from('admin_mfa_codes')
      .select(selectFields)
      .eq(column, challengeToken)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .limit(5)

    if (error) {
      if (isColumnNotFound(error)) {
        return 'column_not_found'
      }
      safeLogError(`[MFA Store] Verify failed on ${column}:`, error)
      return false
    }

    const rows = Array.isArray(data) ? data : []
    if (rows.length === 0) {
      return false
    }

    for (const row of rows as Array<{ id: string; code: string; device_fingerprint?: string }>) {
      if (!verifyStoredMfaCode(String(row.code ?? ''), challengeToken, code)) {
        continue
      }

      // HARD CHECK: If a device fingerprint was stored with this code,
      // the verify request MUST provide a matching fingerprint.
      const storedFingerprint = row.device_fingerprint
      if (storedFingerprint) {
        if (!deviceFingerprint || storedFingerprint !== deviceFingerprint) {
          continue
        }
      }

      // Mark as used (one-time use)
      await supabase.from('admin_mfa_codes').update({ used: true }).eq('id', row.id)
      return true
    }

    // None of the active rows matched the provided code.
    return false
  } catch (err) {
    safeLogError(`[MFA Store] Supabase connection error during verify (${column}):`, err)
    return false
  }
}