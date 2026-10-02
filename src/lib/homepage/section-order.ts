/**
 * Homepage section *ordering* (SEPT_IMPLEMENTATION_PLAN §7.2).
 *
 * `src/app/page.tsx` used to render a fixed JSX sequence, so the admin's
 * `sort_order` was decorative: `getHomepageSections()` returned it and nothing
 * read it. This module turns the section map plus the registry from
 * `sections.ts` into the render order, and the page loops over the result.
 *
 * Four safety rules, all of which are load-bearing (each one is a way the naive
 * implementation breaks the homepage) and each unit-tested:
 *
 *   a. A key with **no DB row** stays **visible** at its default order —
 *      `shop_all_preview` (45) and `future_products_notify` (105) have no row in
 *      the live table, and hiding them would silently delete two sections.
 *   b. Equal `sort_order` breaks deterministically (default order, then key).
 *      Postgres tie order is arbitrary, so without this a refresh could reorder
 *      the page.
 *   c. `hero` is pinned first — it is the page's conversion anchor, and an
 *      admin-set `sort_order` must not bury it.
 *   d. An empty or failed section map falls back to the **full default order**,
 *      so a Supabase outage cannot blank the homepage.
 *
 * Rule (d) falls out of (a): no rows at all means every key is visible at its
 * default order, which is the documented baseline.
 */

import {
  DEFAULT_HOMEPAGE_SECTION_ORDER,
  HOMEPAGE_SECTION_KEYS,
  type HomepageSectionKey,
} from '@/lib/homepage/sections'

/** The subset of a `exp_homepage_sections` row this module needs. */
export interface HomepageSectionRow {
  is_visible?: boolean
  sort_order?: number | null
}

export type HomepageSectionMap = Record<string, HomepageSectionRow | undefined>

export interface OrderedHomepageSection {
  key: HomepageSectionKey
  is_visible: boolean
  /** `is_visible` is the only gate the page applies; nothing else is needed. */
  sort_order: number
  /** Where `sort_order` came from — `default` marks a key with no usable row. */
  order_source: 'db' | 'default'
}

const HERO_KEY: HomepageSectionKey = 'hero'

/**
 * The keys that own a rendered element, in default order.
 *
 * `hero_collage` is deliberately **excluded**: it is the hero's *content* row
 * (read by `getHeroCollageConfig()` and passed to `HeroSection`), not a section
 * of its own. It keeps an entry in the registry and a default order, so the CMS
 * can still edit it — it just never renders a standalone block.
 */
export const RENDERABLE_HOMEPAGE_SECTIONS: readonly HomepageSectionKey[] =
  HOMEPAGE_SECTION_KEYS.filter((key) => key !== 'hero_collage')

/**
 * Returns the sections to render, in order, with their visibility resolved.
 *
 * Never throws and never returns a partial list: an unusable map degrades to the
 * default order rather than to nothing.
 */
export function orderHomepageSections(
  sections: HomepageSectionMap | null | undefined,
  renderableKeys: readonly HomepageSectionKey[] = RENDERABLE_HOMEPAGE_SECTIONS
): OrderedHomepageSection[] {
  const map = sections ?? {}

  return renderableKeys
    .map((key) => {
      const row = map[key]
      const hasDbOrder = typeof row?.sort_order === 'number' && Number.isFinite(row.sort_order)

      return {
        key,
        // Rule (a): only an explicit `false` hides a section.
        is_visible: row ? row.is_visible !== false : true,
        // Rule (a): a row-less key keeps its slot. Note `0` is a *valid* order
        // and must not be treated as "missing".
        sort_order: hasDbOrder ? (row?.sort_order as number) : DEFAULT_HOMEPAGE_SECTION_ORDER[key],
        order_source: hasDbOrder ? ('db' as const) : ('default' as const),
      }
    })
    .sort(compareSections)
}

function compareSections(a: OrderedHomepageSection, b: OrderedHomepageSection): number {
  // Rule (c): the hero is always first, whatever the CMS says.
  const heroRank = Number(a.key !== HERO_KEY) - Number(b.key !== HERO_KEY)
  if (heroRank !== 0) return heroRank

  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order

  // Rule (b): deterministic tie-break, so equal orders cannot flip between
  // requests.
  const defaultDelta =
    DEFAULT_HOMEPAGE_SECTION_ORDER[a.key] - DEFAULT_HOMEPAGE_SECTION_ORDER[b.key]
  if (defaultDelta !== 0) return defaultDelta

  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
}