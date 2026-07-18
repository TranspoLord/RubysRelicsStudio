1/**
 * Persistent store for email-based MFA codes.
 *
 * Uses Supabase so codes survive across Vercel serverless instance rotations.
 * Falls back to in-memory Map if Supabase is unavailable.
 */

import { getSupabaseAdmin } from '@/lib/supabase/client'

interface MFACodeEntry {
  code: string
  createdAt: number
  expiresAt: number
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
 * Tries Supabase first, falls back to in-memory.
 */
export async function createMFACode(ip: string): Promise<string> {
  const code = Math.floor(100000 + Math.random() * 900000).toString()
  const now = Date.now()
  const expiresAt = now + 10 * 60 * 1000 // 10 minutes

  try {
    const supabase = getSupabaseAdmin()

    // Clean any existing code for this IP
    const { error: deleteError } = await supabase.from('admin_mfa_codes').delete().eq('ip', ip)
    if (deleteError) {
      console.warn('[MFA Store] Supabase delete prior code failed:', deleteError.message)
    }

    const { error } = await supabase.from('admin_mfa_codes').insert({
      ip,
      code,
      expires_at: new Date(expiresAt).toISOString(),
    })

    if (!error) {
      // Prune expired codes asynchronously
      supabase.from('admin_mfa_codes').delete().lt('expires_at', new Date().toISOString()).then(null, () => {})
      return code
    }

    console.warn('[MFA Store] Supabase insert failed:', error.message)
  } catch (err) {
    console.error('[MFA Store] Supabase connection error:', err instanceof Error ? err.message : String(err))
  }

  // Fallback: in-memory store
  maybePruneMemoryStore()
  mfaStore.set(ip, { code, createdAt: now, expiresAt })
  return code
}

/**
 * Verify an MFA code for the given IP.
 * Tries Supabase first, falls back to in-memory.
 */
export async function verifyMFACode(ip: string, code: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('admin_mfa_codes')
      .select('id')
      .eq('ip', ip)
      .eq('code', code)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .limit(1)
      .maybeSingle()

    if (!error && data) {
      // Mark as used (one-time use)
      await supabase.from('admin_mfa_codes').update({ used: true }).eq('id', (data as any).id)
      return true
    }

    if (error) {
      console.warn('[MFA Store] Supabase verify failed:', error.message)
    }
  } catch (err) {
    console.error('[MFA Store] Supabase connection error during verify:', err instanceof Error ? err.message : String(err))
  }

  // Fallback: in-memory store
  maybePruneMemoryStore()
  const entry = mfaStore.get(ip)
  if (!entry) return false

  if (Date.now() > entry.expiresAt) {
    mfaStore.delete(ip)
    return false
  }

  mfaStore.delete(ip) // One-time use
  return entry.code === code
}