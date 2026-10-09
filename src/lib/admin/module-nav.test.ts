import { describe, expect, it } from 'vitest'

import { activeAdminModuleLabel, resolveActiveAdminHref } from '@/lib/admin/module-nav'

/**
 * The hrefs the panel actually ships (`ADMIN_MODULES` in
 * `src/lib/admin/admin-modules.ts`), so the matrix below is the real one.
 */
const ADMIN_MODULE_HREFS = [
  '/admin',
  '/admin/custom-requests',
  '/admin/orders',
  '/admin/catalog',
  '/admin/pricing',
  '/admin/inventory',
  '/admin/shipping',
  '/admin/finance',
  '/admin/settings',
  '/admin/schedule',
  '/admin/abandoned-carts',
  '/admin/homepage',
] as const

describe('activeAdminModuleLabel (§9.10)', () => {
  const modules = [
    { label: 'Dashboard', href: '/admin' },
    { label: 'Orders', href: '/admin/orders' },
    { label: 'Catalog', href: '/admin/catalog' },
    { label: 'Homepage', href: '/admin/homepage' },
  ]

  it('names the module that owns the route, so the bar and the title differ per page', () => {
    // Before this the header read "Admin Dashboard" on all 23 routes.
    expect(activeAdminModuleLabel('/admin/orders', modules)).toBe('Orders')
    expect(activeAdminModuleLabel('/admin/homepage', modules)).toBe('Homepage')
    expect(activeAdminModuleLabel('/admin', modules)).toBe('Dashboard')
  })

  it('keeps the parent module name on nested routes', () => {
    expect(activeAdminModuleLabel('/admin/catalog/products/123/builder', modules)).toBe('Catalog')
  })

  it('returns null when nothing owns the route (caller supplies a fallback)', () => {
    expect(activeAdminModuleLabel('/shop', modules)).toBeNull()
    expect(activeAdminModuleLabel('', modules)).toBeNull()
    expect(activeAdminModuleLabel('/admin/orders', [])).toBeNull()
  })
})

describe('resolveActiveAdminHref (§9.6)', () => {
  it('matches a module on its own route', () => {
    for (const href of ADMIN_MODULE_HREFS) {
      expect(resolveActiveAdminHref(href, ADMIN_MODULE_HREFS)).toBe(href)
    }
  })

  it('keeps the marker on nested routes — the defect the audit captured', () => {
    expect(resolveActiveAdminHref('/admin/catalog/products', ADMIN_MODULE_HREFS)).toBe('/admin/catalog')
    expect(
      resolveActiveAdminHref('/admin/catalog/products/123/builder', ADMIN_MODULE_HREFS)
    ).toBe('/admin/catalog')
    expect(resolveActiveAdminHref('/admin/catalog/products/new', ADMIN_MODULE_HREFS)).toBe(
      '/admin/catalog'
    )
    // The nested catalog pricing page belongs to Catalog, not to /admin/pricing.
    expect(resolveActiveAdminHref('/admin/catalog/pricing', ADMIN_MODULE_HREFS)).toBe('/admin/catalog')
  })

  it('does not let the Dashboard module absorb every panel route', () => {
    // A naive startsWith() would return '/admin' for all of these and light up
    // two rail entries at once.
    expect(resolveActiveAdminHref('/admin/orders', ADMIN_MODULE_HREFS)).toBe('/admin/orders')
    expect(resolveActiveAdminHref('/admin/homepage', ADMIN_MODULE_HREFS)).toBe('/admin/homepage')
    expect(resolveActiveAdminHref('/admin/custom-requests/42', ADMIN_MODULE_HREFS)).toBe(
      '/admin/custom-requests'
    )
  })

  it('returns null only outside the admin tree', () => {
    // Every real panel route is nested under a module, so the rail always has a
    // marker. `null` is the defensive case: the function must not claim a module
    // for a storefront path if it is ever reused elsewhere (§9.10 wants the same
    // helper for the header label).
    expect(resolveActiveAdminHref('/shop/cart', ADMIN_MODULE_HREFS)).toBeNull()
    expect(resolveActiveAdminHref('/', ADMIN_MODULE_HREFS)).toBeNull()
  })

  it('attributes an unlisted nested route to its nearest ancestor module', () => {
    // Router semantics, and harmless here: /admin/not-authorized does not render
    // the rail at all (it lives outside the (panel) group), so the value is
    // never displayed. The alternative — showing no active module — is worse on
    // the routes that *do* render the shell.
    expect(resolveActiveAdminHref('/admin/not-authorized', ADMIN_MODULE_HREFS)).toBe('/admin')
    expect(resolveActiveAdminHref('/admin/catalog/anything', ADMIN_MODULE_HREFS)).toBe(
      '/admin/catalog'
    )
  })

  it('ignores trailing slashes on both sides', () => {
    expect(resolveActiveAdminHref('/admin/orders/', ADMIN_MODULE_HREFS)).toBe('/admin/orders')
    expect(resolveActiveAdminHref('/admin/orders/', ['/admin/orders/'])).toBe('/admin/orders')
  })

  it('prefers the longest match when modules nest', () => {
    const hrefs = ['/admin', '/admin/catalog', '/admin/catalog/pricing']
    expect(resolveActiveAdminHref('/admin/catalog/pricing', hrefs)).toBe('/admin/catalog/pricing')
    expect(resolveActiveAdminHref('/admin/catalog/pricing/tiers', hrefs)).toBe(
      '/admin/catalog/pricing'
    )
    expect(resolveActiveAdminHref('/admin/catalog/other', hrefs)).toBe('/admin/catalog')
  })

  it('never lets the storefront root absorb the admin tree', () => {
    const hrefs = ['/', '/admin']
    expect(resolveActiveAdminHref('/admin/orders', hrefs)).toBe('/admin')
    expect(resolveActiveAdminHref('/', hrefs)).toBe('/')
    expect(resolveActiveAdminHref('/shop', hrefs)).toBeNull()
  })

  it('tolerates empty input instead of throwing during a render', () => {
    expect(resolveActiveAdminHref('', ADMIN_MODULE_HREFS)).toBeNull()
    expect(resolveActiveAdminHref('/admin', [])).toBeNull()
    expect(resolveActiveAdminHref('/admin', [''])).toBeNull()
  })
})
