import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { PNG } from 'pngjs'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import type { DesignDocumentV1 } from '@/lib/design/schema'

export type ExportFormat = 'png' | 'pdf'

interface RenderResult {
  bytes: Uint8Array
  sha256: string
  widthPx: number
  heightPx: number
}

interface AssetData {
  bytes: Uint8Array
  contentType?: string | null
}

interface RenderOptions {
  loadAsset?: (assetPath: string) => Promise<AssetData>
}

const BACKGROUND_COLOR = { r: 250, g: 250, b: 250 }
const TEXT_COLOR = { r: 30, g: 30, b: 30 }

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function colorFromHex(hex: string): { r: number; g: number; b: number } {
  const parsed = hex.replace('#', '')
  const r = Number.parseInt(parsed.slice(0, 2), 16)
  const g = Number.parseInt(parsed.slice(2, 4), 16)
  const b = Number.parseInt(parsed.slice(4, 6), 16)
  return { r, g, b }
}

function toPixelBounds(document: DesignDocumentV1, dpi: number) {
  const widthPx = Math.round(document.canvas.width_in * dpi)
  const heightPx = Math.round(document.canvas.height_in * dpi)
  return { widthPx, heightPx }
}

function setPixel(
  png: PNG,
  x: number,
  y: number,
  color: { r: number; g: number; b: number },
  alpha = 255
) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return
  const idx = (png.width * y + x) << 2
  png.data[idx] = color.r
  png.data[idx + 1] = color.g
  png.data[idx + 2] = color.b
  png.data[idx + 3] = alpha
}

function blendPixel(
  png: PNG,
  x: number,
  y: number,
  color: { r: number; g: number; b: number },
  sourceAlpha: number
) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return

  const idx = (png.width * y + x) << 2
  const dstR = png.data[idx]
  const dstG = png.data[idx + 1]
  const dstB = png.data[idx + 2]
  const dstA = png.data[idx + 3] / 255

  const srcA = clamp(sourceAlpha, 0, 1)
  const outA = srcA + dstA * (1 - srcA)
  if (outA <= 0) {
    png.data[idx] = 0
    png.data[idx + 1] = 0
    png.data[idx + 2] = 0
    png.data[idx + 3] = 0
    return
  }

  const outR = (color.r * srcA + dstR * dstA * (1 - srcA)) / outA
  const outG = (color.g * srcA + dstG * dstA * (1 - srcA)) / outA
  const outB = (color.b * srcA + dstB * dstA * (1 - srcA)) / outA

  png.data[idx] = Math.round(clamp(outR, 0, 255))
  png.data[idx + 1] = Math.round(clamp(outG, 0, 255))
  png.data[idx + 2] = Math.round(clamp(outB, 0, 255))
  png.data[idx + 3] = Math.round(clamp(outA * 255, 0, 255))
}

function drawRect(
  png: PNG,
  x: number,
  y: number,
  width: number,
  height: number,
  color: { r: number; g: number; b: number },
  opacity: number
) {
  const alpha = Math.round(clamp(opacity, 0, 1) * 255)
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.ceil(x + width)
  const y1 = Math.ceil(y + height)

  for (let yy = y0; yy < y1; yy += 1) {
    for (let xx = x0; xx < x1; xx += 1) {
      setPixel(png, xx, yy, color, alpha)
    }
  }
}

function drawPseudoText(
  png: PNG,
  x: number,
  y: number,
  text: string,
  fontSizePt: number,
  color: { r: number; g: number; b: number },
  opacity: number,
  dpi: number
) {
  const fontSizePx = Math.max(1, Math.round((fontSizePt / 72) * dpi))
  const charWidth = Math.max(1, Math.round(fontSizePx * 0.58))
  const charHeight = Math.max(1, Math.round(fontSizePx * 0.9))
  const spacing = Math.max(1, Math.round(charWidth * 0.15))

  let cursorX = x
  const baselineY = y
  for (const ch of text) {
    if (ch === ' ') {
      cursorX += charWidth
      continue
    }

    drawRect(png, cursorX, baselineY - charHeight, charWidth, charHeight, color, opacity)
    cursorX += charWidth + spacing
  }
}

async function drawImageLayer(
  png: PNG,
  input: {
    assetBytes: Uint8Array
    xPx: number
    yPx: number
    widthPx: number
    heightPx: number
    opacity: number
  }
): Promise<void> {
  const targetWidth = Math.max(1, Math.round(input.widthPx))
  const targetHeight = Math.max(1, Math.round(input.heightPx))

  const raw = await sharp(input.assetBytes)
    .ensureAlpha()
    .resize(targetWidth, targetHeight, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })

  const src = raw.data
  const srcInfo = raw.info
  const startX = Math.floor(input.xPx)
  const startY = Math.floor(input.yPx)
  const layerOpacity = clamp(input.opacity, 0, 1)

  for (let sy = 0; sy < srcInfo.height; sy += 1) {
    for (let sx = 0; sx < srcInfo.width; sx += 1) {
      const srcIndex = (sy * srcInfo.width + sx) * srcInfo.channels
      const sr = src[srcIndex] ?? 0
      const sg = src[srcIndex + 1] ?? 0
      const sb = src[srcIndex + 2] ?? 0
      const sa = (src[srcIndex + 3] ?? 255) / 255
      blendPixel(png, startX + sx, startY + sy, { r: sr, g: sg, b: sb }, sa * layerOpacity)
    }
  }
}

async function renderRasterCanvas(
  document: DesignDocumentV1,
  dpi: number,
  options?: RenderOptions
): Promise<{ png: PNG; widthPx: number; heightPx: number }> {
  const { widthPx, heightPx } = toPixelBounds(document, dpi)
  const png = new PNG({ width: widthPx, height: heightPx })

  drawRect(png, 0, 0, widthPx, heightPx, BACKGROUND_COLOR, 1)

  const layers = [...document.layers].sort((a, b) => a.z_index - b.z_index)
  for (const layer of layers) {
    if (layer.kind === 'image') {
      if (!options?.loadAsset) {
        throw new Error(`Missing asset loader for image layer ${layer.id}.`)
      }

      const asset = await options.loadAsset(layer.asset_path)
      await drawImageLayer(png, {
        assetBytes: asset.bytes,
        xPx: layer.x_in * dpi,
        yPx: layer.y_in * dpi,
        widthPx: layer.width_in * dpi,
        heightPx: layer.height_in * dpi,
        opacity: layer.opacity,
      })
      continue
    }

    const textColor = colorFromHex(layer.color_hex)
    drawPseudoText(
      png,
      layer.x_in * dpi,
      layer.y_in * dpi,
      layer.text,
      layer.font_size_pt,
      textColor,
      layer.opacity,
      dpi
    )
  }

  return { png, widthPx, heightPx }
}

export async function renderDesignArtifact(
  document: DesignDocumentV1,
  format: ExportFormat,
  dpi: number,
  options?: RenderOptions
): Promise<RenderResult> {
  const raster = await renderRasterCanvas(document, dpi, options)
  const { widthPx, heightPx } = raster

  if (format === 'png') {
    const bytes = PNG.sync.write(raster.png)
    const out = new Uint8Array(bytes)
    return {
      bytes: out,
      sha256: hashBytes(out),
      widthPx,
      heightPx,
    }
  }

  const pdf = await PDFDocument.create()
  const pageWidth = document.canvas.width_in * 72
  const pageHeight = document.canvas.height_in * 72
  const page = pdf.addPage([pageWidth, pageHeight])
  const font = await pdf.embedFont(StandardFonts.Helvetica)

  const pngBytes = PNG.sync.write(raster.png)
  const embeddedImage = await pdf.embedPng(pngBytes)
  page.drawImage(embeddedImage, {
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
  })

  page.drawText(`Design ${document.design_id} @ ${dpi} DPI`, {
    x: 8,
    y: 8,
    size: 8,
    font,
    color: rgb(TEXT_COLOR.r / 255, TEXT_COLOR.g / 255, TEXT_COLOR.b / 255),
  })

  const bytes = await pdf.save()
  return {
    bytes,
    sha256: hashBytes(bytes),
    widthPx,
    heightPx,
  }
}