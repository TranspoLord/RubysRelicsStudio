import { describe, expect, it } from 'vitest'

import {
  DEFAULT_HOMEPAGE_SECTION_ORDER,
  HOMEPAGE_SECTION_KEYS,
  defaultHomepageSectionOrder,
  isHomepageSectionKey,
} from '@/lib/homepage/sections'

describe('HOMEPAGE_SECTION_KEYS', () => {
  it('covers the 16 live rows plus the two keys §7.3 needs to be able to create', () => {
    // Measured live on 2026-09-30: exp_homepage_sections holds 16 rows, and
    // neither shop_all_preview nor future_products_notify is among them.
    expect(HOMEPAGE_SECTION_KEYS).toHaveLength(17)
    expect(new Set(HOMEPAGE_SECTION_KEYS).size).toBe(17)
    expect(HOMEPAGE_SECTION_KEYS).toContain('shop_all_preview')
    expect(HOMEPAGE_SECTION_KEYS).toContain('future_products_notify')
  })

  it('excludes announcement, whose switch is exp_announcement.is_active', () => {
    expect(HOMEPAGE_SECTION_KEYS).not.toContain('announcement')
    expect(isHomepageSectionKey('announcement')).toBe(false)
  })

  it('isHomepageSectionKey accepts every key and rejects everything else', () => {
    for (const key of HOMEPAGE_SECTION_KEYS) {
      expect(isHomepageSectionKey(key)).toBe(true)
    }
    expect(isHomepageSectionKey('SHOP_ALL_PREVIEW')).toBe(false)
    expect(isHomepageSectionKey('shop_all_preview ')).toBe(false)
    expect(isHomepageSectionKey(undefined)).toBe(false)
    expect(isHomepageSectionKey(7)).toBe(false)
    expect(isHomepageSectionKey(['hero'])).toBe(false)
  })
})

describe('DEFAULT_HOMEPAGE_SECTION_ORDER', () => {
  it('gives every key an order, and no order is shared', () => {
    for (const key of HOMEPAGE_SECTION_KEYS) {
      expect(typeof DEFAULT_HOMEPAGE_SECTION_ORDER[key]).toBe('number')
      expect(defaultHomepageSectionOrder(key)).toBe(DEFAULT_HOMEPAGE_SECTION_ORDER[key])
    }
    const orders = HOMEPAGE_SECTION_KEYS.map((key) => defaultHomepageSectionOrder(key))
    expect(new Set(orders).size).toBe(orders.length)
  })

  it('places the two creatable keys in their documented slots, not at 0', () => {
    // 0 is the column default, which would put a brand-new row at the top of the
    // homepage — the bug this table exists to prevent.
    expect(defaultHomepageSectionOrder('shop_all_preview')).toBe(45)
    expect(defaultHomepageSectionOrder('shop_all_preview')).toBeGreaterThan(
      defaultHomepageSectionOrder('featured_collections')
    )
    expect(defaultHomepageSectionOrder('shop_all_preview')).toBeLessThan(
      defaultHomepageSectionOrder('fresh_from_forge')
    )

    expect(defaultHomepageSectionOrder('future_products_notify')).toBe(105)
    expect(defaultHomepageSectionOrder('future_products_notify')).toBeGreaterThan(
      defaultHomepageSectionOrder('faq_preview')
    )
    expect(defaultHomepageSectionOrder('future_products_notify')).toBeLessThan(
      defaultHomepageSectionOrder('newsletter')
    )
  })

  it('keeps hero first and resources_teaser last', () => {
    const orders = HOMEPAGE_SECTION_KEYS.map((key) => defaultHomepageSectionOrder(key))
    expect(defaultHomepageSectionOrder('hero')).toBe(Math.min(...orders))
    expect(defaultHomepageSectionOrder('resources_teaser')).toBe(Math.max(...orders))
  })
})
