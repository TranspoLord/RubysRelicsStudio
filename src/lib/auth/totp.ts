import { createHmac } from 'node:crypto'

/**
 * §10.16 — RFC 6238 TOTP code generation.
 *
 * The dev sign-in helper uses this to *complete* an MFA challenge so the visual
 * audit harness can mint an `aal2` session without a human typing a code.
 * Enrolment and verification stay Supabase's own `auth.mfa.*` calls; this module
 * only turns a base32 secret + the clock into the 6-digit code an authenticator
 * would have produced.
 *
 * Server-only (`node:crypto`). 6 digits, 30 s step, HMAC-SHA1 — the defaults
 * every authenticator app uses.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Decodes RFC 4648 base32 (case-insensitive, ignores spaces and padding). */
function decodeBase32(secret: string): Buffer {
  let bits = ''
  for (const char of secret.replace(/\s+/g, '').toUpperCase()) {
    if (char === '=') continue
    const value = ALPHABET.indexOf(char)
    if (value < 0) throw new Error(`Invalid base32 secret character: '${char}'`)
    bits += value.toString(2).padStart(5, '0')
  }

  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2))
  }
  return Buffer.from(bytes)
}

export interface TotpOptions {
  /** Milliseconds since epoch (injectable for tests). */
  now?: number
  digits?: number
  stepSeconds?: number
}

export function generateTotpCode(
  secret: string,
  { now = Date.now(), digits = 6, stepSeconds = 30 }: TotpOptions = {}
): string {
  const key = decodeBase32(secret)
  const counter = Math.floor(now / 1000 / stepSeconds)

  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigUInt64BE(BigInt(counter))

  const hmac = createHmac('sha1', key).update(counterBuffer).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)

  return (binary % 10 ** digits).toString().padStart(digits, '0')
}