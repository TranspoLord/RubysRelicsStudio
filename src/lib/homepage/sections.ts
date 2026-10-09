/**
 * Homepage section registry (docs/archive/SEPT_IMPLEMENTATION_PLAN §7.3; the seed of §7.2).
 *
 * Until now each admin route carried its own private `ALL_SECTION_KEYS` array and
 * had no idea what order a section should occupy, so a *new* row could only be
 * created with the table default `sort_order = 0` — i.e. at the top of the
 * homepage. This module is the single source of truth for both.
 *
 * `announcement` is deliberately absent: its visibility switch is
 * `exp_announcement.is_active`, not a row in `exp_homepage_sections`
 * (`src/app/api/admin/homepage/sections/route.ts` documents the same exclusion).
 */

/** Every key the homepage admin API accepts. */
export const HOMEPAGE_SECTION_KEYS = [
  'hero',
  'hero_collage',
  'quick_picks',
  'process_picks',
  'order_paths',
  'category_grid',
  'featured_collections',
  'shop_all_preview',
  'future_products_notify',
  'fresh_from_forge',
  'materials_teaser',
  'process_strip',
  'custom_order_pitch',
  'testimonials',
  'faq_preview',
  'newsletter',
  'resources_teaser',
] as const

export type HomepageSectionKey = (typeof HOMEPAGE_SECTION_KEYS)[number]

const SECTION_KEY_SET: ReadonlySet<string> = new Set(HOMEPAGE_SECTION_KEYS)

export function isHomepageSectionKey(value: unknown): value is HomepageSectionKey {
  return typeof value === 'string' && SECTION_KEY_SET.has(value)
}

/**
 * The `sort_order` a section receives **the first time its row is created**.
 *
 * The values mirror the live table (read with `supabase db query --linked` on
 * 2026-09-30) so a section being created keeps the slot its neighbours occupy.
 * The two values with no live row come from §7.2's documented default slots:
 * `shop_all_preview` 45 (between `featured_collections` 40 and `fresh_from_forge`
 * 50) and `future_products_notify` 105 (between `faq_preview` 100 and
 * `newsletter` 110).
 *
 * Only the create path uses these — `saveHomepageSection()` never writes
 * `sort_order` on an update, so this table cannot undo an admin's ordering.
 */
export const DEFAULT_HOMEPAGE_SECTION_ORDER: Readonly<Record<HomepageSectionKey, number>> = {
  hero: 10,
  quick_picks: 12,
  process_picks: 13,
  hero_collage: 15,
  order_paths: 20,
  category_grid: 30,
  featured_collections: 40,
  shop_all_preview: 45,
  fresh_from_forge: 50,
  materials_teaser: 60,
  process_strip: 70,
  custom_order_pitch: 80,
  testimonials: 90,
  faq_preview: 100,
  future_products_notify: 105,
  newsletter: 110,
  resources_teaser: 120,
}

export function defaultHomepageSectionOrder(key: HomepageSectionKey): number {
  return DEFAULT_HOMEPAGE_SECTION_ORDER[key]
}
