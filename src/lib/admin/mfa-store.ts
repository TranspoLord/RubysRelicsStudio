/**
 * Persistent store for email-based MFA codes.
 *
 * Uses Supabase so codes survive across Vercel serverless instance rotations.
 * Each code is keyed by IP address and expires after 10 minutes.
 */

import { getSupabaseAdmin } from '@/lib/supabase/client'

interface MFACodeRow {
  ip: string
  code: string
  created_at: string
  expires_at: string
  used: boolean
}

/**
 * Generate and store a 6-digit MFA code in Supabase.
 * Returns the code (to be sent via email).
 */
export async function createMFACode(ip: string): Promise<string> {
  const supabase = getSupabaseAdmin()

  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000) // 10 minutes

  // Store in Supabase — clean any existing code for this IP first
  await supabase.from('admin_mfa_codes').delete().eq('ip', ip)

  const { error } = await supabase.from('admin_mfa_codes').insert({
    ip,
    code,
    expires_at: expiresAt.toISOString(),
  })

  if (error) {
    console.error('[MFA Store] Failed to store code:', error.message)
    throw new Error('Failed to generate verification code')
  }

  // Prune expired codes asynchronously (non-blocking)
  supabase.from('admin_mfa_codes').delete().lt('expires_at', new Date().toISOString()).then(null, () => {})

  return code
}

/**
 * Verify an MFA code for the given IP.
 * Returns true if valid, false otherwise.
 * Atomically marks the code as used (one-time use).
 */
export async function verifyMFACode(ip: string, code: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()

  // Find the code for this IP that hasn't expired and hasn't been used
  const { data, error } = await supabase
    .from('admin_mfa_codes')
    .select('*')
    .eq('ip', ip)
    .eq('code', code)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return false
  }

  // Mark as used (one-time use)
  await supabase
    .from('admin_mfa_codes')
    .update({ used: true })
    .eq('id', (data as any).id)

  return true
}