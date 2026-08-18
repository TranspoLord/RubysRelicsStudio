import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createHmac } from 'node:crypto'

const ADMIN_KEY = 'test-admin-key'

const mocks = vi.hoisted(() => ({
  createAdminSessionToken: vi.fn(),
  verifyAdminSessionToken: vi.fn(),
  getAdminSessionMaxAgeSeconds: vi.fn(),
  getExpectedAdminKey: vi.fn(),
  hasValidAdminKey: vi.fn(),
  extractAdminSessionToken: vi.fn(),
  validateCsrfOrigin: vi.fn(),
  validateCsrfOriginLenient: vi.fn(),
  getClientIp: vi.fn(),
  rateLimit: vi.fn(),
  rateLimitResponse: vi.fn(),
  isProd: vi.fn(),
}))

vi.mock('@/lib/admin/session', () => ({
  ADMIN_COOKIE_NAME: 'rr_admin_session',
  createAdminSessionToken: mocks.createAdminSessionToken,
  verifyAdminSessionToken: mocks.verifyAdminSessionToken,
  getAdminSessionMaxAgeSeconds: mocks.getAdminSessionMaxAgeSeconds,
  // Real (pure) copy of the lib's parsing — the actual implementation is unit
  // tested in src/lib/admin/session.test.ts.
  extractMfaFlagFromToken: (token: string | null | undefined): string | null => {
    if (!token) return null
    const parts = token.split('.')
    return parts.length === 5 ? parts[3] : null
  },
}))

vi.mock('@/lib/admin/auth', () => ({
  extractAdminSessionToken: mocks.extractAdminSessionToken,
  getExpectedAdminKey: mocks.getExpectedAdminKey,
  hasValidAdminKey: mocks.hasValidAdminKey,
}))

vi.mock('@/lib/security/csrf', () => ({
  validateCsrfOrigin: mocks.validateCsrfOrigin,
  validateCsrfOriginLenient: mocks.validateCsrfOriginLenient,
}))

vi.mock('@/lib/rate-limit', () => ({
  getClientIp: mocks.getClientIp,
  rateLimit: mocks.rateLimit,
  rateLimitResponse: mocks.rateLimitResponse,
}))

vi.mock('@/lib/security/env', () => ({
  isProd: mocks.isProd,
}))

import { GET, POST, DELETE } from './route'

function makeToken(mfaFlag: '0' | '1' = '0'): string {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const payload = `v2.${exp}.jti-route.${mfaFlag}`
  const sig = createHmac('sha256', ADMIN_KEY).update(payload).digest('hex')
  return `${payload}.${sig}`
}

function req(path: string, init: RequestInit = {}): Request {
  return new Request(`http://localhost:3000${path}`, {
    headers: { 'content-type': 'application/json', ...init.headers },
    ...init,
  })
}

describe('GET /api/admin/session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.validateCsrfOrigin.mockReturnValue(true)
    mocks.getExpectedAdminKey.mockReturnValue(ADMIN_KEY)
  })

  it('returns authenticated + mfaVerified=true for a valid MFA token', async () => {
    mocks.extractAdminSessionToken.mockReturnValue(makeToken('1'))
    mocks.verifyAdminSessionToken.mockResolvedValue(true)

    const res = await GET(req('/api/admin/session', { method: 'GET' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ authenticated: true, mfaVerified: true })
  })

  it('returns mfaVerified=false for a pre-MFA token', async () => {
    mocks.extractAdminSessionToken.mockReturnValue(makeToken('0'))
    mocks.verifyAdminSessionToken.mockResolvedValue(true)

    const res = await GET(req('/api/admin/session', { method: 'GET' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ authenticated: true, mfaVerified: false })
  })

  it('returns authenticated=false when there is no session cookie', async () => {
    mocks.extractAdminSessionToken.mockReturnValue(undefined)
    mocks.verifyAdminSessionToken.mockResolvedValue(false)

    const res = await GET(req('/api/admin/session', { method: 'GET' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ authenticated: false, mfaVerified: false })
  })

  it('blocks cross-origin GETs (anti cookie-validity probing)', async () => {
    mocks.validateCsrfOrigin.mockReturnValue(false)
    const res = await GET(
      req('/api/admin/session', { method: 'GET', headers: { origin: 'https://evil.example' } })
    )
    expect(res.status).toBe(403)
  })
})

describe('POST /api/admin/session (login)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.validateCsrfOriginLenient.mockReturnValue(true)
    mocks.getExpectedAdminKey.mockReturnValue(ADMIN_KEY)
    mocks.getClientIp.mockReturnValue('203.0.113.7')
    mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 4 })
    mocks.rateLimitResponse.mockReturnValue(new Response('', { status: 429 }))
    mocks.isProd.mockReturnValue(false)
  })

  it('blocks cross-origin login (login-CSRF protection)', async () => {
    mocks.validateCsrfOriginLenient.mockReturnValue(false)
    const res = await POST(
      req('/api/admin/session', {
        method: 'POST',
        headers: { origin: 'https://evil.example' },
        body: JSON.stringify({ key: ADMIN_KEY }),
      })
    )
    expect(res.status).toBe(403)
  })

  it('lets same-origin login through and rejects a wrong key', async () => {
    mocks.hasValidAdminKey.mockReturnValue(false)
    const res = await POST(
      req('/api/admin/session', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
        body: JSON.stringify({ key: 'wrong' }),
      })
    )
    expect(res.status).toBe(401)
  })

  it('issues a SameSite=Strict session cookie on a successful same-origin login', async () => {
    mocks.hasValidAdminKey.mockReturnValue(true)
    mocks.getAdminSessionMaxAgeSeconds.mockResolvedValue(43200)
    mocks.createAdminSessionToken.mockResolvedValue('v2.fake-token')

    const res = await POST(
      req('/api/admin/session', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
        body: JSON.stringify({ key: ADMIN_KEY }),
      })
    )
    const setCookie = res.headers.get('set-cookie') ?? ''

    expect(res.status).toBe(200)
    expect(setCookie).toMatch(/rr_admin_session=v2\.fake-token/)
    expect(setCookie).toMatch(/SameSite=strict/i)
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/Max-Age=43200/i)
  })

  it('returns 429 when the per-IP rate limit is exhausted', async () => {
    mocks.rateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfter: 60 })
    const res = await POST(
      req('/api/admin/session', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
        body: JSON.stringify({ key: ADMIN_KEY }),
      })
    )
    expect(res.status).toBe(429)
  })
})

describe('DELETE /api/admin/session (logout)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.validateCsrfOriginLenient.mockReturnValue(true)
    mocks.isProd.mockReturnValue(false)
  })

  it('blocks cross-origin logout (logout-CSRF protection)', async () => {
    mocks.validateCsrfOriginLenient.mockReturnValue(false)
    const res = await DELETE(req('/api/admin/session', { method: 'DELETE', headers: { origin: 'https://evil.example' } }))
    expect(res.status).toBe(403)
  })

  it('clears the session cookie on a same-origin logout', async () => {
    const res = await DELETE(req('/api/admin/session', { method: 'DELETE', headers: { origin: 'http://localhost:3000' } }))
    const setCookie = res.headers.get('set-cookie') ?? ''

    expect(res.status).toBe(200)
    expect(setCookie).toMatch(/rr_admin_session=/)
    expect(setCookie).toMatch(/Max-Age=0/i)
    expect(setCookie).toMatch(/SameSite=strict/i)
  })
})
