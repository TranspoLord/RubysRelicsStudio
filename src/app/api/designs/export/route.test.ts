import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  requireAdminApiSession: vi.fn(),
  writeAdminAuditLog: vi.fn(),
  getClientIp: vi.fn(),
  rateLimit: vi.fn(),
  rateLimitResponse: vi.fn(),
  requireCsrfOriginOnly: vi.fn(),
  safeLogError: vi.fn(),
  verifyDesignAssetOwnership: vi.fn(),
  renderDesignArtifact: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}))

vi.mock('@/lib/admin/auth', () => ({
  requireAdminApiSession: mocks.requireAdminApiSession,
}))

vi.mock('@/lib/admin/audit', () => ({
  writeAdminAuditLog: mocks.writeAdminAuditLog,
}))

vi.mock('@/lib/rate-limit', () => ({
  getClientIp: mocks.getClientIp,
  rateLimit: mocks.rateLimit,
  rateLimitResponse: mocks.rateLimitResponse,
}))

vi.mock('@/lib/security/csrf', () => ({
  requireCsrfOriginOnly: mocks.requireCsrfOriginOnly,
}))

vi.mock('@/lib/security/logger', () => ({
  safeLogError: mocks.safeLogError,
}))

vi.mock('@/lib/design/persistence', () => ({
  verifyDesignAssetOwnership: mocks.verifyDesignAssetOwnership,
}))

vi.mock('@/lib/design/export-renderer', () => ({
  renderDesignArtifact: mocks.renderDesignArtifact,
}))

import { POST } from './route'

function buildValidDocument() {
  const now = new Date().toISOString()
  return {
    schema_version: '1.0',
    design_id: 'dsg_1',
    product_id: 'prd_1',
    template_id: 'tpl_1',
    units: 'in',
    canvas: {
      width_in: 4,
      height_in: 6,
      dpi: 300,
      bleed_in: 0.125,
      safe_inset_in: 0.125,
    },
    layers: [
      {
        id: 'lyr_1',
        kind: 'text',
        text: 'Hello',
        font_family: 'Arial',
        font_size_pt: 18,
        color_hex: '#111111',
        x_in: 1,
        y_in: 2,
        rotation_deg: 0,
        opacity: 1,
        z_index: 0,
      },
    ],
    metadata: {
      created_at: now,
      updated_at: now,
      source: 'shop',
    },
  }
}

function createSupabaseForRoute(options?: {
  designDocument?: unknown
  existingExport?: { id: string; artifact_path: string; artifact_sha256: string } | null
}) {
  const designDocument = options?.designDocument ?? buildValidDocument()
  const existingExport = options?.existingExport ?? null

  const updateEq = vi.fn(async () => ({ error: null }))

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'exp_product_designs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: 'design-1',
                  design_document: designDocument,
                  document_hash: 'hash-1',
                },
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === 'exp_product_design_exports') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(() => ({
                        maybeSingle: vi.fn(async () => ({ data: existingExport, error: null })),
                      })),
                    })),
                  })),
                })),
              })),
            })),
          })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id: 'export-1' }, error: null })),
            })),
          })),
          update: vi.fn(() => ({ eq: updateEq })),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    }),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async () => ({ error: null })),
      })),
    },
  }

  return { supabase }
}

describe('POST /api/designs/export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireCsrfOriginOnly.mockReturnValue(null)
    mocks.requireAdminApiSession.mockResolvedValue({ ok: true, context: {} })
    mocks.writeAdminAuditLog.mockResolvedValue(undefined)
    mocks.getClientIp.mockReturnValue('127.0.0.1')
    mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfter: null })
    mocks.rateLimitResponse.mockImplementation((retryAfter: number) =>
      Response.json({ error: 'Rate limited', retryAfter }, { status: 429 })
    )
    mocks.verifyDesignAssetOwnership.mockResolvedValue({ ok: true, totalSourceBytes: 0, assets: [] })
    mocks.renderDesignArtifact.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      sha256: 'abc123',
      widthPx: 1200,
      heightPx: 1800,
    })
  })

  it('returns INVALID_SCHEMA when stored document is malformed', async () => {
    const { supabase } = createSupabaseForRoute({ designDocument: { bad: 'shape' } })
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const response = await POST(
      new Request('http://localhost/api/designs/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ designId: 'design-1', formats: ['png'], dpi: 300 }),
      })
    )

    const payload = await response.json()
    expect(response.status).toBe(422)
    expect(payload.code).toBe('INVALID_SCHEMA')
    expect(mocks.writeAdminAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'design_export.generate',
        entityType: 'product_design',
        entityId: 'design-1',
        status: 'failure',
        details: expect.objectContaining({ reason: 'invalid_stored_document' }),
      })
    )
  })

  it('reuses existing successful artifact for same design hash + format', async () => {
    const { supabase } = createSupabaseForRoute({
      existingExport: {
        id: 'exp-existing-1',
        artifact_path: 'design-1/hash-1-300.png',
        artifact_sha256: 'persisted-sha',
      },
    })
    mocks.getSupabaseAdmin.mockReturnValue(supabase)

    const response = await POST(
      new Request('http://localhost/api/designs/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ designId: 'design-1', formats: ['png'], dpi: 300 }),
      })
    )

    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.exports).toHaveLength(1)
    expect(payload.exports[0]).toEqual(
      expect.objectContaining({
        format: 'png',
        status: 'succeeded',
        reused: true,
        artifactPath: 'design-1/hash-1-300.png',
        artifactSha256: 'persisted-sha',
      })
    )
    expect(mocks.renderDesignArtifact).not.toHaveBeenCalled()
    expect(mocks.writeAdminAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'design_export.generate',
        entityType: 'product_design',
        entityId: 'design-1',
        status: 'success',
        details: expect.objectContaining({
          succeededCount: 1,
          failedCount: 0,
        }),
      })
    )
  })
})
