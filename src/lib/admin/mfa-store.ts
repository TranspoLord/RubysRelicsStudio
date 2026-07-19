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
 * Generate and store a 6-digit MFA code.
 * Returns both the code and a cryptographically random challenge token.
 * The challenge token is used as the lookup key (not IP).
 */
export async function createMFACode(deviceFingerprint?: string): Promise<{ code: string; challengeToken: string }> {
  const code = Math.floor(100000 + Math.random() * 900000).toString()
  const challengeToken = randomUUID()
  const now = Date.now()
  const expiresAt = now + 10 * 60 * 1000 // 10 minutes

  const insertPayload: Record<string, any> = {
    challenge_token: challengeToken,
    code,
    expires_at: new Date(expiresAt).toISOString(),
  }

  // Store device fingerprint if provided (optional additional verification factor)
  if (deviceFingerprint) {
    insertPayload.device_fingerprint = deviceFingerprint
  }

  try {
    const supabase = getSupabaseAdmin()

    const { error } = await supabase.from('admin_mfa_codes').insert(insertPayload)

    if (!error) {
      // Prune expired codes asynchronously
      supabase.from('admin_mfa_codes').delete().lt('expires_at', new Date().toISOString()).then(null, () => {})
      console.log('[MFA Store] Code stored successfully for token:', challengeToken.slice(0, 8) + '...', 'expires at:', expiresAt)
      return { code, challengeToken }
    }

    console.warn('[MFA Store] Supabase insert failed:', error.message, 'code:', error.code, 'details:', error.details)
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
 */
export async function verifyMFACode(challengeToken: string, code: string, deviceFingerprint?: string): Promise<boolean> {
  if (!challengeToken) {
    console.error('[MFA Store] No challenge token provided for verification')
    return false
  }

  try {
    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('admin_mfa_codes')
      .select('id, code, expires_at, device_fingerprint')
      .eq('challenge_token', challengeToken)
      .eq('code', code)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .limit(1)
      .maybeSingle()

    if (!error && data) {
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
      console.log('[MFA Store] Supabase verify succeeded for token:', challengeToken.slice(0, 8) + '...')
      return true
    }

    if (error) {
      console.warn('[MFA Store] Supabase verify failed:', error.message, 'code:', error.code)
    } else {
      console.log('[MFA Store] Supabase verify: no matching code found for token:', challengeToken.slice(0, 8) + '...')
    }
  } catch (err) {
    console.error('[MFA Store] Supabase connection error during verify:', err instanceof Error ? err.message : String(err))
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