import { describe, expect, it } from 'vitest'

import { readSourceFile, stripComments } from '@/lib/testing/source-contract'

/**
 * §8.2 / §9.2 defect guards for the consent banner. The measurements behind them
 * came from live pixels in the audit (`Accept` at 2.81:1 on the storefront and
 * 1.67:1 inside the panel, all three buttons 31 px tall, and the fixed bar
 * covering two panel modules plus the checkout address fields), which this suite
 * cannot reproduce — see OCT_IMPLEMENTATION_PLAN.md → OCT-5. What it *can* pin is
 * the cause: hard-coded colours, no path rule, and no touch sizing.
 *
 * The colour itself is asserted numerically in `src/theme/theme.test.ts`, so this
 * file only has to prove the component stopped overriding the theme. Comments are
 * stripped so prose cannot satisfy or break an assertion.
 */
const BANNER_SOURCE = readSourceFile('src/components/common/CookieBanner.tsx')
const BANNER_CODE = stripComments(BANNER_SOURCE)

describe('CookieBanner contract (§8.2 / §9.2)', () => {
  it('is suppressed outside the storefront consent surface', () => {
    expect(BANNER_SOURCE).toContain("from '@/lib/cookie-consent'")
    expect(BANNER_SOURCE).toContain('shouldShowCookieBanner')
    expect(BANNER_SOURCE).toContain('usePathname')
    // The early return must consider suppression, not only the consent state.
    expect(BANNER_CODE).toMatch(/if \(suppressed \|\| !visible\) return null/)
  })

  it('never hard-codes white on the gold action', () => {
    expect(BANNER_CODE).not.toMatch(/#fff/i)
    expect(BANNER_CODE).not.toMatch(/background:\s*brandTokens\.forgeGold\b/)
  })

  it('lets the theme own the primary CTA styling', () => {
    expect(BANNER_CODE).toMatch(/variant="contained"[\s\S]{0,200}color="primary"/)
  })

  it('sizes every banner action as a touch target', () => {
    expect(BANNER_CODE).toMatch(/const bannerActionSx = \{[^}]*minHeight/)
    // One shared style object, so a fourth action cannot ship at 31 px.
    expect(BANNER_CODE.match(/\.\.\.bannerActionSx/g)?.length).toBe(3)
  })

  it('sizes the "Cookie policy" link as a 24px target (§8.4)', () => {
    expect(BANNER_CODE).toMatch(/href="\/resources\/cookies"[\s\S]{0,240}minHeight: 24/)
    expect(BANNER_CODE).toContain("display: 'inline-block'")
  })

  it('reserves viewport space so the fixed bar cannot bury a focused field', () => {
    expect(BANNER_CODE).toContain('scrollPaddingBottom')
  })
})
