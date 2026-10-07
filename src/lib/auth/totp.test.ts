import { describe, expect, it } from 'vitest'

import { generateTotpCode } from '@/lib/auth/totp'

/** base32 of the ASCII string "12345678901234567890" (RFC 6238 Appendix B). */
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

describe('generateTotpCode (§10.16)', () => {
  it('matches the RFC 6238 SHA-1 test vectors (8 digits)', () => {
    expect(generateTotpCode(RFC_SECRET, { now: 59_000, digits: 8 })).toBe('94287082')
    expect(generateTotpCode(RFC_SECRET, { now: 1_111_111_109_000, digits: 8 })).toBe('07081804')
  })

  it('defaults to 6 digits', () => {
    const code = generateTotpCode(RFC_SECRET, { now: 59_000 })
    expect(code).toHaveLength(6)
    expect(code).toMatch(/^\d{6}$/)
  })

  it('is stable within a step and changes across steps', () => {
    expect(generateTotpCode(RFC_SECRET, { now: 60_000 })).toBe(
      generateTotpCode(RFC_SECRET, { now: 60_001 })
    )
    expect(generateTotpCode(RFC_SECRET, { now: 30_000 })).not.toBe(
      generateTotpCode(RFC_SECRET, { now: 60_000 })
    )
  })

  it('ignores case, spaces and padding in the secret', () => {
    const messy = 'gezd gnbv gy3t qojq gezd gnbv gy3t qojq'
    expect(generateTotpCode(messy, { now: 59_000, digits: 8 })).toBe('94287082')
  })

  it('rejects a non-base32 secret', () => {
    expect(() => generateTotpCode('not-base32!', { now: 59_000 })).toThrow(/base32/i)
  })
})