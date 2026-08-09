import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import { renderDesignArtifact } from './export-renderer'
import type { DesignDocumentV1 } from './schema'

function createSampleDocument(): DesignDocumentV1 {
  const now = new Date().toISOString()
  return {
    schema_version: '1.0',
    design_id: 'design-1',
    product_id: 'product-1',
    template_id: 'template-1',
    units: 'in',
    canvas: {
      width_in: 1,
      height_in: 1,
      dpi: 72,
      bleed_in: 0,
      safe_inset_in: 0,
    },
    layers: [
      {
        id: 'img-1',
        kind: 'image',
        asset_path: '123e4567-e89b-12d3-a456-426614174000/red.png',
        upload_token: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        x_in: 0.1,
        y_in: 0.1,
        width_in: 0.2,
        height_in: 0.2,
        rotation_deg: 0,
        opacity: 1,
        z_index: 0,
      },
      {
        id: 'txt-1',
        kind: 'text',
        text: 'A',
        font_family: 'Arial',
        font_size_pt: 9,
        color_hex: '#000000',
        x_in: 0.55,
        y_in: 0.5,
        rotation_deg: 0,
        opacity: 1,
        z_index: 1,
      },
    ],
    metadata: {
      created_at: now,
      updated_at: now,
      source: 'shop',
    },
  }
}

function createRedPngBytes(): Uint8Array {
  const png = new PNG({ width: 1, height: 1 })
  png.data[0] = 255
  png.data[1] = 0
  png.data[2] = 0
  png.data[3] = 255
  return new Uint8Array(PNG.sync.write(png))
}

describe('renderDesignArtifact', () => {
  it('composites image assets into PNG output', async () => {
    const doc = createSampleDocument()
    const red = createRedPngBytes()

    const result = await renderDesignArtifact(doc, 'png', 72, {
      loadAsset: async () => ({ bytes: red }),
    })

    const output = PNG.sync.read(Buffer.from(result.bytes))

    const sampleX = 8
    const sampleY = 8
    const idx = (sampleY * output.width + sampleX) * 4
    const r = output.data[idx]
    const g = output.data[idx + 1]
    const b = output.data[idx + 2]

    expect(r).toBeGreaterThan(200)
    expect(g).toBeLessThan(40)
    expect(b).toBeLessThan(40)
  })

  it('emits a valid PDF signature', async () => {
    const doc = createSampleDocument()
    const red = createRedPngBytes()

    const result = await renderDesignArtifact(doc, 'pdf', 72, {
      loadAsset: async () => ({ bytes: red }),
    })

    const header = Buffer.from(result.bytes).subarray(0, 4).toString('ascii')
    expect(header).toBe('%PDF')
  })
})
