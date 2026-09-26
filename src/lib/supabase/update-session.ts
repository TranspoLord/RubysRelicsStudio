import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { readAuthClaims, type AuthClaims } from '@/lib/auth/claims'
import { getSupabasePublishableKey, getSupabaseUrl } from '@/lib/supabase/env'
import type { Database } from '@/types/database'

export interface SupabaseSessionRefresh {
  /** Verified claims, or `null` when there is no verifiable session. */
  claims: AuthClaims | null
  /** Pass-through response carrying any rotated auth cookies (and their cache headers). */
  response: NextResponse
}

/**
 * Rotates the Supabase session cookies for this request and returns the
 * verified claims.
 *
 * Unlike `updateSupabaseSession`, this does **not** swallow failures: the admin
 * Edge gate (§10.5) must fail closed, while the storefront only needs the
 * refresh as a convenience.
 *
 * Why this exists: Next.js Server Components cannot write cookies, so an
 * expired access token can never be rotated during a render. Calling this from
 * middleware/proxy is what keeps a signed-in session alive — including on
 * `/admin`, which is why the admin branch of the middleware uses it too.
 */
export async function refreshSupabaseSession(request: NextRequest): Promise<SupabaseSessionRefresh> {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          // Keep the incoming request cookies in sync so downstream Server
          // Components in the same pass see the refreshed tokens...
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })

          // ...and write them to the outgoing response.
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
          Object.entries(headers).forEach(([key, value]) => {
            response.headers.set(key, value)
          })
        },
      },
    }
  )

  // Triggers the refresh (and therefore the cookie write above) when the
  // access token is close to expiring. No session cookies means no network
  // call, so anonymous traffic stays cheap.
  const { data } = await supabase.auth.getClaims()

  return { claims: readAuthClaims(data?.claims), response }
}

/**
 * Refreshes the Supabase session cookie on every request and returns the
 * response that carries the refreshed cookies.
 *
 * The returned response also carries the cache headers that `@supabase/ssr`
 * 0.12+ emits alongside auth cookies (`Cache-Control: private, no-store`, ...)
 * so a CDN can never serve one user's session cookies to another user.
 *
 * Returns `null` when Supabase is not configured or the refresh failed. That
 * is a fail-open for *session convenience* only — every server-side
 * authorization decision must still call `getClaims()`/`getUser()` itself.
 */
export async function updateSupabaseSession(request: NextRequest): Promise<NextResponse | null> {
  try {
    const { response } = await refreshSupabaseSession(request)
    return response
  } catch (error) {
    console.error('[Supabase] session refresh skipped:', error)
    return null
  }
}
