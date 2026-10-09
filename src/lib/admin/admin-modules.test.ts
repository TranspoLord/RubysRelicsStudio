import { describe, expect, it } from 'vitest'

import { ADMIN_MODULES, adminModuleMetadata } from '@/lib/admin/admin-modules'

/**
 * OCT-20: the SSR `<title>` is now derived per-route from `ADMIN_MODULES` via
 * `adminModuleMetadata()` rather than set client-side in `AdminShell`. These
 * cases pin the map to itself so a typo in a href or label cannot silently
 * change a title.
 */
describe('adminModuleMetadata (OCT-20 SSR title)', () => {
  it('maps every module href back to its own label — no drift', () => {
    for (const mod of ADMIN_MODULES) {
      expect(adminModuleMetadata(mod.href).title).toBe(mod.label)
    }
  })

  it('resolves nested routes to their parent module', () => {
    expect(adminModuleMetadata('/admin/catalog/products/123/builder').title).toBe('Catalog')
    expect(adminModuleMetadata('/admin/shipping/debug').title).toBe('Shipping')
  })

  it('falls back to "Admin" for a route outside the module set', () => {
    expect(adminModuleMetadata('/shop').title).toBe('Admin')
  })

  it('has a unique href per module', () => {
    const hrefs = ADMIN_MODULES.map((mod) => mod.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})
