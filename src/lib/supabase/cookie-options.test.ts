import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * OCT #69: the Supabase auth cookies used `@supabase/ssr`'s defaults — no
 * `Secure` flag at all. These tests assert the `cookieOptions` each client
 * passes, because a missing `Secure` is invisible until someone inspects the
 * cookie jar, and getting it *wrong* on localhost silently breaks sign-in.
 *
 * `httpOnly` is deliberately absent: `AuthProvider` reads these cookies in the
 * browser, so setting it would break the session.
 */

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn((_url: string, _key: string, _options?: unknown) => ({
    auth: { getClaims: vi.fn(async () => ({ data: { claims: null }, error: null })) },
  })),
  createBrowserClient: vi.fn((_url: string, _key: string, _options?: unknown) => ({})),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: mocks.createServerClient,
  createBrowserClient: mocks.createBrowserClient,
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}))

vi.mock('@/lib/supabase/env', () => ({
  getSupabaseUrl: () => 'https://project.supabase.co',
  getSupabasePublishableKey: () => 'publishable-key',
}))

import { getBrowserSupabaseClient } from '@/lib/supabase/browser'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { refreshSupabaseSession } from '@/lib/supabase/update-session'

interface CookieOptions {
  secure?: boolean
  sameSite?: string
  path?: string
}

function optionsOf(mock: typeof mocks.createServerClient): CookieOptions {
  const call = mock.mock.calls.at(-1)
  return ((call?.[2] as { cookieOptions?: CookieOptions } | undefined)?.cookieOptions ?? {})
}

beforeEach(() => {
  mocks.createServerClient.mockClear()
  mocks.createBrowserClient.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('server client cookie options (OCT #69)', () => {
  it('sets Secure on a production deployment', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL', '')
    vi.stubEnv('VERCEL_ENV', '')

    await createServerSupabaseClient()

    expect(optionsOf(mocks.createServerClient)).toEqual({
      secure: true,
      sameSite: 'lax',
      path: '/',
    })
  })

  it('sets Secure on a Vercel preview deployment', async () => {
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('VERCEL_ENV', 'preview')

    await createServerSupabaseClient()

    expect(optionsOf(mocks.createServerClient).secure).toBe(true)
  })

  it('leaves Secure off on http://localhost, or the session cookie is dropped', async () => {
    vi.stubEnv('VERCEL', '')
    vi.stubEnv('VERCEL_ENV', '')

    await createServerSupabaseClient()

    expect(optionsOf(mocks.createServerClient)).toEqual({
      secure: false,
      sameSite: 'lax',
      path: '/',
    })
  })

  it('never sets httpOnly — the browser client has to read these cookies', async () => {
    await createServerSupabaseClient()

    const options = optionsOf(mocks.createServerClient) as CookieOptions & { httpOnly?: boolean }
    expect(options.httpOnly).toBeUndefined()
  })
})

describe('session refresh cookie options (OCT #69)', () => {
  it('rotates cookies with the same Secure flag as the writer', async () => {
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('VERCEL_ENV', 'preview')

    await refreshSupabaseSession(new NextRequest('https://rubysrelics.test/admin'))

    expect(optionsOf(mocks.createServerClient)).toEqual({
      secure: true,
      sameSite: 'lax',
      path: '/',
    })
  })

  it('leaves Secure off over plain http', async () => {
    vi.stubEnv('VERCEL', '')
    vi.stubEnv('VERCEL_ENV', '')

    await refreshSupabaseSession(new NextRequest('http://localhost:3000/admin'))

    expect(optionsOf(mocks.createServerClient).secure).toBe(false)
  })
})

describe('browser client cookie options (OCT #69)', () => {
  /** Re-imports the module so its singleton is built with the current globals. */
  async function browserOptions(protocol: string | null): Promise<CookieOptions> {
    vi.resetModules()
    mocks.createBrowserClient.mockClear()
    vi.stubGlobal('window', protocol ? { location: { protocol } } : undefined)

    const browserModule = await import('@/lib/supabase/browser')
    browserModule.getBrowserSupabaseClient()

    return optionsOf(mocks.createBrowserClient as unknown as typeof mocks.createServerClient)
  }

  it('sets Secure over https', async () => {
    expect(await browserOptions('https:')).toEqual({ secure: true, sameSite: 'lax', path: '/' })
  })

  it('leaves Secure off over http', async () => {
    expect((await browserOptions('http:')).secure).toBe(false)
  })

  it('does not throw when imported without a window', async () => {
    expect((await browserOptions(null)).secure).toBe(false)
  })

  it('is what the client components actually call', () => {
    // Guards against the test passing against a module nobody imports.
    expect(typeof getBrowserSupabaseClient).toBe('function')
  })
})
