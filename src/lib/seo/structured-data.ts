import type { DbProductMedia } from '@/lib/supabase/queries/products'
import { getSiteUrl } from '@/lib/supabase/env'
import { asAbsoluteImageUrl, buildAbsoluteUrl, SITE_NAME } from '@/lib/seo/site'

/**
 * §2.10 — JSON-LD structured-data builders.
 *
 * Pure functions returning plain objects (never JSX, never HTML) so they can be
 * unit-tested and stringified by `src/components/seo/JsonLd.tsx`. All URLs are
 * absolute against the canonical origin.
 */

export interface BreadcrumbItem {
  name: string
  path: string
}

/** The subset of a product row `buildProductJsonLd` actually reads. */
export interface ProductJsonLdInput {
  title: string
  slug: string
  short_description: string
  description: string
  category_slug?: string | null
  base_price: number
  is_ready_made: boolean
  media: Pick<DbProductMedia, 'url' | 'is_featured'>[]
}

export function buildBreadcrumbJsonLd(
  items: BreadcrumbItem[],
  origin = getSiteUrl()
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: buildAbsoluteUrl(item.path, origin),
    })),
  }
}

export function buildProductJsonLd(
  product: ProductJsonLdInput,
  origin = getSiteUrl()
): Record<string, unknown> {
  const productUrl = buildAbsoluteUrl(
    `/shop/categories/${product.category_slug ?? ''}/${product.slug}`,
    origin
  )
  const featured = product.media.find((m) => m.is_featured) ?? product.media[0]
  const image = asAbsoluteImageUrl(featured?.url)

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.short_description || product.description || undefined,
    ...(image ? { image: [image] } : {}),
    sku: product.slug,
    brand: { '@type': 'Brand', name: SITE_NAME },
    offers: {
      '@type': 'Offer',
      url: productUrl,
      priceCurrency: 'USD',
      price: Number(product.base_price),
      // Ready-made items are stock; everything else is built to order.
      availability: product.is_ready_made
        ? 'https://schema.org/InStock'
        : 'https://schema.org/MadeToOrder',
      itemCondition: 'https://schema.org/NewCondition',
    },
  }
}