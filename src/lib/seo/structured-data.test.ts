import { describe, expect, it } from 'vitest'

import {
  buildBreadcrumbJsonLd,
  buildProductJsonLd,
  type ProductJsonLdInput,
} from '@/lib/seo/structured-data'

const ORIGIN = 'https://rubysrelicsstudio.com'

const product: ProductJsonLdInput = {
  title: 'Engraved Tumbler',
  slug: 'engraved-tumbler',
  short_description: 'A laser-engraved stainless tumbler.',
  description: '',
  category_slug: 'engraved-drinkware',
  base_price: 24,
  is_ready_made: true,
  media: [
    { url: 'https://cdn.example.com/tumbler.png', is_featured: true },
    { url: 'https://cdn.example.com/tumbler-2.png', is_featured: false },
  ],
}

describe('§2.10 structured data', () => {
  it('builds a Product with an absolute canonical URL and an offer', () => {
    const json = buildProductJsonLd(product, ORIGIN) as Record<string, any>

    expect(json['@context']).toBe('https://schema.org')
    expect(json['@type']).toBe('Product')
    expect(json.name).toBe('Engraved Tumbler')
    expect(json.description).toBe('A laser-engraved stainless tumbler.')
    expect(json.offers.url).toBe(
      'https://rubysrelicsstudio.com/shop/categories/engraved-drinkware/engraved-tumbler'
    )
    expect(json.offers.priceCurrency).toBe('USD')
    expect(json.offers.price).toBe(24)
    expect(json.offers.availability).toBe('https://schema.org/InStock')
    expect(json.offers.itemCondition).toBe('https://schema.org/NewCondition')
    expect(json.image).toEqual(['https://cdn.example.com/tumbler.png'])
    expect(json.brand).toEqual({ '@type': 'Brand', name: "Ruby's Relics Studio" })
  })

  it('marks non-ready-made products as MadeToOrder and prefers the featured image', () => {
    const json = buildProductJsonLd({ ...product, is_ready_made: false }, ORIGIN) as Record<string, any>
    expect(json.offers.availability).toBe('https://schema.org/MadeToOrder')
  })

  it('omits `image` when media is missing or relative', () => {
    const withoutMedia = buildProductJsonLd({ ...product, media: [] }, ORIGIN) as Record<string, any>
    expect(withoutMedia.image).toBeUndefined()

    const relative = buildProductJsonLd(
      { ...product, media: [{ url: '/x.png', is_featured: true }] },
      ORIGIN
    ) as Record<string, any>
    expect(relative.image).toBeUndefined()
  })

  it('builds a BreadcrumbList with 1-based positions', () => {
    const json = buildBreadcrumbJsonLd(
      [
        { name: 'Home', path: '/' },
        { name: 'Shop', path: '/shop' },
        { name: 'Engraved Drinkware', path: '/shop/categories/engraved-drinkware' },
      ],
      ORIGIN
    ) as Record<string, any>

    expect(json['@type']).toBe('BreadcrumbList')
    expect(json.itemListElement).toHaveLength(3)
    expect(json.itemListElement[0]).toEqual({
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: 'https://rubysrelicsstudio.com/',
    })
    expect(json.itemListElement[2].item).toBe(
      'https://rubysrelicsstudio.com/shop/categories/engraved-drinkware'
    )
  })
})