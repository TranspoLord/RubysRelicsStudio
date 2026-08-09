import type { DesignDocumentV1 } from '@/lib/design/schema'

export type DesignExportFormat = 'png' | 'pdf'

export interface PreviewRenderer {
  load(document: DesignDocumentV1): Promise<void>
  renderPreview(target: unknown): Promise<void>
  export(document: DesignDocumentV1, format: DesignExportFormat): Promise<Uint8Array>
}

export class Renderer2DKonvaAdapter implements PreviewRenderer {
  async load(_document: DesignDocumentV1): Promise<void> {
    // Server-side render adapter intentionally deferred until a hardened
    // raster/PDF implementation is selected.
  }

  async renderPreview(_target: unknown): Promise<void> {
    // Preview rendering is currently client-side in ProductDesigner.
  }

  async export(_document: DesignDocumentV1, format: DesignExportFormat): Promise<Uint8Array> {
    throw new Error(`2D export adapter not configured for ${format}.`)
  }
}

export class Renderer3DDisabledAdapter implements PreviewRenderer {
  async load(_document: DesignDocumentV1): Promise<void> {
    throw new Error('3D renderer is disabled for the current release gate.')
  }

  async renderPreview(_target: unknown): Promise<void> {
    throw new Error('3D renderer is disabled for the current release gate.')
  }

  async export(_document: DesignDocumentV1, _format: DesignExportFormat): Promise<Uint8Array> {
    throw new Error('3D renderer is disabled for the current release gate.')
  }
}
