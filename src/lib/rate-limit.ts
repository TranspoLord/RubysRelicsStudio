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
 * Falls back through x-forwarded-for → x-real-ip → "unknown".
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}
