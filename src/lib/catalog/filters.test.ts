import { describe, expect, it } from 'vitest'
import { filterProductsForShopAll } from './filters'

describe('filterProductsForShopAll', () => {
  const products = [
    {
      id: '1',
      title: 'Dragon Mug',
      slug: 'dragon-mug',
      short_description: 'A bold ceramic mug for dragon fans.',
      description: 'Ceramic mug with custom engraving.',
      category_key: 'engraved_drinkware',
      base_price: 25,
      is_ready_made: true,
      is_customizable: true,
      is_active: true,
      sort_order: 1,
      production_estimate_band: '3-5 days',
      how_it_works_anchor: null,
      seo_title: null,
      seo_description: null,
    },
    {
      id: '2',
      title: 'Wood Sign',
      slug: 'wood-sign',
      short_description: 'Laser-cut wooden sign.',
      description: 'Custom wood decor piece.',
      category_key: 'signs_and_decor',
      base_price: 80,
      is_ready_made: false,
      is_customizable: true,
      is_active: true,
      sort_order: 2,
      production_estimate_band: '1-2 weeks',
      how_it_works_anchor: null,
      seo_title: null,
      seo_description: null,
    },
    {
      id: '3',
      title: 'Leather Patch',
      slug: 'leather-patch',
      short_description: 'Custom leather patch for gear.',
      description: 'Handmade leather patch.',
      category_key: 'leather_goods',
      base_price: 12,
      is_ready_made: true,
      is_customizable: false,
      is_active: true,
      sort_order: 3,
      production_estimate_band: '3 days',
      how_it_works_anchor: null,
      seo_title: null,
      seo_description: null,
    },
  ] as const

  it('filters by category, price, ready-made, customizable and search text', () => {
    const filtered = filterProductsForShopAll(products as any, {
      category: 'engraved_drinkware',
      priceMin: 20,
      priceMax: 30,
      showReadyMade: true,
      showCustomizable: true,
      search: 'dragon',
    })

    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('1')
  })

  it('returns all products when no filters are active', () => {
    expect(filterProductsForShopAll(products as any, {})).toHaveLength(3)
  })
})
