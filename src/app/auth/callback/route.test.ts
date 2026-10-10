import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The OAuth callback (OCT #66 defence-in-depth, OCT #68 error vocabulary).
 *
 * Two guarantees:
 *   1. every failure is reported as a **code**, never as the provider's text —
 *      `?reason=` on the error page was a phishing aid;
 *   2. the success redirect can only ever leave this origin's `/` when `next` is
 *      hostile, whatever the sanitizer does.
 */

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  safeLogError: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { exchangeCodeForSession: mocks.exchangeCodeForSession },
  })),
}))

vi.mock('@/lib/security/logger', () => ({ safeLogError: mocks.safeLogError }))

import { GET } from './route'

const ORIGIN = 'https://rubysrelics.test'

function callback(query: string) {
  return new NextRequest(`${ORIGIN}/auth/callback${query}`)
}

function locationOf(response: Response): string {
  return response.headers.get('location') ?? ''
}

beforeEach(() => {
  mocks.exchangeCodeForSession.mockReset().mockResolvedValue({ error: null })
  mocks.safeLogError.mockReset()
})

describe('GET /auth/callback — failure codes (OCT #68)', () => {
  it('reports a cancelled consent screen as `cancelled`, without the provider text', async () => {
    const response = await GET(
      callback('?error=access_denied&error_description=The+user+denied+the+request')
    )

    const location = locationOf(response)
    expect(location).toBe(`${ORIGIN}/auth/auth-error?code=cancelled`)
    expect(location).not.toMatch(/denied|user/i)
  })

  it('reports an unrecognised provider error as `provider_error`, without the provider text', async () => {
    const response = await GET(callback('?error_description=Call%20us%20at%20%2B1-555-0000'))

    const location = locationOf(response)
    expect(location).toBe(`${ORIGIN}/auth/auth-error?code=provider_error`)
    expect(location).not.toContain('Call')
  })

  it('treats an `error_code` from Supabase as a provider error', async () => {
    const response = await GET(callback('?error_code=otp_expired'))

    expect(locationOf(response)).toBe(`${ORIGIN}/auth/auth-error?code=provider_error`)
  })

  it('reports a missing code as `link_incomplete`', async () => {
    const response = await GET(callback(''))

    expect(locationOf(response)).toBe(`${ORIGIN}/auth/auth-error?code=link_incomplete`)
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('reports a failed exchange as `exchange_failed` and logs the raw reason', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      error: { message: 'invalid request: both auth code and code verifier should be non-empty' },
    })

    const response = await GET(callback('?code=stale-code'))

    const location = locationOf(response)
    expect(location).toBe(`${ORIGIN}/auth/auth-error?code=exchange_failed`)
    expect(location).not.toContain('verifier')
    expect(mocks.safeLogError).toHaveBeenCalledWith(
      '[auth:callback]',
      expect.stringContaining('code verifier')
    )
  })

  it('never caches an error redirect', async () => {
    const response = await GET(callback('?error=access_denied'))

    expect(response.headers.get('cache-control')).toContain('no-store')
  })
})

describe('GET /auth/callback — success redirect (OCT #66)', () => {
  it('sends a signed-in visitor to the sanitized destination', async () => {
    const response = await GET(callback('?code=fresh&next=%2Forders%2Fabc%3Ftab%3Ditems'))

    expect(locationOf(response)).toBe(`${ORIGIN}/orders/abc?tab=items`)
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith('fresh')
  })

  it('defaults to the site root when no destination is supplied', async () => {
    const response = await GET(callback('?code=fresh'))

    expect(locationOf(response)).toBe(`${ORIGIN}/`)
  })

  it.each([
    '/.%2F%2Fevil.com',
    '/..%2F%2Fevil.com',
    '/%2F%2Fevil.com',
    '%2F%2Fevil.com',
    'https%3A%2F%2Fevil.com',
  ])('refuses to leave the origin for next=%s', async (hostile) => {
    const response = await GET(callback(`?code=fresh&next=${hostile}`))

    const location = locationOf(response)
    expect(location.startsWith(`${ORIGIN}/`)).toBe(true)
    expect(location).not.toContain('evil.com')
  })
})
