import { NextResponse, type NextRequest } from 'next/server'

import { sanitizeAuthNextPath } from '@/lib/auth/redirect'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// The code exchange sets session cookies, so this route must never be cached
// or statically optimized.
export const dynamic = 'force-dynamic'

function noStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'private, no-store, max-age=0')
  return response
}

function errorRedirect(origin: string, reason: string): NextResponse {
  const url = new URL('/auth/auth-error', origin)
  url.searchParams.set('reason', reason)
  return noStore(NextResponse.redirect(url))
}

/**
 * OAuth callback (PKCE code exchange).
 *
 * Google → Supabase Auth → here with `?code=...`. The code is exchanged for a
 * session that `@supabase/ssr` writes into cookies, then the user is sent to
 * the sanitized `next` destination (default `/`).
 *
 * Failure modes are all funnelled to `/auth/auth-error`:
 *   - the user cancelled on Google's consent screen (`error_description`)
 *   - Supabase rejected the redirect (`error_code`)
 *   - the code was missing, expired, or already used
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl

  const providerError =
    searchParams.get('error_description') ??
    searchParams.get('error') ??
    searchParams.get('error_code')

  if (providerError) {
    return errorRedirect(origin, providerError)
  }

  const code = searchParams.get('code')
  if (!code) {
    return errorRedirect(
      origin,
      'The sign-in link was incomplete. Please start the sign-in process again.'
    )
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return errorRedirect(origin, error.message)
  }

  // `next` is a validated same-origin path, so this cannot leave the site.
  const destination = new URL(sanitizeAuthNextPath(searchParams.get('next')), origin)
  return noStore(NextResponse.redirect(destination))
}
