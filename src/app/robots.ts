import type { MetadataRoute } from 'next'

import { buildAbsoluteUrl } from '@/lib/seo/site'

/**
 * §2.10 — robots.txt. The storefront is indexable; private, transactional and
 * auth surfaces are told to stay out. The trailing slash on `/custom-orders/`
 * disallows the per-request status pages (`/custom-orders/{id}`) while leaving
 * the public `/custom-orders` intake page indexable.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/api',
          '/auth',
          '/sign-in',
          '/cart',
          '/checkout',
          '/orders',
          '/custom-orders/',
        ],
      },
    ],
    sitemap: buildAbsoluteUrl('/sitemap.xml'),
  }
}