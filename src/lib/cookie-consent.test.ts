import { describe, expect, it } from 'vitest'

import { shouldShowCookieBanner } from '@/lib/cookie-consent'

/**
 * §9.2 (and §8.2): the banner is mounted in the root layout, so without a path
 * rule it renders over the admin module rail — measured in the audit as two of
 * twelve modules being unclickable at 1440×900 until a *storefront* consent bar
 * was dismissed. The rule is deliberately storefront-only rather than a list of
 * exceptions, so a new panel route cannot reintroduce the overlap.
 */
describe('shouldShowCookieBanner (§9.2)', () => {
  it('never shows inside the admin panel', () => {
    expect(shouldShowCookieBanner('/admin')).toBe(false)
    expect(shouldShowCookieBanner('/admin/homepage')).toBe(false)
    expect(shouldShowCookieBanner('/admin/abandoned-carts')).toBe(false)
    expect(shouldShowCookieBanner('/admin/catalog/products/123/builder')).toBe(false)
  })

  it('shows on storefront routes', () => {
    expect(shouldShowCookieBanner('/')).toBe(true)
    expect(shouldShowCookieBanner('/shop')).toBe(true)
    expect(shouldShowCookieBanner('/checkout')).toBe(true)
    expect(shouldShowCookieBanner('/resources/cookies')).toBe(true)
  })

  it('is not fooled by paths that merely start with the same letters', () => {
    expect(shouldShowCookieBanner('/administrator')).toBe(true)
    expect(shouldShowCookieBanner('/admin-ish')).toBe(true)
    expect(shouldShowCookieBanner('/shop/admin')).toBe(true)
  })

  it('defaults to showing when the path is unknown (first render)', () => {
    // usePathname() can be null during the first client render; the storefront
    // is the safe default because the panel is the surface being protected.
    expect(shouldShowCookieBanner(null)).toBe(true)
    expect(shouldShowCookieBanner(undefined)).toBe(true)
    expect(shouldShowCookieBanner('')).toBe(true)
  })
})
