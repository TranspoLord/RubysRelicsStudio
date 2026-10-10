import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

import {
  CSP_ANALYTICS_CONNECT_ORIGIN,
  CSP_ANALYTICS_SCRIPT_ORIGIN,
  CSP_HEADER,
  CSP_NONCE_COOKIE,
  CSP_NONCE_HEADER,
  CSP_VERCEL_LIVE_ORIGIN,
  applyCspToResponse,
  buildCspHeader,
  cspConnectOrigins,
  cspScriptOrigins,
  generateCspNonce,
  supabaseCspOrigins,
} from '@/lib/security/csp'

/**
 * The policy is the only thing standing between the CSP and the two failures
 * §7.1 records: a blocked analytics loader (every pageview and ~35 wrapped
 * events dropped) and a nonce mismatch (the page does not hydrate). Neither is
 * visible to `tsc`, so the guarantees are asserted here.
 */

/** Turns the policy into a lookup so a directive can be asserted, not string-matched. */
function directives(csp: string): Record<string, string> {
  const parsed = Object.fromEntries(
    csp.split('; ').map((part) => {
      const [name, ...sources] = part.split(' ')
      return [name, sources.join(' ')]
    })
  )
  // Guards against the bug this suite was written to catch: a source list
  // emitted without its directive name silently falls back to `default-src`.
  if (!parsed['script-src']) {
    throw new Error(`CSP has no script-src directive: ${csp}`)
  }
  return parsed
}

/** Runs the callback as if the process were a production Vercel deployment. */
function asProduction(): void {
  vi.stubEnv('NODE_ENV', 'production')
  // An unset/empty VERCEL makes isProd() treat a plain production build as prod.
  vi.stubEnv('VERCEL', '')
  vi.stubEnv('VERCEL_ENV', '')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('buildCspHeader — analytics origin (§7.1)', () => {
  it('allowlists the @vercel/analytics loader origin in production', () => {
    asProduction()
    expect(directives(buildCspHeader('nonce123'))['script-src']).toContain(
      'https://va.vercel-scripts.com'
    )
  })

  it('keeps dev/prod parity so the violation stops firing in dev and preview', () => {
    // No stubEnv: NODE_ENV is 'test' here, which takes the same branch as dev.
    expect(directives(buildCspHeader('nonce123'))['script-src']).toContain(
      'https://va.vercel-scripts.com'
    )
  })

  it('still allows the analytics beacon, or the loader would load and drop events', () => {
    const connectSrc = directives(buildCspHeader('nonce123'))['connect-src']
    expect(connectSrc).toContain(CSP_ANALYTICS_CONNECT_ORIGIN)
    for (const origin of cspConnectOrigins()) {
      expect(connectSrc).toContain(origin)
    }
  })
})

describe('buildCspHeader — nonce and hardening invariants', () => {
  it('carries the exact nonce it was given', () => {
    expect(directives(buildCspHeader('abc123'))['script-src']).toContain("'nonce-abc123'")
  })

  it("omits 'unsafe-eval' in production and includes it in development", () => {
    asProduction()
    expect(directives(buildCspHeader('n'))['script-src']).not.toContain("'unsafe-eval'")

    vi.unstubAllEnvs()
    expect(directives(buildCspHeader('n'))['script-src']).toContain("'unsafe-eval'")
  })

  it("never permits 'unsafe-inline' for scripts", () => {
    asProduction()
    expect(directives(buildCspHeader('n'))['script-src']).not.toContain("'unsafe-inline'")
    vi.unstubAllEnvs()
    expect(directives(buildCspHeader('n'))['script-src']).not.toContain("'unsafe-inline'")
  })

  it('emits well-formed directives — every source list keeps its directive name', () => {
    const parts = buildCspHeader('n').split('; ')
    // A bare source list (e.g. "'self' 'nonce-n' …" with no leading
    // `script-src`) silently falls back to `default-src`, which blocks Next's
    // own inline bootstrap and breaks hydration.
    expect(parts.filter((part) => part.startsWith('script-src '))).toHaveLength(1)
    for (const part of parts) {
      expect(part.split(' ')[0]).toMatch(/^[a-z-]+$/)
    }
  })

  it('keeps the injection-hardening directives', () => {
    const csp = directives(buildCspHeader('n'))
    expect(csp['default-src']).toBe("'self'")
    expect(csp['object-src']).toBe("'none'")
    expect(csp['base-uri']).toBe("'self'")
    expect(csp['form-action']).toBe("'self'")
    expect(csp['frame-ancestors']).toBe("'none'")
    expect(buildCspHeader('n')).toContain('upgrade-insecure-requests')
  })
})

describe('buildCspHeader — origin narrowing (OCT #69)', () => {
  it('pins connect-src to this project instead of every *.supabase.co', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://pinned.supabase.co')

    const connectSrc = directives(buildCspHeader('n'))['connect-src']

    expect(connectSrc).toContain('https://pinned.supabase.co')
    expect(connectSrc).toContain('wss://pinned.supabase.co')
    expect(connectSrc).not.toContain('*')
  })

  it('drops the server-only Resend and USPS origins from connect-src', () => {
    const connectSrc = directives(buildCspHeader('n'))['connect-src']

    expect(connectSrc).not.toContain('resend')
    expect(connectSrc).not.toContain('shippingapis')
  })

  it('allow-lists the preview toolbar only on a preview deployment', () => {
    asProduction()
    expect(cspScriptOrigins()).not.toContain(CSP_VERCEL_LIVE_ORIGIN)
    expect(directives(buildCspHeader('n'))['script-src']).not.toContain('vercel.live')
    expect(directives(buildCspHeader('n'))['frame-src']).toBe("'none'")

    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(cspScriptOrigins()).toContain(CSP_VERCEL_LIVE_ORIGIN)
    expect(directives(buildCspHeader('n'))['script-src']).toContain(CSP_VERCEL_LIVE_ORIGIN)
    expect(directives(buildCspHeader('n'))['frame-src']).toBe(CSP_VERCEL_LIVE_ORIGIN)
  })

  it('keeps the analytics loader in every environment', () => {
    asProduction()
    expect(cspScriptOrigins()).toContain(CSP_ANALYTICS_SCRIPT_ORIGIN)
  })
})

describe('supabaseCspOrigins (OCT #69)', () => {
  it('derives the https + websocket origins from the project URL', () => {
    expect(supabaseCspOrigins('https://abc.supabase.co')).toEqual([
      'https://abc.supabase.co',
      'wss://abc.supabase.co',
    ])
  })

  it('keeps the scheme for a local Supabase (http + ws)', () => {
    expect(supabaseCspOrigins('http://127.0.0.1:54321')).toEqual([
      'http://127.0.0.1:54321',
      'ws://127.0.0.1:54321',
    ])
  })

  it('fails closed rather than widening for a missing or malformed URL', () => {
    expect(supabaseCspOrigins(undefined)).toEqual([])
    expect(supabaseCspOrigins('')).toEqual([])
    expect(supabaseCspOrigins('not-a-url')).toEqual([])
    expect(supabaseCspOrigins('ftp://abc.supabase.co')).toEqual([])
  })
})

describe('generateCspNonce', () => {
  it('returns 32 hex characters and does not repeat', () => {
    const nonces = new Set(Array.from({ length: 25 }, () => generateCspNonce()))
    expect(nonces.size).toBe(25)
    for (const nonce of nonces) {
      expect(nonce).toMatch(/^[0-9a-f]{32}$/)
    }
  })
})

describe('applyCspToResponse', () => {
  it('writes the policy, the nonce header and the cookie from one value', () => {
    const nonce = 'deadbeef'
    const response = applyCspToResponse(NextResponse.next(), nonce)

    expect(response.headers.get(CSP_HEADER)).toBe(buildCspHeader(nonce))
    expect(response.headers.get(CSP_NONCE_HEADER)).toBe(nonce)
    // The layout falls back to this cookie, so it must match the header nonce
    // exactly — a drift here is the unhydrated-page failure mode (§7.1/§7.6).
    expect(response.cookies.get(CSP_NONCE_COOKIE)?.value).toBe(nonce)
    expect(response.headers.get(CSP_HEADER)).toContain(`'nonce-${nonce}'`)
  })

  it('marks the nonce cookie httpOnly, SameSite=Strict and path-scoped', () => {
    const setCookie = applyCspToResponse(NextResponse.next(), 'n1').headers.get('set-cookie') ?? ''
    expect(setCookie).toContain(`${CSP_NONCE_COOKIE}=n1`)
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=strict')
    expect(setCookie).toContain('Path=/')
    expect(setCookie).toContain('Max-Age=60')
  })

  it('adds Secure only on an https deployment, so http://localhost dev keeps working', () => {
    expect(applyCspToResponse(NextResponse.next(), 'n1').headers.get('set-cookie')).not.toContain(
      'Secure'
    )

    asProduction()
    expect(applyCspToResponse(NextResponse.next(), 'n1').headers.get('set-cookie')).toContain(
      'Secure'
    )
  })

  it('adds Secure on a Vercel preview too (OCT #69)', () => {
    // NODE_ENV is 'test' and VERCEL_ENV is 'preview': isProd() is false, but the
    // deployment is https, so the cookie must still be Secure.
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('VERCEL_ENV', 'preview')

    expect(applyCspToResponse(NextResponse.next(), 'n1').headers.get('set-cookie')).toContain(
      'Secure'
    )
  })
})
