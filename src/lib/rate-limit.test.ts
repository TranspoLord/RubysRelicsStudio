import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { rateLimit, rateLimitResponse, getClientIp } from './rate-limit'

const mockRpc = vi.fn()
const mockSupabase = {
  rpc: mockRpc,
}

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseAdmin: vi.fn(() => mockSupabase),
}))

vi.mock('@/lib/security/logger', () => ({
  safeLogError: vi.fn(),
}))

describe('rateLimit', () => {
  beforeEach(() => {
    mockRpc.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('allows requests under the limit', async () => {
    mockRpc.mockResolvedValue({ data: 1, error: null })
    const result = await rateLimit('test-key', 5, 60_000)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it('denies requests over the limit', async () => {
    mockRpc.mockResolvedValue({ data: 6, error: null })
    const result = await rateLimit('test-key', 5, 60_000)
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.retryAfter).toBeGreaterThan(0)
  })

  it('fails closed by default when the RPC returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('DB down') })
    const result = await rateLimit('test-key', 5, 60_000)
    expect(result.allowed).toBe(false)
    expect(result.retryAfter).toBe(60)
  })

  it('fails closed by default when the RPC throws', async () => {
    mockRpc.mockRejectedValue(new Error('network failure'))
    const result = await rateLimit('test-key', 5, 60_000)
    expect(result.allowed).toBe(false)
    expect(result.retryAfter).toBe(60)
  })

  it('can be explicitly configured to fail open', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('DB down') })
    const result = await rateLimit('test-key', 5, 60_000, { failClosed: false })
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4)
  })
})

describe('rateLimitResponse', () => {
  it('returns a 429 with Retry-After header', () => {
    const response = rateLimitResponse(120)
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('120')
  })
})

describe('getClientIp', () => {
  it('returns the first x-forwarded-for IP when running on Vercel', () => {
    vi.stubEnv('VERCEL', '1')
    const request = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' },
    })
    expect(getClientIp(request)).toBe('203.0.113.1')
  })

  it('falls back to x-vercel-forwarded-for when x-forwarded-for is absent', () => {
    vi.stubEnv('VERCEL', '1')
    const request = new Request('https://example.com', {
      headers: { 'x-vercel-forwarded-for': '198.51.100.2' },
    })
    expect(getClientIp(request)).toBe('198.51.100.2')
  })

  it('returns unknown outside Vercel when no trusted proxy is configured', () => {
    vi.stubEnv('VERCEL', undefined)
    vi.stubEnv('TRUST_PROXY', undefined)
    const request = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '203.0.113.1' },
    })
    expect(getClientIp(request)).toBe('unknown')
  })

  it('trusts x-forwarded-for when TRUST_PROXY is true', () => {
    vi.stubEnv('VERCEL', undefined)
    vi.stubEnv('TRUST_PROXY', 'true')
    const request = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '203.0.113.5' },
    })
    expect(getClientIp(request)).toBe('203.0.113.5')
  })
})
