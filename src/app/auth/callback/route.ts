import { NextResponse, type NextRequest } from 'next/server'

import {
  AUTH_ERROR_PATH,
  AUTH_ERROR_QUERY_PARAM,
  classifyProviderError,
  type AuthErrorCode,
} from '@/lib/auth/auth-error'
import { DEFAULT_AUTH_NEXT, sanitizeAuthNextPath } from '@/lib/auth/redirect'
import { safeLogError } from '@/lib/security/logger'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// The code exchange sets session cookies, so this route must never be cached
// or statically optimized.
export const dynamic = 'force-dynamic'

function noStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'private, no-store, max-age=0')
  return response
}

/**
 * Sends the browser to `/auth/auth-error` with a **code**, never with the text
 * the provider sent (OCT #68). The raw value is logged through `safeLogError`
 * so the failure is still diagnosable from the server logs.
 */
function errorRedirect(origin: string, code: AuthErrorCode, raw?: unknown): NextResponse {
  if (raw !== undefined) {
    safeLogError('[auth:callback]', raw)
  }

  const url = new URL(AUTH_ERROR_PATH, origin)
  url.searchParams.set(AUTH_ERROR_QUERY_PARAM, code)
  return noStore(NextResponse.redirect(url))
}

/**
 * OAuth callback (PKCE code exchange).
 *
 * Google → Supabase Auth → here with `?code=...`. The code is exchanged for a
 * session that `@supabase/ssr` writes into cookies, then the user is sent to
 * the sanitized `next` destination (default `/`).
 *
 * Failure modes are all funnelled to `/auth/auth-error` as a code:
 *   - the user cancelled on Google's consent screen → `cancelled`
 *   - the callback arrived without a `code` → `link_incomplete`
 *   - Supabase rejected the code (expired / reused) → `exchange_failed`
 *   - anything else from the provider → `provider_error`
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl

  // `error` is read first on purpose: Google sends `error=access_denied` for a
  // cancelled consent screen and only sometimes accompanies it with a
  // human-readable `error_description`.
  const providerError =
    searchParams.get('error') ??
    searchParams.get('error_code') ??
    searchParams.get('error_description')

  if (providerError) {
    return errorRedirect(origin, classifyProviderError(providerError), providerError)
  }

  const code = searchParams.get('code')
  if (!code) {
    return errorRedirect(origin, 'link_incomplete')
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return errorRedirect(origin, 'exchange_failed', error.message)
  }

  // `next` is a validated same-origin path, so this cannot leave the site.
  const destination = new URL(sanitizeAuthNextPath(searchParams.get('next')), origin)

  // Defence in depth (OCT #66): the sanitizer is the authority, but assert the
  // resolution stayed on this origin before handing the browser a `Location`.
  // `new URL('//evil.com', origin)` — which is what a dot-segment bypass such as
  // `/.//evil.com` used to produce — would resolve to another site.
  if (destination.origin !== origin) {
    safeLogError('[auth:callback]', new Error('Refused an off-origin next destination.'))
    return noStore(NextResponse.redirect(new URL(DEFAULT_AUTH_NEXT, origin)))
  }

  return noStore(NextResponse.redirect(destination))
}
