import { getSiteUrl } from '@/lib/supabase/env'

/**
 * §2.10 — shared SEO primitives (sitemap, robots, structured data).
 *
 * One source of truth for the canonical origin and the list of indexable
 * storefront routes, so `sitemap.ts`, `robots.ts` and the JSON-LD builders cannot
 * drift apart on a URL. The origin comes from `getSiteUrl()` (the same resolver
 * OAuth uses), which honours `NEXT_PUBLIC_SITE_URL` in production.
 */

export const SITE_NAME = "Ruby's Relics Studio"

/**
 * Static, indexable storefront routes (no dynamic segment, no auth, no
 * transactional surface). Transactional/private routes (`/cart`, `/checkout`,
 * `/orders/*`, `/sign-in`, `/admin`, `/api`, `/auth`) are deliberately absent —
 * they are told to stay out via `robots.ts`, never invited in here.
 */
const STATIC_PATHS = [
  '/',
  '/about',
  '/how-it-works',
  '/gallery',
  '/shop',
  '/shop/all',
  '/shop/ready-made',
  '/custom-orders',
  '/future-products',
  '/resources',
] as const

export function getStorefrontStaticPaths(): string[] {
  return [...STATIC_PATHS]
}

/**
 * Resolves a path (with a leading `/`) to an absolute URL against `origin`.
 * `origin` defaults to the deployment origin; pass it explicitly in tests so the
 * result is deterministic.
 */
export function buildAbsoluteUrl(path: string, origin = getSiteUrl()): string {
  return new URL(path, origin).toString()
}

/** Keeps only absolute `http(s)` image URLs for structured data. */
export function asAbsoluteImageUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined
  return /^https?:\/\//i.test(url) ? url : undefined
}