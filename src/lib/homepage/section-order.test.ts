import { describe, expect, it } from 'vitest'

import {
  RENDERABLE_HOMEPAGE_SECTIONS,
  orderHomepageSections,
  type HomepageSectionMap,
} from '@/lib/homepage/section-order'
import { DEFAULT_HOMEPAGE_SECTION_ORDER, HOMEPAGE_SECTION_KEYS, type HomepageSectionKey } from '@/lib/homepage/sections'

/**
 * §7.2's acceptance criterion is "the refactor renders identically". The audit
 * proposed diffing `audit.json` before/after, which needs the CDP harness this
 * environment lacks (OCT-19) — so the equivalence is asserted here instead, from
 * the **live** `sort_order` values read with `supabase db query --linked` on
 * 2026-09-30, compared against the exact JSX sequence the old page.tsx had.
 */

/** The live table as measured 2026-09-30 (16 rows; two keys absent, as noted). */
const LIVE_SECTION_MAP: HomepageSectionMap = {
  announcement: { is_visible: true, sort_order: 0 }, // excluded — not a section
  hero: { is_visible: true, sort_order: 10 },
  quick_picks: { is_visible: true, sort_order: 12 },
  process_picks: { is_visible: false, sort_order: 13 },
  hero_collage: { is_visible: true, sort_order: 15 }, // hero content, not a section
  order_paths: { is_visible: true, sort_order: 20 },
  category_grid: { is_visible: false, sort_order: 30 },
  featured_collections: { is_visible: false, sort_order: 40 },
  fresh_from_forge: { is_visible: false, sort_order: 50 },
  materials_teaser: { is_visible: false, sort_order: 60 },
  process_strip: { is_visible: false, sort_order: 70 },
  custom_order_pitch: { is_visible: true, sort_order: 80 },
  testimonials: { is_visible: false, sort_order: 90 },
  faq_preview: { is_visible: false, sort_order: 100 },
  newsletter: { is_visible: false, sort_order: 110 },
  resources_teaser: { is_visible: true, sort_order: 120 },
}

/** The sequence the old, code-driven `page.tsx` rendered. */
const DOCUMENTED_JSX_ORDER: readonly HomepageSectionKey[] = [
  'hero',
  'quick_picks',
  'process_picks',
  'order_paths',
  'category_grid',
  'featured_collections',
  'shop_all_preview',
  'fresh_from_forge',
  'materials_teaser',
  'process_strip',
  'custom_order_pitch',
  'testimonials',
  'faq_preview',
  'future_products_notify',
  'newsletter',
  'resources_teaser',
]

describe('orderHomepageSections — rendering equivalence (§7.2)', () => {
  it('reproduces the old JSX order exactly, from the live row values', () => {
    const keys = orderHomepageSections(LIVE_SECTION_MAP).map((section) => section.key)
    expect(keys).toEqual(DOCUMENTED_JSX_ORDER)
  })

  it('honours the live visibility flags rather than hiding everything', () => {
    const visible = orderHomepageSections(LIVE_SECTION_MAP)
      .filter((section) => section.is_visible)
      .map((section) => section.key)

    // The live table has most sections off; the ones that are on must survive —
    // including the two keys with no row at all (rule (a)), each in its own slot.
    expect(visible).toEqual([
      'hero',
      'quick_picks',
      'order_paths',
      'shop_all_preview',
      'custom_order_pitch',
      'future_products_notify',
      'resources_teaser',
    ])
  })

  it('does not treat hero_collage as a renderable section', () => {
    expect(RENDERABLE_HOMEPAGE_SECTIONS).not.toContain('hero_collage')
    expect(orderHomepageSections(LIVE_SECTION_MAP).map((s) => s.key)).not.toContain('hero_collage')
    // ...but it keeps a registry entry and a default order for the CMS.
    expect(DEFAULT_HOMEPAGE_SECTION_ORDER.hero_collage).toBe(15)
  })
})

describe('orderHomepageSections — safety rules', () => {
  it('(a) keeps a renderable key with no DB row visible, at its default slot', () => {
    const ordered = orderHomepageSections(LIVE_SECTION_MAP)
    const shopAll = ordered.find((section) => section.key === 'shop_all_preview')
    const notify = ordered.find((section) => section.key === 'future_products_notify')

    expect(shopAll).toMatchObject({ is_visible: true, sort_order: 45, order_source: 'default' })
    expect(notify).toMatchObject({ is_visible: true, sort_order: 105, order_source: 'default' })

    // ...and they land in the right slots, not at the top.
    const keys = ordered.map((section) => section.key)
    expect(keys.indexOf('shop_all_preview')).toBe(keys.indexOf('featured_collections') + 1)
    expect(keys.indexOf('future_products_notify')).toBe(keys.indexOf('faq_preview') + 1)
  })

  it('(b) breaks an equal sort_order deterministically, not by map order', () => {
    const collide: HomepageSectionMap = {
      hero: { is_visible: true, sort_order: 10 },
      newsletter: { is_visible: true, sort_order: 50 },
      order_paths: { is_visible: true, sort_order: 50 },
      quick_picks: { is_visible: true, sort_order: 50 },
    }

    const first = orderHomepageSections(collide).map((section) => section.key)
    // Same input in a different key order must produce the same output.
    const shuffled: HomepageSectionMap = {
      quick_picks: collide.quick_picks,
      newsletter: collide.newsletter,
      hero: collide.hero,
      order_paths: collide.order_paths,
    }
    const second = orderHomepageSections(shuffled).map((section) => section.key)

    expect(first).toEqual(second)

    // Every renderable key is present (rule (a)), so the tie-break is asserted
    // as a relative order: default order puts quick_picks (12) before
    // order_paths (20) before newsletter (110).
    const index = (key: (typeof DOCUMENTED_JSX_ORDER)[number]) => first.indexOf(key)
    expect(index('quick_picks')).toBeLessThan(index('order_paths'))
    expect(index('order_paths')).toBeLessThan(index('newsletter'))
    // And the colliding group sits after the lower sorts, before the higher ones.
    expect(index('category_grid')).toBeLessThan(index('quick_picks'))
    expect(index('newsletter')).toBeLessThan(index('resources_teaser'))
  })

  it('(c) pins the hero first even when the CMS buries it', () => {
    const buried: HomepageSectionMap = {
      hero: { is_visible: true, sort_order: 999 },
      resources_teaser: { is_visible: true, sort_order: 1 },
    }
    const ordered = orderHomepageSections(buried)
    expect(ordered[0].key).toBe('hero')
    // sort_order 1 is next-lowest, i.e. only the pin beats it.
    expect(ordered[1].key).toBe('resources_teaser')
  })

  it('(d) falls back to the full default order when the map is empty or failed', () => {
    for (const input of [{}, null, undefined]) {
      const ordered = orderHomepageSections(input)
      expect(ordered.map((section) => section.key)).toEqual(DOCUMENTED_JSX_ORDER)
      expect(ordered.every((section) => section.is_visible)).toBe(true)
      expect(ordered.every((section) => section.order_source === 'default')).toBe(true)
    }
  })

  it('respects an explicit sort_order of 0 (a valid value, not "missing")', () => {
    const ordered = orderHomepageSections({
      hero: { is_visible: true, sort_order: 10 },
      newsletter: { is_visible: true, sort_order: 0 },
    })
    const newsletter = ordered.find((section) => section.key === 'newsletter')
    expect(newsletter).toMatchObject({ sort_order: 0, order_source: 'db' })
    // 0 is lower than every default, so it only trails the pinned hero.
    const keys = ordered.map((section) => section.key)
    expect(keys[0]).toBe('hero')
    expect(keys[1]).toBe('newsletter')
  })

  it('treats only an explicit false as hidden', () => {
    const ordered = orderHomepageSections({
      hero: { is_visible: true },
      newsletter: { is_visible: false },
      testimonials: {}, // row exists, is_visible undefined
    })
    const byKey = Object.fromEntries(ordered.map((section) => [section.key, section.is_visible]))
    expect(byKey.hero).toBe(true)
    expect(byKey.newsletter).toBe(false)
    expect(byKey.testimonials).toBe(true)
  })

  it('ignores a row for a key that is not a homepage section', () => {
    const keys = orderHomepageSections({ not_a_section: { is_visible: true, sort_order: 1 } }).map(
      (section) => section.key
    )
    expect(keys).not.toContain('not_a_section')
    expect(keys).toEqual(DOCUMENTED_JSX_ORDER)
  })

  it('covers every registry key except hero_collage', () => {
    const renderable = new Set<string>(RENDERABLE_HOMEPAGE_SECTIONS)
    for (const key of HOMEPAGE_SECTION_KEYS) {
      if (key === 'hero_collage') continue
      expect(renderable.has(key)).toBe(true)
    }
  })
})