import { describe, expect, it } from 'vitest'

import {
  asAbsoluteImageUrl,
  buildAbsoluteUrl,
  getStorefrontStaticPaths,
  SITE_NAME,
} from '@/lib/seo/site'

const ORIGIN = 'https://rubysrelicsstudio.com'

describe('§2.10 SEO site primitives', () => {
  it('lists only indexable storefront routes', () => {
    const paths = getStorefrontStaticPaths()
    expect(paths).toContain('/')
    expect(paths).toContain('/shop')
    expect(paths).toContain('/resources')

    // Transactional / private / auth surfaces are never invited into the sitemap.
    for (const excluded of ['/cart', '/checkout', '/admin', '/api', '/sign-in', '/orders', '/auth']) {
      expect(paths, excluded).not.toContain(excluded)
    }

    // No duplicate entries.
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('resolves absolute URLs against the canonical origin', () => {
    expect(buildAbsoluteUrl('/shop/all', ORIGIN)).toBe('https://rubysrelicsstudio.com/shop/all')
    expect(buildAbsoluteUrl('/', ORIGIN)).toBe('https://rubysrelicsstudio.com/')
  })

  it('keeps only absolute http(s) image URLs', () => {
    expect(asAbsoluteImageUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png')
    expect(asAbsoluteImageUrl('/relative.png')).toBeUndefined()
    expect(asAbsoluteImageUrl(null)).toBeUndefined()
    expect(asAbsoluteImageUrl('')).toBeUndefined()
  })

  it('exposes the site name', () => {
    expect(SITE_NAME).toBe("Ruby's Relics Studio")
  })
})