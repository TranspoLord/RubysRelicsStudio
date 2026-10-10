/**
 * Sign-in failure vocabulary (OCT #68).
 *
 * `/auth/auth-error` used to render whatever text the provider or Supabase put
 * in `?reason=` — up to 300 characters, verbatim, on the shop's own domain.
 * React escaped it, so there was never an XSS, but
 * `…/auth/auth-error?reason=Your order payment failed. Call +1-555-… to re-enter
 * your card` is a credible phishing lure that arrives on the real origin.
 *
 * The callback now maps every failure to one of the codes below, logs the raw
 * provider text server-side, and the page renders fixed copy per code. The raw
 * text never reaches the browser, so the query string carries no attacker-chosen
 * sentence for the page to display.
 */

export const AUTH_ERROR_CODES = [
  /** The visitor closed Google's consent screen (`error=access_denied`). */
  'cancelled',
  /** The callback had no `code` — a truncated or hand-edited link. */
  'link_incomplete',
  /** `exchangeCodeForSession()` failed: expired, already used, or mismatched. */
  'exchange_failed',
  /** Supabase or Google returned an error that is not a cancellation. */
  'provider_error',
] as const

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number]

/** Query parameter carrying the code. Deliberately **not** the retired `reason`. */
export const AUTH_ERROR_QUERY_PARAM = 'code'

/** Where the callback sends a failed sign-in. */
export const AUTH_ERROR_PATH = '/auth/auth-error'

/** Fixed copy per code. Never derived from caller input. */
const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  cancelled:
    'You closed the Google window before finishing, so we did not sign you in. Nothing was charged or changed — try again whenever you are ready.',
  link_incomplete:
    'That sign-in link was missing part of what it needs. Start the sign-in process again and it will work.',
  exchange_failed:
    'We could not complete the sign-in. The link may have expired or already been used — start again to get a fresh one.',
  provider_error: 'Google could not complete the sign-in. Please try again in a moment.',
}

/** Shown when no code is present, or when the code is not one we recognise. */
export const AUTH_ERROR_FALLBACK_MESSAGE =
  'Something went wrong while completing sign-in. Please try again with Google.'

/**
 * Narrows an untrusted `code` value (query string, so `string | string[]`).
 * Unknown, absent and malformed values all return `null` → fallback copy.
 */
export function readAuthErrorCode(value: unknown): AuthErrorCode | null {
  if (typeof value !== 'string') return null

  const candidate = value.trim().toLowerCase()
  return (AUTH_ERROR_CODES as readonly string[]).includes(candidate)
    ? (candidate as AuthErrorCode)
    : null
}

/** Fixed copy for a (possibly untrusted) code value. */
export function authErrorMessage(code: unknown): string {
  const known = readAuthErrorCode(code)
  return known ? AUTH_ERROR_MESSAGES[known] : AUTH_ERROR_FALLBACK_MESSAGE
}

/**
 * Classifies a provider failure. A cancelled consent screen is the common case
 * and deserves calmer copy than a real error, so it gets its own code.
 */
export function classifyProviderError(raw: unknown): AuthErrorCode {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (value === 'access_denied' || value.includes('cancel') || value.includes('denied')) {
    return 'cancelled'
  }
  return 'provider_error'
}
