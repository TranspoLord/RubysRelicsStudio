import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  verifyAdminSessionToken: vi.fn(),
  getExpectedAdminKey: vi.fn(),
  verifyMFACode: vi.fn(),
  invalidateChallengeToken: vi.fn(),
  createAdminSessionToken: vi.fn(),
  getAdminSessionMaxAgeSeconds: vi.fn(),
  getClientIp: vi.fn(),
  rateLimit: vi.fn(),
  isProd: vi.fn(),
  safeLogError: vi.fn(),
}))

vi.mock('@/lib/admin/session', () => ({
  ADMIN_COOKIE_NAME: 'rr_admin_session',
  createAdminSessionToken: mocks.createAdminSessionToken,
  getAdminSessionMaxAgeSeconds: mocks.getAdminSessionMaxAgeSeconds,
  verifyAdminSessionToken: mocks.verifyAdminSessionToken,
}))

vi.mock('@/lib/admin/auth', () => ({
  getExpectedAdminKey: mocks.getExpectedAdminKey,
}))

vi.mock('@/lib/admin/mfa-store', () => ({
  verifyMFACode: mocks.verifyMFACode,
  invalidateChallengeToken: mocks.invalidateChallengeToken,
}))

vi.mock('@/lib/rate-limit', () => ({
  getClientIp: mocks.getClientIp,
  rateLimit: mocks.rateLimit,
}))

vi.mock('@/lib/security/env', () => ({
  isProd: mocks.isProd,
}))

vi.mock('@/lib/security/logger', () => ({
  safeLogError: mocks.safeLogError,
}))

import { POST } from './route'

function req(body: string, cookies: string = ''): NextRequest {
  return new Request('http://localhost:3000/api/admin/verify-mfa', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookies,
    },
    body,
  }) as any
}

describe('POST /api/admin/verify-mfa', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.verifyAdminSessionToken.mockResolvedValue(true)
    mocks.getExpectedAdminKey.mockReturnValue('test-admin-key')
    mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 4 })
    mocks.verifyMFACode.mockResolvedValue(true)
    mocks.createAdminSessionToken.mockResolvedValue('v2.mfa-token')
    mocks.getAdminSessionMaxAgeSeconds.mockResolvedValue(43200)
    mocks.getClientIp.mockReturnValue('203.0.113.7')
    mocks.isProd.mockReturnValue(false)
  })

  it('rejects a request body that exceeds the 100KB byte limit with 413', async () => {
    // 30,000 four-byte emoji = 120,000 bytes, wrapped in JSON = ~120,020 bytes.
    // This exceeds the 102,400-byte (100KB) limit.
    const oversized = JSON.stringify({ code: '🎨'.repeat(30_000) })
    const res = await POST(req(oversized, 'rr_admin_session=v2.pre-mfa-token; admin_mfa_challenge=challenge-token'))
    expect(res.status).toBe(413)
    const body = await res.json()
    expect(body.error).toBe('Request body too large.')
  })

  it('accepts a valid code and issues an MFA-verified session cookie', async () => {
    const res = await POST(
      req(
        JSON.stringify({ code: '123456', deviceFingerprint: 'fp' }),
        'rr_admin_session=v2.pre-mfa-token; admin_mfa_challenge=challenge-token'
      )
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)

    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/rr_admin_session=v2\.mfa-token/)
    expect(setCookie).toMatch(/SameSite=strict/i)
  })
})
