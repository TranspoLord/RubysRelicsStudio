import { describe, expect, it } from 'vitest'

import {
  SUPABASE_IMAGE_PATHNAME,
  supabaseRemotePatterns,
} from '@/lib/security/remote-patterns'

/**
 * OCT #69: `images.remotePatterns` used to allow `*.supabase.co`, so
 * `/_next/image?url=https://<any-project>.supabase.co/…` made this deployment
 * resize a third party's images under the shop's domain (and spend its Vercel
 * image quota). The hostname is now pinned to this project.
 */
describe('supabaseRemotePatterns', () => {
  it('pins the project hostname, with no wildcard', () => {
    expect(supabaseRemotePatterns('https://cvkhrpejzsnzsjffrvnr.supabase.co')).toEqual([
      {
        protocol: 'https',
        hostname: 'cvkhrpejzsnzsjffrvnr.supabase.co',
        pathname: SUPABASE_IMAGE_PATHNAME,
      },
    ])
  })

  it('keeps the scheme for a local Supabase', () => {
    expect(supabaseRemotePatterns('http://127.0.0.1:54321')[0]).toMatchObject({
      protocol: 'http',
      hostname: '127.0.0.1',
    })
  })

  it('only ever exposes public objects', () => {
    for (const pattern of supabaseRemotePatterns('https://abc.supabase.co')) {
      expect(pattern.pathname).toBe('/storage/v1/object/public/**')
      expect(pattern.pathname).not.toContain('sign')
    }
  })

  it('fails closed for a missing or malformed URL instead of widening to a wildcard', () => {
    expect(supabaseRemotePatterns(undefined)).toEqual([])
    expect(supabaseRemotePatterns('')).toEqual([])
    expect(supabaseRemotePatterns('not-a-url')).toEqual([])
    expect(supabaseRemotePatterns('ftp://abc.supabase.co')).toEqual([])
  })

  it('never emits a wildcard hostname, whatever it is given', () => {
    const inputs = [
      'https://abc.supabase.co',
      'https://*.supabase.co',
      'http://127.0.0.1:54321',
      undefined,
    ]

    for (const input of inputs) {
      for (const pattern of supabaseRemotePatterns(input)) {
        expect(pattern.hostname).not.toContain('*')
      }
    }

    // A wildcard input is refused outright, not narrowed silently.
    expect(supabaseRemotePatterns('https://*.supabase.co')).toEqual([])
  })
})
