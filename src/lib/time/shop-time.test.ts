import { describe, expect, it } from 'vitest'
import { SHOP_TIME_ZONE, formatShopDate, formatShopDateTime } from './shop-time'

describe('shop time formatting (OCT #13 / #39)', () => {
  it('renders UTC instants in the shop time zone', () => {
    // 06:27 UTC is 1:27 AM in Central time — the server's UTC clock used to leak
    // straight onto the page.
    const formatted = formatShopDateTime('2026-10-10T06:27:30.000Z')
    expect(formatted).toContain('Oct 10, 2026')
    expect(formatted).toMatch(/1:27/)
    expect(formatted).not.toContain('06:27')
  })

  it('handles standard time as well as daylight time', () => {
    const winter = formatShopDateTime('2026-01-15T12:00:00.000Z')
    expect(winter).toContain('Jan 15, 2026')
    expect(winter).toMatch(/6:00/)
  })

  it('returns an empty string for a missing or unparseable value', () => {
    expect(formatShopDateTime(null)).toBe('')
    expect(formatShopDateTime(undefined)).toBe('')
    expect(formatShopDateTime('not-a-date')).toBe('')
    expect(formatShopDate('not-a-date')).toBe('')
  })

  it('drops the time in the date-only form', () => {
    expect(formatShopDate('2026-10-10T06:27:30.000Z')).toBe('Oct 10, 2026')
  })

  it('defaults to Central time', () => {
    expect(SHOP_TIME_ZONE).toBe('America/Chicago')
  })
})
