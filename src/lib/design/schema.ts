export type DesignDocumentVersion = '1.0'

export interface DesignCanvas {
  width_in: number
  height_in: number
  dpi: number
  bleed_in: number
  safe_inset_in: number
}

export interface DesignImageLayer {
  id: string
  kind: 'image'
  asset_path: string
  upload_token: string
  x_in: number
  y_in: number
  width_in: number
  height_in: number
  rotation_deg: number
  opacity: number
  z_index: number
}

export interface DesignTextLayer {
  id: string
  kind: 'text'
  text: string
  font_family: string
  font_size_pt: number
  color_hex: string
  x_in: number
  y_in: number
  rotation_deg: number
  opacity: number
  z_index: number
}

export type DesignLayer = DesignImageLayer | DesignTextLayer

export interface DesignDocumentV1 {
  schema_version: DesignDocumentVersion
  design_id: string
  product_id: string
  template_id: string
  units: 'in'
  canvas: DesignCanvas
  layers: DesignLayer[]
  metadata: {
    created_at: string
    updated_at: string
    source: 'shop' | 'custom_order'
  }
}

const UPLOAD_PATH_RE = /^[0-9a-f-]{36}\/[a-z0-9._-]{1,120}$/
const UPLOAD_TOKEN_RE = /^[a-f0-9]{48}$/
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number') return null
  if (!Number.isFinite(value)) return null
  return value
}

function asString(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLen) return null
  return trimmed
}

function validateCanvas(value: unknown): DesignCanvas | null {
  if (!isPlainObject(value)) return null
  if (!hasOnlyKeys(value, ['width_in', 'height_in', 'dpi', 'bleed_in', 'safe_inset_in'])) return null

  const width = asFiniteNumber(value.width_in)
  const height = asFiniteNumber(value.height_in)
  const dpi = asFiniteNumber(value.dpi)
  const bleed = asFiniteNumber(value.bleed_in)
  const safeInset = asFiniteNumber(value.safe_inset_in)

  if (width === null || width <= 0 || width > 40) return null
  if (height === null || height <= 0 || height > 40) return null
  if (dpi === null || dpi < 72 || dpi > 1200) return null
  if (bleed === null || bleed < 0 || bleed > 1) return null
  if (safeInset === null || safeInset < 0 || safeInset > 2) return null

  return {
    width_in: width,
    height_in: height,
    dpi,
    bleed_in: bleed,
    safe_inset_in: safeInset,
  }
}

function validateLayerPosition(value: Record<string, unknown>): {
  x_in: number
  y_in: number
  rotation_deg: number
  opacity: number
  z_index: number
} | null {
  const x = asFiniteNumber(value.x_in)
  const y = asFiniteNumber(value.y_in)
  const rotation = asFiniteNumber(value.rotation_deg)
  const opacity = asFiniteNumber(value.opacity)
  const zIndex = asFiniteNumber(value.z_index)

  if (x === null || x < -200 || x > 200) return null
  if (y === null || y < -200 || y > 200) return null
  if (rotation === null || rotation < -360 || rotation > 360) return null
  if (opacity === null || opacity < 0 || opacity > 1) return null
  if (zIndex === null || zIndex < 0 || zIndex > 5000) return null

  return {
    x_in: x,
    y_in: y,
    rotation_deg: rotation,
    opacity,
    z_index: Math.floor(zIndex),
  }
}

function validateImageLayer(value: Record<string, unknown>): DesignImageLayer | null {
  const allowed = [
    'id',
    'kind',
    'asset_path',
    'upload_token',
    'x_in',
    'y_in',
    'width_in',
    'height_in',
    'rotation_deg',
    'opacity',
    'z_index',
  ]
  if (!hasOnlyKeys(value, allowed)) return null

  const id = asString(value.id, 80)
  const path = asString(value.asset_path, 200)
  const token = asString(value.upload_token, 80)
  const width = asFiniteNumber(value.width_in)
  const height = asFiniteNumber(value.height_in)
  const position = validateLayerPosition(value)

  if (!id || !path || !UPLOAD_PATH_RE.test(path)) return null
  if (!token || !UPLOAD_TOKEN_RE.test(token)) return null
  if (width === null || width <= 0 || width > 40) return null
  if (height === null || height <= 0 || height > 40) return null
  if (!position) return null

  return {
    id,
    kind: 'image',
    asset_path: path,
    upload_token: token,
    width_in: width,
    height_in: height,
    ...position,
  }
}

function validateTextLayer(value: Record<string, unknown>): DesignTextLayer | null {
  const allowed = [
    'id',
    'kind',
    'text',
    'font_family',
    'font_size_pt',
    'color_hex',
    'x_in',
    'y_in',
    'rotation_deg',
    'opacity',
    'z_index',
  ]
  if (!hasOnlyKeys(value, allowed)) return null

  const id = asString(value.id, 80)
  const text = asString(value.text, 800)
  const fontFamily = asString(value.font_family, 120)
  const color = asString(value.color_hex, 16)
  const fontSize = asFiniteNumber(value.font_size_pt)
  const position = validateLayerPosition(value)

  if (!id || !text || !fontFamily || !color) return null
  if (!HEX_COLOR_RE.test(color)) return null
  if (fontSize === null || fontSize < 6 || fontSize > 400) return null
  if (!position) return null

  return {
    id,
    kind: 'text',
    text,
    font_family: fontFamily,
    font_size_pt: fontSize,
    color_hex: color,
    ...position,
  }
}

function validateLayers(value: unknown): DesignLayer[] | null {
  if (!Array.isArray(value)) return null
  if (value.length > 40) return null

  const layers: DesignLayer[] = []
  for (const layer of value) {
    if (!isPlainObject(layer)) return null

    if (layer.kind === 'image') {
      const parsed = validateImageLayer(layer)
      if (!parsed) return null
      layers.push(parsed)
      continue
    }

    if (layer.kind === 'text') {
      const parsed = validateTextLayer(layer)
      if (!parsed) return null
      layers.push(parsed)
      continue
    }

    return null
  }

  return layers
}

function validateMetadata(value: unknown): DesignDocumentV1['metadata'] | null {
  if (!isPlainObject(value)) return null
  if (!hasOnlyKeys(value, ['created_at', 'updated_at', 'source'])) return null

  const createdAt = asString(value.created_at, 64)
  const updatedAt = asString(value.updated_at, 64)
  const source = value.source

  if (!createdAt || Number.isNaN(new Date(createdAt).getTime())) return null
  if (!updatedAt || Number.isNaN(new Date(updatedAt).getTime())) return null
  if (source !== 'shop' && source !== 'custom_order') return null

  return {
    created_at: createdAt,
    updated_at: updatedAt,
    source,
  }
}

export function parseDesignDocument(value: unknown): DesignDocumentV1 | null {
  if (!isPlainObject(value)) return null

  const allowedTopLevel = [
    'schema_version',
    'design_id',
    'product_id',
    'template_id',
    'units',
    'canvas',
    'layers',
    'metadata',
  ]
  if (!hasOnlyKeys(value, allowedTopLevel)) return null

  if (value.schema_version !== '1.0') return null
  if (value.units !== 'in') return null

  const designId = asString(value.design_id, 100)
  const productId = asString(value.product_id, 100)
  const templateId = asString(value.template_id, 100)
  const canvas = validateCanvas(value.canvas)
  const layers = validateLayers(value.layers)
  const metadata = validateMetadata(value.metadata)

  if (!designId || !productId || !templateId || !canvas || !layers || !metadata) {
    return null
  }

  return {
    schema_version: '1.0',
    design_id: designId,
    product_id: productId,
    template_id: templateId,
    units: 'in',
    canvas,
    layers,
    metadata,
  }
}
