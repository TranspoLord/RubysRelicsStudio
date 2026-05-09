import { createHmac, timingSafeEqual } from 'node:crypto'

export const ADMIN_COOKIE_NAME = 'rr_admin_session'

const SESSION_VERSION = 'v1'
const SESSION_TTL_SECONDS = 60 * 60 * 12

function signPayload(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('hex')
}

export function createAdminSessionToken(adminKey: string): string {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  const payload = `${SESSION_VERSION}.${expiresAt}`
  const sig = signPayload(payload, adminKey)
  return `${payload}.${sig}`
}

export function verifyAdminSessionToken(token: string | null | undefined, adminKey: string): boolean {
  if (!token || !adminKey) return false

  const parts = token.split('.')
  if (parts.length !== 3) return false

  const [version, expRaw, signature] = parts
  if (version !== SESSION_VERSION) return false

  const exp = Number.parseInt(expRaw, 10)
  if (!Number.isFinite(exp)) return false
  if (exp < Math.floor(Date.now() / 1000)) return false

  const payload = `${version}.${exp}`
  const expectedSignature = signPayload(payload, adminKey)

  const actualBuf = Buffer.from(signature)
  const expectedBuf = Buffer.from(expectedSignature)

  if (actualBuf.length !== expectedBuf.length) return false
  return timingSafeEqual(actualBuf, expectedBuf)
}

export function getAdminSessionMaxAgeSeconds(): number {
  return SESSION_TTL_SECONDS
}
