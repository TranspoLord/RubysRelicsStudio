import { describe, it, expect, afterEach, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { extractMfaFlagFromToken, verifyAdminSessionToken } from '@/lib/admin/session'

const ADMIN_KEY = 'test-admin-key'
const PREV_FALLBACK = process.env.ALLOW_LEGACY_ADMIN_SESSION_FALLBACK

afterEach(() => {
  if (PREV_FALLBACK === undefined) delete process.env.ALLOW_LEGACY_ADMIN_SESSION_FALLBACK
  else process.env.ALLOW_LEGACY_ADMIN_SESSION_FALLBACK = PREV_FALLBACK
})

// Mirror session.ts signing: v2.{exp}.{jti}.{mfaFlag}.{hmacSig}
function makeToken(opts: { exp?: number; jti?: string; mfaFlag?: string; sig?: string }, key = ADMIN_KEY): string {
  const exp = opts.exp ?? Math.floor(Date.now() / 1000) + 3600
  const jti = opts.jti ?? 'jti-test'
  const flag = opts.mfaFlag ?? '0'
  const payload = `v2.${exp}.${jti}.${flag}`
  const sig = opts.sig ?? createHmac('sha256', key).update(payload).digest('hex')
  return `${payload}.${sig}`
}

function mkSupabaseRow(row: { data?: unknown | null; error?: unknown | null }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn(async () => row),
        }),
      }),
    }),
  }
}

function mkSupabaseThrowing() {
  return {
    from: () => {
      throw new Error('DB unreachable')
    },
  }
}

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseAdmin: vi.fn(),
}))
vi.mock('@/lib/security/logger', () => ({
  safeLogError: vi.fn(),
}))
vi.mock('@/lib/storefront-settings', () => ({
  getAdminSessionSettings: vi.fn(),
}))

import { getSupabaseAdmin } from '@/lib/supabase/client'

function setSupabase(supabase: unknown) {
  vi.mocked(getSupabaseAdmin).mockReturnValue(supabase as any)
}

const futureIso = new Date(Date.now() + 3600_000).toISOString()

describe('extractMfaFlagFromToken', () => {
  it('returns the mfa flag (parts[3]) for a v2 token', () => {
    expect(extractMfaFlagFromToken(makeToken({ mfaFlag: '1' }))).toBe('1')
    expect(extractMfaFlagFromToken(makeToken({ mfaFlag: '0' }))).toBe('0')
  })

  it('returns null for undefined/null/empty', () => {
    expect(extractMfaFlagFromToken(undefined)).toBeNull()
    expect(extractMfaFlagFromToken(null)).toBeNull()
    expect(extractMfaFlagFromToken('')).toBeNull()
  })

  it('returns null for malformed / v1 tokens', () => {
    expect(extractMfaFlagFromToken('garbage')).toBeNull()
    expect(extractMfaFlagFromToken('v1.123.jti.sig')).toBeNull() // v1 = 4 parts

    expect(extractMfaFlagFromToken('v2.1.2.3')).toBeNull() // 4 parts
  })
})

describe('verifyAdminSessionToken', () => {
  it('rejects a missing token or key', async () => {
    expect(await verifyAdminSessionToken(undefined, ADMIN_KEY)).toBe(false)
    expect(await verifyAdminSessionToken(makeToken({}), '')).toBe(false)
  })

  it('rejects a v1 (4-part) token', async () => {
    expect(await verifyAdminSessionToken('v1.x.y.abc.sig', ADMIN_KEY)).toBe(false)
  })

  it('rejects an expired token', async () => {
    const token = makeToken({ exp: Math.floor(Date.now() / 1000) - 10, mfaFlag: '1' })
    expect(await verifyAdminSessionToken(token, ADMIN_KEY, true)).toBe(false)
  })

  it('rejects a tampered signature', async () => {
    const token = makeToken({ mfaFlag: '1' })
    const last = token.slice(-1)
    const tampered = token.slice(0, -1) + (last === '0' ? '1' : '0')
    expect(await verifyAdminSessionToken(tampered, ADMIN_KEY, true)).toBe(false)
  })

  it('rejects a token lacking MFA when MFA is required', async () => {
    expect(await verifyAdminSessionToken(makeToken({ mfaFlag: '0' }), ADMIN_KEY, true)).toBe(false)
  })

  it('accepts a valid pre-MFA token when MFA is not required', async () => {
    setSupabase(mkSupabaseRow({ data: { revoked_at: null, expires_at: futureIso }, error: null }))
    expect(await verifyAdminSessionToken(makeToken({ mfaFlag: '0' }), ADMIN_KEY, false)).toBe(true)
  })

  it('is fail-closed (rejects) when the DB errors and the toggle is off', async () => {
    process.env.ALLOW_LEGACY_ADMIN_SESSION_FALLBACK = ''
    setSupabase(mkSupabaseThrowing())
    expect(await verifyAdminSessionToken(makeToken({ mfaFlag: '1' }), ADMIN_KEY, false)).toBe(false)
  })

  it('is fail-open (accepts valid HMAC) when the DB throws and the toggle is on', async () => {
    process.env.ALLOW_LEGACY_ADMIN_SESSION_FALLBACK = 'true'
    setSupabase(mkSupabaseThrowing())
    expect(await verifyAdminSessionToken(makeToken({ mfaFlag: '1' }), ADMIN_KEY, false)).toBe(true)
  })

  it('honors the toggle for a missing session row', async () => {
    setSupabase(mkSupabaseRow({ data: null, error: null }))
    const token = makeToken({ mfaFlag: '1' })

    process.env.ALLOW_LEGACY_ADMIN_SESSION_FALLBACK = ''
    expect(await verifyAdminSessionToken(token, ADMIN_KEY, false)).toBe(false)

    process.env.ALLOW_LEGACY_ADMIN_SESSION_FALLBACK = 'true'
    expect(await verifyAdminSessionToken(token, ADMIN_KEY, false)).toBe(true)
  })

  it('rejects a revoked session row', async () => {
    setSupabase(mkSupabaseRow({ data: { revoked_at: new Date().toISOString(), expires_at: futureIso }, error: null }))
    expect(await verifyAdminSessionToken(makeToken({ mfaFlag: '1' }), ADMIN_KEY, true)).toBe(false)
  })

  it('accepts a valid MFA-verified session', async () => {
    setSupabase(mkSupabaseRow({ data: { revoked_at: null, expires_at: futureIso }, error: null }))
    expect(await verifyAdminSessionToken(makeToken({ mfaFlag: '1' }), ADMIN_KEY, true)).toBe(true)
  })
})
