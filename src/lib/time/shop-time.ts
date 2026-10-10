/**
 * OCT #13 / #39: customer-facing timestamps are rendered in the *shop's* time
 * zone, never the server's — on Vercel that is UTC, so an evening order showed
 * up as the next day.
 *
 * `SHOP_TIME_ZONE` defaults to Central time (the owner's zone) and can be
 * overridden per environment. The remaining #39 work (finance date ranges and
 * `shop-day.ts`) is still open.
 */
export const SHOP_TIME_ZONE = process.env.SHOP_TIME_ZONE || 'America/Chicago'

function parse(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** e.g. `Oct 10, 2026, 1:27 AM CDT` — empty string for a missing/bad value. */
export function formatShopDateTime(value: string | null | undefined): string {
  const date = parse(value)
  if (!date) return ''

  return new Intl.DateTimeFormat('en-US', {
    timeZone: SHOP_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)
}

/** e.g. `Oct 10, 2026` — empty string for a missing/bad value. */
export function formatShopDate(value: string | null | undefined): string {
  const date = parse(value)
  if (!date) return ''

  return new Intl.DateTimeFormat('en-US', {
    timeZone: SHOP_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}
