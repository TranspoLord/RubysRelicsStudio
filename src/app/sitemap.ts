import type { MetadataRoute } from 'next'

import { getResourcePages } from '@/app/resources/content'
import { buildAbsoluteUrl, getStorefrontStaticPaths } from '@/lib/seo/site'
import { getAllActiveProducts } from '@/lib/supabase/queries/products'

/**
 * §2.10 — dynamic sitemap. Data-backed, so it is not prerendered: it reads the
 * live catalog (service role, read-only) and the static resource docs, then
 * emits absolute URLs for every indexable storefront route.
 */
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, resourcePages] = await Promise.all([
    getAllActiveProducts(),
    Promise.resolve(getResourcePages('support@example.com')),
  ])

  // Products are canonical at /shop/categories/{categorySlug}/{slug}. A product
  // without a resolved category slug cannot have a canonical URL, so skip it
  // rather than emit a `/undefined/` path.
  const urlableProducts = products.filter((p) => Boolean(p.category_slug))

  const staticEntries: MetadataRoute.Sitemap = getStorefrontStaticPaths().map((path) => ({
    url: buildAbsoluteUrl(path),
    priority: path === '/' ? 1 : 0.7,
  }))

  const categorySlugs = [...new Set(urlableProducts.map((p) => p.category_slug as string))]
  const categoryEntries: MetadataRoute.Sitemap = categorySlugs.map((slug) => ({
    url: buildAbsoluteUrl(`/shop/categories/${slug}`),
    priority: 0.8,
  }))

  const productEntries: MetadataRoute.Sitemap = urlableProducts.map((p) => ({
    url: buildAbsoluteUrl(`/shop/categories/${p.category_slug}/${p.slug}`),
    priority: 0.6,
  }))

  const resourceEntries: MetadataRoute.Sitemap = Object.keys(resourcePages).map((slug) => ({
    url: buildAbsoluteUrl(`/resources/${slug}`),
    priority: 0.5,
  }))

  return [...staticEntries, ...categoryEntries, ...productEntries, ...resourceEntries]
}