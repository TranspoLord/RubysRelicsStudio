import { describe, expect, it } from 'vitest'
import { verifyDesignAssetOwnership } from './persistence'
import type { DesignDocumentV1 } from './schema'

function buildImageDocument(): DesignDocumentV1 {
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
        id: 'layer-image-1',
        kind: 'image',
        asset_path: '123e4567-e89b-12d3-a456-426614174000/art.png',
        upload_token: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        x_in: 0,
        y_in: 0,
        width_in: 2,
        height_in: 2,
        rotation_deg: 0,
        opacity: 1,
        z_index: 0,
      },
    ],
    metadata: {
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      source: 'shop',
    },
  }
}

function createSupabaseMock(responseFactory: () => { data: any; error: any }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            gt: () => ({
              maybeSingle: async () => responseFactory(),
            }),
          }),
        }),
      }),
    }),
  }
}

describe('verifyDesignAssetOwnership', () => {
  it('returns ASSET_UNAUTHORIZED for missing upload bindings', async () => {
    const supabase = createSupabaseMock(() => ({ data: null, error: null }))
    const result = await verifyDesignAssetOwnership(supabase, buildImageDocument())

    expect(result.ok).toBe(false)
    expect(result.code).toBe('ASSET_UNAUTHORIZED')
  })

  it('returns LIMIT_EXCEEDED when an asset exceeds per-file size cap', async () => {
    const supabase = createSupabaseMock(() => ({
      data: {
        file_path: '123e4567-e89b-12d3-a456-426614174000/art.png',
        upload_token: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        file_size_bytes: 16 * 1024 * 1024,
      },
      error: null,
    }))

    const result = await verifyDesignAssetOwnership(supabase, buildImageDocument())

    expect(result.ok).toBe(false)
    expect(result.code).toBe('LIMIT_EXCEEDED')
  })
})
