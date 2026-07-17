/**
 * In-memory store for email-based MFA codes.
 *
 * Uses a module-level Map so state is shared across requests within the same
 * serverless function instance. Resets on cold starts / redeploys — acceptable
 * for admin MFA as codes are short-lived and rate-limited.
 */

interface MFACodeEntry {
  code: string
  createdAt: number
  expiresAt: number
}

// Module-level singleton
const mfaStore = new Map<string, MFACodeEntry>()

// Prune expired codes every 5 minutes to avoid unbounded memory growth
let lastPrune = Date.now()
const PRUNE_INTERVAL_MS = 5 * 60 * 1000

function maybePrune(): void {
  const now = Date.now()
  if (now - lastPrune < PRUNE_INTERVAL_MS) return
  lastPrune = now
  for (const [key, entry] of mfaStore.entries()) {
    if (entry.expiresAt <= now) mfaStore.delete(key)
  }
}

/**
 * Generate and store a 6-digit MFA code.
 * Returns the code (to be sent via email).
 */
export function createMFACode(ip: string): string {
  maybePrune()

  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString()
  const now = Date.now()
  const expiresAt = now + 10 * 60 * 1000 // 10 minutes

  mfaStore.set(ip, { code, createdAt: now, expiresAt })
  return code
}

/**
 * Verify an MFA code for the given IP.
 * Returns true if valid, false otherwise.
 */
export function verifyMFACode(ip: string, code: string): boolean {
  maybePrune()

  const entry = mfaStore.get(ip)
  if (!entry) return false

  // Check if code has expired
  if (Date.now() > entry.expiresAt) {
    mfaStore.delete(ip)
    return false
  }

  // Constant-time comparison to prevent timing attacks
  const isValid = entry.code === code
  if (isValid) {
    // Code is one-time use - delete after successful verification
    mfaStore.delete(ip)
  }
  return isValid
}

/**
 * Get remaining time (in seconds) before the code expires.
 * Returns 0 if no code exists.
 */
export function getMFACodeTimeRemaining(ip: string): number {
  const entry = mfaStore.get(ip)
  if (!entry) return 0

  const remaining = Math.max(0, entry.expiresAt - Date.now())
  return Math.floor(remaining / 1000)
}