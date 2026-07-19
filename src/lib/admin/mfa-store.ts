/**
 * Persistent store for email-based MFA codes.
 *
 * Uses Supabase so codes survive across Vercel serverless instance rotations.
 * Falls back to in-memory Map if Supabase is unavailable.
 *
 * IMPORTANT: Codes are keyed by a cryptographically random challenge token
 * (stored in an httpOnly cookie), NOT by IP address. IP-based lookup was
 * unreliable on Vercel serverless because x-forwarded-for can change between
 * the send-mfa and verify-mfa requests (different edge nodes, cold starts).
 *
 * SCHEMA COMPATIBILITY: This code works with both migration 040 (old schema
 * where `ip` is NOT NULL) and migration 041 (new schema with `challenge_token`
 * column). It prefers `challenge_token` but falls back to storing the token
 * in the `ip` column if the newer column doesn't exist.
 */

import { randomUUID } from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase/client'

interface MFACodeEntry {
  code: string
  challengeToken: string
  createdAt: number
  expiresAt: number
  deviceFingerprint?: string
}

// In-memory fallback
const mfaStore = new Map<string, MFACodeEntry>()

let lastPrune = Date.now()
const PRUNE_INTERVAL_MS = 5 * 60 * 1000

function maybePruneMemoryStore(): void {
  const now = Date.now()
  if (now - lastPrune < PRUNE_INTERVAL_MS) return
  lastPrune = now
  for (const [key, entry] of mfaStore.entries()) {
    if (entry.expiresAt <= now) mfaStore.delete(key)
  }
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
 * Generate and store a 6-digit MFA code.
 * Returns both the code and a cryptographically random challenge token.
 * The challenge token is used as the lookup key (not IP).
 */
export async function createMFACode(deviceFingerprint?: string): Promise<{ code: string; challengeToken: string }> {
  const code = Math.floor(100000 + Math.random() * 900000).toString()
  const challengeToken = randomUUID()
  const now = Date.now()
  const expiresAt = now + 10 * 60 * 1000 // 10 minutes

  try {
    const supabase = getSupabaseAdmin()

    // Try new schema first: challenge_token + device_fingerprint columns
    const insertPayload: Record<string, any> = {
      challenge_token: challengeToken,
      code,
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
      console.log('[MFA Store] Code stored successfully for token:', challengeToken.slice(0, 8) + '...', 'expires at:', expiresAt)
      return { code, challengeToken }
    }

    // If column not found, the migration hasn't run — fall back to old schema (ip only)
    if (isColumnNotFound(error)) {
      console.log('[MFA Store] New schema columns not found, falling back to ip-only insert')
      const legacyPayload: Record<string, any> = {
        ip: challengeToken, // Store challenge token in the ip column
        code,
        expires_at: new Date(expiresAt).toISOString(),
      }

      const { error: legacyError } = await supabase.from('admin_mfa_codes').insert(legacyPayload)

      if (!legacyError) {
        supabase.from('admin_mfa_codes').delete().lt('expires_at', new Date().toISOString()).then(null, () => {})
        console.log('[MFA Store] Code stored (legacy schema) for token:', challengeToken.slice(0, 8) + '...')
        return { code, challengeToken }
      }

      console.warn('[MFA Store] Legacy insert also failed:', legacyError?.message, 'code:', legacyError?.code)
    } else {
      console.warn('[MFA Store] Insert failed:', error.message, 'code:', error.code, 'details:', error.details)
    }
  } catch (err) {
    console.error('[MFA Store] Supabase connection error:', err instanceof Error ? err.message : String(err))
    console.error('[MFA Store] Full error:', err)
  }

  // Fallback: in-memory store
  maybePruneMemoryStore()
  mfaStore.set(challengeToken, { code, challengeToken, createdAt: now, expiresAt, deviceFingerprint })
  return { code, challengeToken }
}

/**
 * Verify an MFA code for the given challenge token.
 * Tries Supabase first, falls back to in-memory.
 * Handles both new schema (challenge_token column) and old schema (ip column).
 */
export async function verifyMFACode(challengeToken: string, code: string, deviceFingerprint?: string): Promise<boolean> {
  if (!challengeToken) {
    console.error('[MFA Store] No challenge token provided for verification')
    return false
  }

  // Try new schema first (challenge_token column)
  const result = await tryVerifyWithColumn(challengeToken, code, deviceFingerprint, 'challenge_token')

  if (result === true) return true

  // If the error was "column not found", try old schema (ip column)
  if (result === 'column_not_found') {
    console.log('[MFA Store] challenge_token column not found, falling back to ip column')
    const legacyResult = await tryVerifyWithColumn(challengeToken, code, deviceFingerprint, 'ip')
    if (legacyResult === true) return true
  }

  // Fallback: in-memory store
  maybePruneMemoryStore()
  console.log('[MFA Store] Verify falling back to memory store, token:', challengeToken.slice(0, 8) + '...')
  const entry = mfaStore.get(challengeToken)
  if (!entry) {
    console.log('[MFA Store] No entry found in memory store for token:', challengeToken.slice(0, 8) + '...')
    return false
  }

  if (Date.now() > entry.expiresAt) {
    mfaStore.delete(challengeToken)
    console.log('[MFA Store] Entry expired for token:', challengeToken.slice(0, 8) + '...')
    return false
  }

  // HARD CHECK: If a device fingerprint was stored, verify it matches
  if (entry.deviceFingerprint) {
    if (!deviceFingerprint) {
      console.warn('[MFA Store] Memory store: device fingerprint required but not provided for token:', challengeToken.slice(0, 8) + '...')
      return false
    }
    if (entry.deviceFingerprint !== deviceFingerprint) {
      console.warn('[MFA Store] Memory store: device fingerprint mismatch — rejecting code for token:', challengeToken.slice(0, 8) + '...')
      return false
    }
  }

  mfaStore.delete(challengeToken) // One-time use
  const match = entry.code === code
  console.log('[MFA Store] Memory verify result:', match)
  return match
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

    const selectFields = column === 'challenge_token' ? 'id, code, expires_at, device_fingerprint' : 'id, code, expires_at'
    const { data, error } = await supabase
      .from('admin_mfa_codes')
      .select(selectFields)
      .eq(column, challengeToken)
      .eq('code', code)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .limit(1)
      .maybeSingle()

    if (error) {
      if (isColumnNotFound(error)) {
        return 'column_not_found'
      }
      console.warn(`[MFA Store] Verify failed on ${column}:`, error.message, 'code:', error.code)
      return false
    }

    if (!data) {
      console.log(`[MFA Store] No matching code found via ${column}:`, challengeToken.slice(0, 8) + '...')
      return false
    }

    // HARD CHECK: If a device fingerprint was stored with this code,
    // the verify request MUST provide a matching fingerprint.
    const storedFingerprint = (data as any).device_fingerprint
    if (storedFingerprint) {
      if (!deviceFingerprint) {
        console.warn('[MFA Store] Device fingerprint required but not provided for token:', challengeToken.slice(0, 8) + '...')
        return false
      }
      if (storedFingerprint !== deviceFingerprint) {
        console.warn('[MFA Store] Device fingerprint mismatch — rejecting code for token:', challengeToken.slice(0, 8) + '...')
        return false
      }
    }

    // Mark as used (one-time use)
    await supabase.from('admin_mfa_codes').update({ used: true }).eq('id', (data as any).id)
    console.log(`[MFA Store] Verify succeeded via ${column} for token:`, challengeToken.slice(0, 8) + '...')
    return true
  } catch (err) {
    console.error(`[MFA Store] Supabase connection error during verify (${column}):`, err instanceof Error ? err.message : String(err))
    return false
  }
}