import { describe, expect, it } from 'vitest'

import { ADMIN_NEXT_FALLBACK, sanitizeAdminNextPath } from '@/lib/auth/redirect'

/**
 * The admin login's `next` guard (SEPT_IMPLEMENTATION_PLAN §10.4).
 *
 * The generic sanitizer is covered in `redirect.test.ts`; this file covers the
 * extra rule an admin login adds — the destination must stay inside `/admin`,
 * so an OAuth round trip can never hand an admin session to a storefront or API
 * route. The admin-role checks themselves are in `lib/admin/edge-gate.test.ts`.
 */
describe('sanitizeAdminNextPath', () => {
  it('keeps a destination inside /admin', () => {
    expect(sanitizeAdminNextPath('/admin')).toBe('/admin')
    expect(sanitizeAdminNextPath('/admin/homepage')).toBe('/admin/homepage')
    expect(sanitizeAdminNextPath('/admin/catalog/products?page=2')).toBe(
      '/admin/catalog/products?page=2'
    )
  })

  it('falls back when no usable destination is supplied', () => {
    expect(sanitizeAdminNextPath(undefined)).toBe(ADMIN_NEXT_FALLBACK)
    expect(sanitizeAdminNextPath(null)).toBe(ADMIN_NEXT_FALLBACK)
    expect(sanitizeAdminNextPath('')).toBe(ADMIN_NEXT_FALLBACK)
    expect(sanitizeAdminNextPath(42)).toBe(ADMIN_NEXT_FALLBACK)
    expect(sanitizeAdminNextPath('not-a-path')).toBe(ADMIN_NEXT_FALLBACK)
  })

  it('refuses to leave the panel even for a same-origin path', () => {
    expect(sanitizeAdminNextPath('/cart')).toBe(ADMIN_NEXT_FALLBACK)
    expect(sanitizeAdminNextPath('/sign-in')).toBe(ADMIN_NEXT_FALLBACK)
    expect(sanitizeAdminNextPath('/api/keys')).toBe(ADMIN_NEXT_FALLBACK)
    expect(sanitizeAdminNextPath('/api/admin/orders')).toBe(ADMIN_NEXT_FALLBACK)
    // A near-miss prefix must not count as "inside /admin".
    expect(sanitizeAdminNextPath('/administrator')).toBe(ADMIN_NEXT_FALLBACK)
  })

  it('still rejects off-site, protocol-relative and traversal values', () => {
    expect(sanitizeAdminNextPath('https://evil.example/admin')).toBe(ADMIN_NEXT_FALLBACK)
    expect(sanitizeAdminNextPath('//evil.example/admin')).toBe(ADMIN_NEXT_FALLBACK)
    expect(sanitizeAdminNextPath('/\\evil.example')).toBe(ADMIN_NEXT_FALLBACK)
    expect(sanitizeAdminNextPath('/admin/../cart')).toBe(ADMIN_NEXT_FALLBACK)
    expect(sanitizeAdminNextPath('/admin%2F..%2Fcart')).toBe(ADMIN_NEXT_FALLBACK)
  })

  it('honours a caller-supplied fallback', () => {
    expect(sanitizeAdminNextPath('/cart', '/admin/orders')).toBe('/admin/orders')
    expect(sanitizeAdminNextPath(undefined, '/admin/orders')).toBe('/admin/orders')
  })
})
