/**
 * Persistent rate limiter (SEC-008, SEC-021).
 *
 * Uses a Supabase-backed counter table (`exp_rate_limit_windows`) with an
 * atomic `increment_rate_limit` RPC so rate limit state survives Vercel
 * serverless cold starts. The previous in-memory Map pattern is removed.
 *
 * The `rateLimit()` function is ASYNC — all callers MUST `await` it.
 *
 * Usage:
 *   const result = await rateLimit(`login:${ip}`, 5, 15 * 60 * 1000)
 *   if (!result.allowed) return 429 with Retry-After header
 */

import { getSupabaseAdmin } from '@/lib/supabase/client'
import { safeLogError } from '@/lib/security/logger'

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfter?: number   // seconds until the window resets (only set when denied)
}

// Lazy cleanup counter — run cleanup ~every 5 minutes
let lastCleanup = 0
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

async function maybeCleanup(): Promise<void> {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now
  try {
    const supabase = getSupabaseAdmin()
    await supabase.rpc('cleanup_expired_rate_limits')
  } catch {
    // Non-critical — lazy cleanup is opportunistic
  }
}

/**
 * Check and increment the rate limit counter for a given key.
 *
 * @param key        Unique key (e.g. `"login:203.0.113.1"`)
 * @param limit      Maximum number of requests allowed in the window
 * @param windowMs   Window duration in milliseconds
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  options: { failClosed?: boolean } = {}
): Promise<RateLimitResult> {
  const now = Date.now()
  const windowStart = Math.floor(now / windowMs)
  const windowKey = `${key}:${windowStart}`
  const expiresAt = new Date(windowStart * windowMs + windowMs).toISOString()

  // Opportunistic cleanup
  await maybeCleanup()

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase.rpc('increment_rate_limit', {
      p_key: windowKey,
      p_window_start: windowStart,
      p_expires_at: expiresAt,
    })

    if (error) {
      // SEC-047: If failClosed is true (security-critical endpoints like login/MFA),
      // reject the request instead of allowing unlimited attempts.
      safeLogError('[rate-limit]', error)
      if (options.failClosed) {
        return { allowed: false, remaining: 0, retryAfter: 60 }
      }
      // Otherwise fail OPEN — don't block legitimate traffic
      return { allowed: true, remaining: limit - 1 }
    }

    const count = Number(data) || 1

    if (count > limit) {
      const retryAfter = Math.ceil((windowStart * windowMs + windowMs - now) / 1000)
      return { allowed: false, remaining: 0, retryAfter }
    }

    return { allowed: true, remaining: Math.max(0, limit - count) }
  } catch (error) {
    // SEC-047: If failClosed is true, reject on infrastructure errors too
    safeLogError('[rate-limit]', error)
    if (options.failClosed) {
      return { allowed: false, remaining: 0, retryAfter: 60 }
    }
    // Otherwise fail open — don't block legitimate traffic
    return { allowed: true, remaining: limit - 1 }
  }
}

/**
 * Build a standardized 429 response with Retry-After header.
 */
export function rateLimitResponse(retryAfter: number): Response {
  return new Response(
    JSON.stringify({ error: 'Too many requests. Please wait before trying again.' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
      },
    }
  )
}

/**
 * Extract the best available IP address from a Next.js request (SEC-021).
 *
 * Only trusts X-Forwarded-For when running on Vercel (which overwrites the
 * header at the edge). Outside Vercel, returns 'unknown' to prevent IP
 * spoofing via a client-supplied X-Forwarded-For header.
 */
export function getClientIp(request: Request): string {
  // SEC-021: Only trust X-Forwarded-For on Vercel, which overwrites it at the
  // edge. Outside Vercel, a client can spoof this header.
  if (process.env.VERCEL) {
    const forwarded = request.headers.get('x-forwarded-for')
    if (forwarded) {
      // x-forwarded-for may contain multiple IPs (client, proxy1, proxy2, ...)
      // The original client IP is always first
      return forwarded.split(',')[0].trim()
    }

    // Some Vercel regions use this header
    const vercelForwarded = request.headers.get('x-vercel-forwarded-for')
    if (vercelForwarded) {
      return vercelForwarded.split(',')[0].trim()
    }
  }

  // Non-Vercel: refuse to trust X-Forwarded-For to prevent spoofing
  if (!process.env.VERCEL) {
    console.warn('[rate-limit] getClientIp called outside Vercel — using unknown')
  }

  return 'unknown'
}