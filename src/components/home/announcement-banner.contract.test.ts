import { describe, expect, it } from 'vitest'

import { readSourceFile, stripComments } from '@/lib/testing/source-contract'

/**
 * §8.4 / §7.4 contract for the announcement banner. §7.4 (Batch 6) made the
 * banner CMS-driven; §8.4 (Batch 9) sized the CTA as a ≥24px target. The sizes
 * came from live pixels (107×16), which this node-environment suite cannot
 * reproduce (OCT-5) — so it pins the cause instead.
 */

const SOURCE = readSourceFile('src/components/home/AnnouncementBanner.tsx')
const CODE = stripComments(SOURCE)

describe('AnnouncementBanner contract (§8.4 / §7.4)', () => {
  it('sizes the CMS CTA as a 24px target (§8.4)', () => {
    expect(CODE).toMatch(/component=\{Link\}[\s\S]{0,500}minHeight: 24/)
    expect(CODE).toContain("display: 'inline-block'")
  })

  it('renders nothing without an active announcement (§7.4)', () => {
    expect(CODE).toMatch(/if \(!announcement\?\.message \|\| !visible\) return null/)
  })
})