import { describe, expect, it } from 'vitest'

import nextConfig from '../../../next.config'
import { supabaseRemotePatterns } from '@/lib/security/remote-patterns'
import { readSourceFile, stripComments } from '@/lib/testing/source-contract'

/**
 * OCT #69: the static headers and the image proxy.
 *
 * `next.config.ts` is not covered by any other test — a wrong header value or a
 * wildcard image hostname only shows up in a browser or on a bill, so the
 * contract is asserted here.
 */
const source = stripComments(readSourceFile('next.config.ts'))

async function headerValue(key: string): Promise<string | undefined> {
  const rules = nextConfig.headers ? await nextConfig.headers() : []
  return rules[0]?.headers.find((header) => header.key === key)?.value
}

describe('next.config — Permissions-Policy (OCT #69)', () => {
  it('drops the Stripe payment origin that outlived Stripe', async () => {
    expect(await headerValue('Permissions-Policy')).toBe(
      'camera=(), microphone=(), geolocation=(), payment=()'
    )
    expect(source).not.toMatch(/stripe/i)
  })

  it('keeps the other hardening headers', async () => {
    expect(await headerValue('X-Content-Type-Options')).toBe('nosniff')
    expect(await headerValue('X-Frame-Options')).toBe('DENY')
    expect(await headerValue('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(await headerValue('Strict-Transport-Security')).toContain('max-age=')
  })
})

describe('next.config — image proxy (OCT #69)', () => {
  it('has no *.supabase.co wildcard in the source', () => {
    expect(source).not.toContain('*.supabase.co')
  })

  it('pins remotePatterns to this project', () => {
    const patterns = nextConfig.images?.remotePatterns ?? []

    expect(patterns).toEqual(supabaseRemotePatterns())
    for (const pattern of patterns) {
      expect(String(pattern.hostname)).not.toContain('*')
    }
  })
})
