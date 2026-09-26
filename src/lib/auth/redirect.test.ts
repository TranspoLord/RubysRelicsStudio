import { describe, it, expect } from 'vitest'

import {
  AUTH_CALLBACK_PATH,
  DEFAULT_AUTH_NEXT,
  buildAuthCallbackUrl,
  sanitizeAuthNextPath,
} from '@/lib/auth/redirect'

describe('sanitizeAuthNextPath', () => {
  it('keeps a simple same-origin path', () => {
    expect(sanitizeAuthNextPath('/orders/abc')).toBe('/orders/abc')
  })

  it('keeps query strings and fragments', () => {
    expect(sanitizeAuthNextPath('/checkout/success?order=42#top')).toBe(
      '/checkout/success?order=42#top'
    )
  })

  it('trims surrounding whitespace', () => {
    expect(sanitizeAuthNextPath('  /cart  ')).toBe('/cart')
  })

  it('falls back when the value is missing or empty', () => {
    expect(sanitizeAuthNextPath(undefined)).toBe(DEFAULT_AUTH_NEXT)
    expect(sanitizeAuthNextPath(null)).toBe(DEFAULT_AUTH_NEXT)
    expect(sanitizeAuthNextPath('')).toBe(DEFAULT_AUTH_NEXT)
    expect(sanitizeAuthNextPath('   ')).toBe(DEFAULT_AUTH_NEXT)
  })

  it('falls back when the value is not a string', () => {
    expect(sanitizeAuthNextPath(['/cart'])).toBe(DEFAULT_AUTH_NEXT)
    expect(sanitizeAuthNextPath({ path: '/cart' })).toBe(DEFAULT_AUTH_NEXT)
    expect(sanitizeAuthNextPath(42)).toBe(DEFAULT_AUTH_NEXT)
  })

  it('falls back for relative paths without a leading slash', () => {
    expect(sanitizeAuthNextPath('cart')).toBe(DEFAULT_AUTH_NEXT)
    expect(sanitizeAuthNextPath('..%2Fadmin')).toBe(DEFAULT_AUTH_NEXT)
  })

  it('rejects absolute and scheme URLs', () => {
    expect(sanitizeAuthNextPath('https://evil.example')).toBe(DEFAULT_AUTH_NEXT)
    expect(sanitizeAuthNextPath('http://evil.example/steal')).toBe(DEFAULT_AUTH_NEXT)
    expect(sanitizeAuthNextPath('javascript:alert(1)')).toBe(DEFAULT_AUTH_NEXT)
    expect(sanitizeAuthNextPath('data:text/html,<script>alert(1)</script>')).toBe(
      DEFAULT_AUTH_NEXT
    )
  })

  it('rejects protocol-relative and backslash variants', () => {
    expect(sanitizeAuthNextPath('//evil.example')).toBe(DEFAULT_AUTH_NEXT)
    expect(sanitizeAuthNextPath('//evil.example/path')).toBe(DEFAULT_AUTH_NEXT)
    expect(sanitizeAuthNextPath('/\\evil.example')).toBe(DEFAULT_AUTH_NEXT)
    expect(sanitizeAuthNextPath('/\\/evil.example')).toBe(DEFAULT_AUTH_NEXT)
    expect(sanitizeAuthNextPath('/admin\\..\\evil')).toBe(DEFAULT_AUTH_NEXT)
  })

  it('rejects control characters used for header injection', () => {
    expect(sanitizeAuthNextPath('/cart\r\nSet-Cookie: a=b')).toBe(DEFAULT_AUTH_NEXT)
    expect(sanitizeAuthNextPath('/cart\n/other')).toBe(DEFAULT_AUTH_NEXT)
    expect(sanitizeAuthNextPath('/cart\u0000')).toBe(DEFAULT_AUTH_NEXT)
  })

  it('rejects over-long values', () => {
    expect(sanitizeAuthNextPath(`/${'a'.repeat(600)}`)).toBe(DEFAULT_AUTH_NEXT)
  })

  it('normalizes traversal inside the origin instead of escaping it', () => {
    expect(sanitizeAuthNextPath('/shop/../cart')).toBe('/cart')
  })

  it('honours a custom fallback', () => {
    expect(sanitizeAuthNextPath('https://evil.example', '/sign-in')).toBe('/sign-in')
  })
})

describe('buildAuthCallbackUrl', () => {
  it('builds a bare callback URL when no destination is given', () => {
    expect(buildAuthCallbackUrl('https://rubysrelics.test')).toBe(
      `https://rubysrelics.test${AUTH_CALLBACK_PATH}`
    )
    expect(buildAuthCallbackUrl('https://rubysrelics.test', '/')).toBe(
      `https://rubysrelics.test${AUTH_CALLBACK_PATH}`
    )
  })

  it('carries a sanitized destination in the query string', () => {
    expect(buildAuthCallbackUrl('https://rubysrelics.test', '/orders/abc?tab=items')).toBe(
      `https://rubysrelics.test${AUTH_CALLBACK_PATH}?next=%2Forders%2Fabc%3Ftab%3Ditems`
    )
  })

  it('drops a hostile destination rather than forwarding it', () => {
    expect(buildAuthCallbackUrl('https://rubysrelics.test', '//evil.example')).toBe(
      `https://rubysrelics.test${AUTH_CALLBACK_PATH}`
    )
  })

  it('tolerates a trailing slash on the site URL', () => {
    expect(buildAuthCallbackUrl('http://localhost:3000/', '/cart')).toBe(
      `http://localhost:3000${AUTH_CALLBACK_PATH}?next=%2Fcart`
    )
  })
})
