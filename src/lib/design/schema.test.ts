import { describe, expect, it } from 'vitest'
import { parseDesignDocument, type DesignDocumentV1 } from './schema'

function buildValidDocument(): DesignDocumentV1 {
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
      {
        id: 'layer-text-1',
        kind: 'text',
        text: 'Hello',
        font_family: 'Arial',
        font_size_pt: 16,
        color_hex: '#1A1A1A',
        x_in: 1,
        y_in: 1,
        rotation_deg: 0,
        opacity: 1,
        z_index: 1,
      },
    ],
    metadata: {
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      source: 'shop',
    },
  }
}

describe('parseDesignDocument', () => {
  it('accepts a valid v1 document', () => {
    const doc = buildValidDocument()
    expect(parseDesignDocument(doc)).toEqual(doc)
  })

  it('rejects unknown top-level keys', () => {
    const doc = buildValidDocument() as DesignDocumentV1 & { unsupported_key?: string }
    doc.unsupported_key = 'x'
    expect(parseDesignDocument(doc)).toBeNull()
  })

  it('rejects more than 40 layers', () => {
    const doc = buildValidDocument()
    doc.layers = Array.from({ length: 41 }, (_, index) => ({
      id: `layer-${index}`,
      kind: 'text' as const,
      text: 'x',
      font_family: 'Arial',
      font_size_pt: 12,
      color_hex: '#111111',
      x_in: 0,
      y_in: 0,
      rotation_deg: 0,
      opacity: 1,
      z_index: index,
    }))

    expect(parseDesignDocument(doc)).toBeNull()
  })
})
