import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdminApiSession: vi.fn(),
  writeAdminAuditLog: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  getClientIp: vi.fn(),
  rateLimit: vi.fn(),
  rateLimitResponse: vi.fn(),
}))

vi.mock('@/lib/admin/auth', () => ({
  requireAdminApiSession: mocks.requireAdminApiSession,
}))

vi.mock('@/lib/admin/audit', () => ({
  writeAdminAuditLog: mocks.writeAdminAuditLog,
}))

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}))

vi.mock('@/lib/rate-limit', () => ({
  getClientIp: mocks.getClientIp,
  rateLimit: mocks.rateLimit,
  rateLimitResponse: mocks.rateLimitResponse,
}))

import { GET } from './route'

function createSupabase(options?: { customerAccessRow?: Record<string, unknown> | null }) {
  const customerAccessRow = options?.customerAccessRow ?? null

  return {
    from: vi.fn((table: string) => {
      if (table === 'exp_product_design_exports') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: 'exp-1',
                  design_id: 'design-1',
                  format: 'png',
                  artifact_path: 'design-1/hash-1-300.png',
                  status: 'succeeded',
                },
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === 'exp_custom_requests') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: customerAccessRow,
                    error: null,
                  })),
                })),
              })),
            })),
          })),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    }),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(async () => ({
          data: { signedUrl: 'https://example.com/signed-url' },
          error: null,
        })),
      })),
    },
  }
}

describe('GET /api/designs/exports/[id]/download', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getClientIp.mockReturnValue('127.0.0.1')
    mocks.writeAdminAuditLog.mockResolvedValue(undefined)
    mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfter: null })
    mocks.rateLimitResponse.mockImplementation((retryAfter: number) =>
      Response.json({ error: 'Rate limited', retryAfter }, { status: 429 })
    )
    mocks.requireAdminApiSession.mockResolvedValue({ ok: true, context: {} })
  })

  it('allows customer download with valid custom request access token', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(
      createSupabase({
        customerAccessRow: {
          id: 'req-1',
          customer_access_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        },
      })
    )

    const response = await GET(
      new Request('http://localhost/api/designs/exports/exp-1/download?requestId=req-1&access=token-abc'),
      { params: Promise.resolve({ id: 'exp-1' }) }
    )

    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload).toEqual(
      expect.objectContaining({
        exportId: 'exp-1',
        format: 'png',
        expiresInSeconds: 600,
        url: 'https://example.com/signed-url',
      })
    )
    expect(mocks.requireAdminApiSession).not.toHaveBeenCalled()
    expect(mocks.writeAdminAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'design_export.download',
        entityType: 'design_export',
        entityId: 'exp-1',
        status: 'success',
        details: expect.objectContaining({ accessPath: 'customer_token' }),
      })
    )
  })

  it('falls back to admin auth when customer token is invalid', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(createSupabase({ customerAccessRow: null }))

    const response = await GET(
      new Request('http://localhost/api/designs/exports/exp-1/download?requestId=req-1&access=bad-token'),
      { params: Promise.resolve({ id: 'exp-1' }) }
    )

    expect(response.status).toBe(200)
    expect(mocks.requireAdminApiSession).toHaveBeenCalledTimes(1)
  })

  it('returns 403 if neither customer token nor admin auth is valid', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(createSupabase({ customerAccessRow: null }))
    mocks.requireAdminApiSession.mockResolvedValue({ ok: false, response: Response.json({ error: 'nope' }, { status: 401 }) })

    const response = await GET(
      new Request('http://localhost/api/designs/exports/exp-1/download?requestId=req-1&access=bad-token'),
      { params: Promise.resolve({ id: 'exp-1' }) }
    )

    const payload = await response.json()
    expect(response.status).toBe(403)
    expect(payload).toEqual({ error: 'Not authorized to access this export.' })
    expect(mocks.writeAdminAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'design_export.download',
        entityType: 'design_export',
        entityId: 'exp-1',
        status: 'failure',
        details: expect.objectContaining({ reason: 'authorization_failed' }),
      })
    )
  })
})
