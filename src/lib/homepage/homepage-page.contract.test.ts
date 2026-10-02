import { describe, expect, it } from 'vitest'

import { listSourceFiles, readSourceFile, relativeSourcePath, stripComments } from '@/lib/testing/source-contract'

/**
 * Guards for §7.2, §7.4, §7.5, §7.10 and §3.4 — the homepage/CMS batch.
 *
 * Each of these is a defect that was invisible to the type-checker and only
 * reproducible in a browser or a database, so they are pinned at the source
 * level (see OCT_IMPLEMENTATION_PLAN.md → OCT-19 for the harness caveat).
 */
const HOME_PAGE_RELATIVE = 'src/app/page.tsx'
const HOME_PAGE = readSourceFile(HOME_PAGE_RELATIVE)
const HOME_PAGE_CODE = stripComments(HOME_PAGE)
const BANNER = readSourceFile('src/components/home/AnnouncementBanner.tsx')
const BANNER_CODE = stripComments(BANNER)
const ADMIN_HOMEPAGE = readSourceFile('src/app/admin/(panel)/homepage/page.tsx')

describe('§7.2 — the homepage render order is CMS-driven', () => {
  it('orders sections through the shared helper instead of a fixed JSX sequence', () => {
    expect(HOME_PAGE_CODE).toContain("from '@/lib/homepage/section-order'")
    expect(HOME_PAGE_CODE).toContain('orderHomepageSections(sections)')
    expect(HOME_PAGE_CODE).toMatch(/orderedSections[\s\S]{0,200}\.map\(/)
  })

  it('leaves no section rendered by an inline visibility check', () => {
    // The old shape was `{sections['x']?.is_visible !== false && <Component/>}`,
    // which is what made sort_order decorative.
    expect(HOME_PAGE_CODE).not.toMatch(/sections\['[a-z_]+'\]\?\.is_visible !== false\s*&&/)
  })
})

describe('§7.4 / §7.5 — the announcement banner is CMS-driven', () => {
  it('has no static fallback to render when the row is inactive', () => {
    expect(BANNER_CODE).not.toContain('STATIC_FALLBACK')
    expect(BANNER_CODE).toContain('data ?? null')
    // No data (or no message) means no banner at all.
    expect(BANNER_CODE).toMatch(/if \(!announcement\?\.message \|\| !visible\) return null/)
  })

  it('scopes the homepage to render it only when an active row exists', () => {
    expect(HOME_PAGE_CODE).toContain('{announcement && <AnnouncementBanner data={announcement} />}')
  })

  it('keeps the 404 CTA href in exactly one known place — the Footer', () => {
    // §7.5 fixed the banner instance by deleting the fallback. The Footer entry
    // is a *data* question (which slug is live?) that this environment could not
    // answer — the taxonomy query needs the CLI, which hung (OCT-18). The
    // allow-list below is deliberate: if the Footer link is repointed, or a new
    // occurrence appears, this test fails and forces an update.
    const occurrences: string[] = []
    for (const file of listSourceFiles()) {
      const relative = relativeSourcePath(file)
      // Comment-stripped: the banner's own comment *explains* the old href, which
      // would otherwise look like a live occurrence (see OCT-2's lesson).
      if (stripComments(readSourceFile(relative.slice(1))).includes('/shop/categories/engraved-drinkware')) {
        occurrences.push(relative)
      }
    }
    expect(occurrences).toEqual(['/src/components/layout/Footer.tsx'])
  })
})

describe('§7.10 — generated favicon and OG image', () => {
  it('ships a programmatic icon with the metadata Next needs', () => {
    const icon = readSourceFile('src/app/icon.tsx')
    expect(icon).toContain("from 'next/og'")
    expect(icon).toMatch(/export const size = \{ width: \d+, height: \d+ \}/)
    expect(icon).toContain("export const contentType = 'image/png'")
    expect(icon).toMatch(/export default function \w+/)
  })

  it('ships a programmatic Open Graph image with alt text', () => {
    const og = readSourceFile('src/app/opengraph-image.tsx')
    expect(og).toContain("from 'next/og'")
    expect(og).toMatch(/export const size = \{ width: \d+, height: \d+ \}/)
    expect(og).toMatch(/export const alt =/)
  })
})

describe('§3.4 — the Shop All Preview and Notify editors are rendered', () => {
  it('renders panels for both sections', () => {
    // Before this the state + handlers existed and nothing rendered them, so the
    // two sections had no editor at all.
    expect(ADMIN_HOMEPAGE).toContain('Shop All Preview')
    expect(ADMIN_HOMEPAGE).toContain('Future Products Notify')
  })

  it('wires both save handlers to a button (no dead handler)', () => {
    for (const handler of ['handleSaveShopAllPreview', 'handleSaveFutureProductsNotify']) {
      // Defined as a function ...
      expect(ADMIN_HOMEPAGE).toMatch(new RegExp(`async function ${handler}\\(`))
      // ... and invoked from an onClick, i.e. reachable from the UI.
      expect(ADMIN_HOMEPAGE).toMatch(new RegExp(`onClick=\\{\\(\\) => void ${handler}\\(\\)\\}`))
    }
  })

  it('gives the new editor inputs accessible names (§9.7 pattern)', () => {
    for (const label of [
      'Shop All Preview heading',
      'Shop All Preview product count',
      'Future products notify heading',
      'Future products notify CTA label',
    ]) {
      expect(ADMIN_HOMEPAGE).toContain(`'aria-label': '${label}'`)
    }
  })
})