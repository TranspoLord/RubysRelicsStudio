'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

import { getSupabasePublishableKey, getSupabaseUrl } from '@/lib/supabase/env'
import type { Database } from '@/types/database'

/**
 * Browser Supabase client (Client Components / hooks only).
 *
 * `@supabase/ssr` persists the session in cookies instead of localStorage, so
 * a Server Component on the next request can render the signed-in state. The
 * client is created once per browser tab and reused, which keeps the auth
 * listener and PKCE code-verifier storage consistent across components.
 */
let browserClient: SupabaseClient<Database> | null = null

export function getBrowserSupabaseClient(): SupabaseClient<Database> {
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(
      getSupabaseUrl(),
      getSupabasePublishableKey(),
      {
        // OCT #69: match the server's cookie attributes. `Secure` can only be
        // decided at runtime here, and it must be *off* on http://localhost or
        // the browser drops the session cookie and sign-in appears to work but
        // never persists.
        cookieOptions: {
          secure: typeof window !== 'undefined' && window.location.protocol === 'https:',
          sameSite: 'lax',
          path: '/',
        },
      }
    )
  }
  return browserClient
}
