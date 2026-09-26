import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

import { getSupabasePublishableKey, getSupabaseUrl } from '@/lib/supabase/env'
import type { Database } from '@/types/database'

/**
 * Server Supabase client for Server Components, Server Actions and Route
 * Handlers.
 *
 * Always call this once per request — never cache or share the instance,
 * because it is bound to the request's cookie store.
 *
 * Identity checks must use `supabase.auth.getClaims()` (preferred) or
 * `getUser()`. `getSession()` reads the cookie without re-validating the JWT,
 * so it is only suitable for non-authoritative UI state.
 */
export async function createServerSupabaseClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies()

  return createServerClient<Database>(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Server Components cannot write cookies. The refresh performed by
          // src/middleware.ts is what keeps the session alive; swallowing the
          // write here is the documented @supabase/ssr pattern.
        }
      },
    },
  })
}
