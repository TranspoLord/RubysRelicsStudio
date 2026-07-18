/**
 * In-memory sliding-window rate limiter.
 *
 * Uses a module-level Map so state is shared across requests within the same
 * serverless function instance. Resets on cold starts / redeploys — acceptable
 * for a small storefront. Swap the store for Upstash Redis if persistent
 * cross-instance limiting is ever needed.
 *
 * Usage:
 *   const result = rateLimit(`login:${ip}`, 5, 15 * 60 * 1000)
 *   if (!result.allowed) return 429 with Retry-After header
 */

interface Window {
  count: number
  resetAt: number   // epoch ms when this window expires
}

// Module-level singleton — persists for the lifetime of the function instance
const store = new Map<string, Window>()

// Prune expired windows every 5 minutes to avoid unbounded memory growth
let lastPrune = Date.now()
const PRUNE_INTERVAL_MS = 5 * 60 * 1000

function maybePrune(): void {
  const now = Date.now()
  if (now - lastPrune < PRUNE_INTERVAL_MS) return
  lastPrune = now
  for (const [key, win] of store.entries()) {
    if (win.resetAt <= now) store.delete(key)
  }
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfter?: number   // seconds until the window resets (only set when denied)
}

/**
 * Check and increment the rate limit counter for a given key.
 *
 * @param key        Unique key (e.g. `"login:203.0.113.1"`)
 * @param limit      Maximum number of requests allowed in the window
 * @param windowMs   Window duration in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  maybePrune()

  const now = Date.now()
  const existing = store.get(key)

  if (!existing || existing.resetAt <= now) {
    // New or expired window
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1 }
  }

  if (existing.count >= limit) {
    const retryAfter = Math.ceil((existing.resetAt - now) / 1000)
    return { allowed: false, remaining: 0, retryAfter }
  }

  existing.count += 1
  return { allowed: true, remaining: limit - existing.count }
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
 * Extract the best available IP address from a Next.js request.
 * Handles Vercel edge network headers and standard proxy headers.
 * Falls back through x-forwarded-for → x-real-ip → x-vercel-forwarded-for → "unknown".
 */
export function getClientIp(request: Request): string {
  // Vercel and most CDNs use x-forwarded-for with the original client IP first
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

  // Fallback to x-real-ip (used by some proxies)
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp

  // Last resort - check if we're in a Vercel serverless function
  // Note: Vercel provides the IP in x-forwarded-for, so "unknown" indicates
  // a configuration issue if running on Vercel
  return 'unknown'
}
