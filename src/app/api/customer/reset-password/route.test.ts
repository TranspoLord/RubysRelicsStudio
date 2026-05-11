import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resetPasswordWithToken: vi.fn(),
  rateLimit: vi.fn(),
  getClientIp: vi.fn(),
}))

vi.mock('@/lib/auth/customer', () => ({
  resetPasswordWithToken: mocks.resetPasswordWithToken,
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: mocks.rateLimit,
  getClientIp: mocks.getClientIp,
  rateLimitResponse: vi.fn((retryAfter) => ({
    status: 429,
    json: async () => ({ error: 'Rate limited', retryAfter }),
  })),
}))

vi.mock('@/lib/validate', () => ({
  validatePassword: vi.fn((pwd) => {
    if (!pwd || pwd.length < 8) return 'Password must be at least 8 characters'
    return null
  }),
}))

import { POST } from './route'

describe('POST /api/customer/reset-password', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getClientIp.mockReturnValue('192.168.1.1')
    mocks.rateLimit.mockReturnValue({ allowed: true, retryAfter: null })
  })

  it('resets password successfully with valid token and password', async () => {
    mocks.resetPasswordWithToken.mockResolvedValue({ error: null })

    const request = new Request('http://localhost/api/customer/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: 'reset_token_12345',
        password: 'NewPassword123!',
      }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ message: 'Password reset successfully.' })
    expect(mocks.resetPasswordWithToken).toHaveBeenCalledWith('reset_token_12345', 'NewPassword123!')
  })

  it('returns 400 when token is missing', async () => {
    const request = new Request('http://localhost/api/customer/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        password: 'NewPassword123!',
      }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'Token is required.' })
  })

  it('returns 400 when password is too short', async () => {
    const request = new Request('http://localhost/api/customer/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: 'reset_token_12345',
        password: 'short',
      }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBeDefined()
  })

  it('returns 400 when reset token is invalid', async () => {
    mocks.resetPasswordWithToken.mockResolvedValue({ error: 'Invalid or expired token' })

    const request = new Request('http://localhost/api/customer/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: 'invalid_token',
        password: 'NewPassword123!',
      }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'Invalid or expired token' })
  })
})
