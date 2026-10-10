import { describe, expect, it } from 'vitest'

import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_FALLBACK_MESSAGE,
  AUTH_ERROR_QUERY_PARAM,
  authErrorMessage,
  classifyProviderError,
  readAuthErrorCode,
} from '@/lib/auth/auth-error'
import { readSourceFile, stripComments } from '@/lib/testing/source-contract'

/**
 * OCT #68: the sign-in failure vocabulary.
 *
 * The property that matters is negative — no code, and no unrecognised value,
 * can make the page render caller-supplied text. The source contract at the
 * bottom pins the other half: the page must not go back to reading `?reason=`.
 */
describe('readAuthErrorCode', () => {
  it('accepts every declared code', () => {
    for (const code of AUTH_ERROR_CODES) {
      expect(readAuthErrorCode(code)).toBe(code)
    }
  })

  it('normalizes case and whitespace', () => {
    expect(readAuthErrorCode('  Cancelled ')).toBe('cancelled')
  })

  it('returns null for absent, malformed and hostile values', () => {
    expect(readAuthErrorCode(undefined)).toBeNull()
    expect(readAuthErrorCode(null)).toBeNull()
    expect(readAuthErrorCode('')).toBeNull()
    expect(readAuthErrorCode(['cancelled'])).toBeNull()
    expect(readAuthErrorCode(42)).toBeNull()
    expect(readAuthErrorCode('Call us at +1-555-0000')).toBeNull()
    expect(readAuthErrorCode('cancelled; <script>')).toBeNull()
  })
})

describe('authErrorMessage', () => {
  it('renders fixed copy for a known code', () => {
    const message = authErrorMessage('link_incomplete')

    expect(message).not.toBe(AUTH_ERROR_FALLBACK_MESSAGE)
    expect(message).toMatch(/start the sign-in process again/i)
  })

  it('falls back for anything else, and never echoes the input', () => {
    const hostile = 'Your order payment failed. Call +1-555-0000 to re-enter your card'

    expect(authErrorMessage(hostile)).toBe(AUTH_ERROR_FALLBACK_MESSAGE)
    expect(authErrorMessage(undefined)).toBe(AUTH_ERROR_FALLBACK_MESSAGE)
    expect(authErrorMessage(['cancelled'])).toBe(AUTH_ERROR_FALLBACK_MESSAGE)
    expect(authErrorMessage(hostile)).not.toContain('555')
  })

  it('keeps every message free of raw provider text', () => {
    for (const code of AUTH_ERROR_CODES) {
      expect(authErrorMessage(code)).not.toMatch(/error_description|access_denied|code=/i)
    }
  })
})

describe('classifyProviderError', () => {
  it('treats a cancelled consent screen as `cancelled`', () => {
    expect(classifyProviderError('access_denied')).toBe('cancelled')
    expect(classifyProviderError('The user cancelled the sign-in')).toBe('cancelled')
    expect(classifyProviderError('user denied')).toBe('cancelled')
  })

  it('treats anything else as `provider_error`', () => {
    expect(classifyProviderError('invalid_request')).toBe('provider_error')
    expect(classifyProviderError(undefined)).toBe('provider_error')
    expect(classifyProviderError({ message: 'boom' })).toBe('provider_error')
  })
})

describe('/auth/auth-error source contract (OCT #68)', () => {
  const page = stripComments(readSourceFile('src/app/auth/auth-error/page.tsx'))
  const callback = stripComments(readSourceFile('src/app/auth/callback/route.ts'))

  it('the page reads a code, never the retired `reason` parameter', () => {
    expect(page).toContain('authErrorMessage(')
    expect(page).toContain('{ code?: string }')
    expect(page).not.toMatch(/reason/)
  })

  it('the callback sets the code parameter and never forwards provider text', () => {
    expect(callback).toContain('AUTH_ERROR_QUERY_PARAM')
    expect(callback).toMatch(/errorRedirect\(/)
    // The raw values only ever reach the logger.
    expect(callback).toContain('safeLogError(')
    expect(callback).not.toMatch(/searchParams\.set\('reason'/)
  })
})
