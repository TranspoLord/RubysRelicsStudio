import { NextResponse } from 'next/server'
import { createHash, randomUUID } from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { requireCsrfOriginOnly } from '@/lib/security/csrf'
import { safeLogError } from '@/lib/security/logger'
import { parseDesignDocument } from '@/lib/design/schema'
import { verifyDesignAssetOwnership } from '@/lib/design/persistence'
import { renderDesignArtifact } from '@/lib/design/export-renderer'

const SUPPORTED_FORMATS = new Set(['png', 'pdf'])
const MAX_LAYERS = 40
const MAX_TOTAL_SOURCE_BYTES = 60 * 1024 * 1024
const MAX_OUTPUT_DIMENSION_PX = 10000
const MAX_RENDER_MS = 15_000
const EXPORT_BUCKET_NAME = 'design-artifacts'

const EXPORT_ERROR_CODES = {
  INVALID_SCHEMA: 'INVALID_SCHEMA',
  ASSET_UNAUTHORIZED: 'ASSET_UNAUTHORIZED',
  LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',
  RENDER_TIMEOUT: 'RENDER_TIMEOUT',
  INTERNAL_RENDER_ERROR: 'INTERNAL_RENDER_ERROR',
} as const

type ExportErrorCode = (typeof EXPORT_ERROR_CODES)[keyof typeof EXPORT_ERROR_CODES]

type ExportFormat = 'png' | 'pdf'

interface ExportRequestBody {
  designId?: unknown
  formats?: unknown
  dpi?: unknown
  idempotencyKey?: unknown
}

class DesignExportError extends Error {
  constructor(
    readonly code: ExportErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'DesignExportError'
  }
}

function asString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

function parseFormats(value: unknown): ExportFormat[] {
  if (!Array.isArray(value) || value.length === 0) return ['png', 'pdf']

  const normalized = value
    .map((entry) => asString(entry, 10).toLowerCase())
    .filter((entry): entry is ExportFormat => SUPPORTED_FORMATS.has(entry))

  if (normalized.length === 0) return []
  return Array.from(new Set(normalized))
}

function parseDpi(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 300
  const dpi = Math.floor(parsed)
  if (dpi < 72 || dpi > 1200) return 300
  return dpi
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new DesignExportError(EXPORT_ERROR_CODES.RENDER_TIMEOUT, 'Render exceeded timeout budget.'))
    }, timeoutMs)

    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

async function renderAndStoreArtifact(input: {
  supabase: any
  document: ReturnType<typeof parseDesignDocument>
  format: ExportFormat
  designId: string
  documentHash: string
  dpi: number
}): Promise<{ artifactPath: string; artifactSha256: string }> {
  if (!input.document) {
    throw new DesignExportError(
      EXPORT_ERROR_CODES.INVALID_SCHEMA,
      'Cannot export an invalid document.'
    )
  }

  const rendered = await renderDesignArtifact(input.document, input.format, input.dpi, {
    loadAsset: async (assetPath) => {
      const { data, error } = await input.supabase.storage
        .from('customer-artwork')
        .download(assetPath)

      if (error || !data) {
        throw new DesignExportError(
          EXPORT_ERROR_CODES.ASSET_UNAUTHORIZED,
          `Could not load source asset ${assetPath}.`
        )
      }

      const bytes = new Uint8Array(await data.arrayBuffer())
      return {
        bytes,
        contentType: data.type,
      }
    },
  })
  const contentType = input.format === 'png' ? 'image/png' : 'application/pdf'
  const artifactPath = `${input.designId}/${input.documentHash}-${input.dpi}.${input.format}`

  const { error: uploadError } = await input.supabase.storage
    .from(EXPORT_BUCKET_NAME)
    .upload(artifactPath, rendered.bytes, {
      contentType,
      upsert: true,
      cacheControl: '31536000',
    })

  if (uploadError) {
    throw new DesignExportError(
      EXPORT_ERROR_CODES.INTERNAL_RENDER_ERROR,
      'Could not store export artifact.'
    )
  }

  return {
    artifactPath,
    artifactSha256: rendered.sha256,
  }
}

function parseErrorCode(error: unknown): ExportErrorCode {
  if (error instanceof DesignExportError) return error.code
  return EXPORT_ERROR_CODES.INTERNAL_RENDER_ERROR
}

function parseErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Unexpected export failure.'
}

export async function POST(request: Request) {
  const csrfResponse = requireCsrfOriginOnly(request)
  if (csrfResponse) return csrfResponse

  const auth = await requireAdminApiSession(request, {
    key: 'design-export-write',
    maxRequests: 30,
    windowMs: 15 * 60 * 1000,
  })
  if (!auth.ok) return auth.response

  const ip = getClientIp(request)
  const rl = await rateLimit(`design-export:${ip}`, 20, 60 * 60 * 1000, { failClosed: true })
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter!)

  try {
    const body = (await request.json()) as ExportRequestBody
    const designId = asString(body.designId, 80)
    const idempotencyKey = asString(body.idempotencyKey, 120) || randomUUID()
    const formats = parseFormats(body.formats)
    const dpi = parseDpi(body.dpi)

    if (!designId) {
      await writeAdminAuditLog({
        action: 'design_export.generate',
        entityType: 'product_design',
        entityId: null,
        route: '/api/designs/export',
        request,
        status: 'failure',
        details: { reason: 'missing_design_id' },
      })
      return NextResponse.json(
        { error: 'designId is required.', code: EXPORT_ERROR_CODES.INVALID_SCHEMA },
        { status: 400 }
      )
    }

    if (formats.length === 0) {
      await writeAdminAuditLog({
        action: 'design_export.generate',
        entityType: 'product_design',
        entityId: designId,
        route: '/api/designs/export',
        request,
        status: 'failure',
        details: { reason: 'missing_formats' },
      })
      return NextResponse.json(
        { error: 'At least one format is required (png or pdf).', code: EXPORT_ERROR_CODES.INVALID_SCHEMA },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()

    const { data: designRow, error: designError } = await supabase
      .from('exp_product_designs')
      .select('id, design_document, document_hash')
      .eq('id', designId)
      .maybeSingle()

    if (designError) {
      safeLogError('[design-export:load]', designError)
      await writeAdminAuditLog({
        action: 'design_export.generate',
        entityType: 'product_design',
        entityId: designId,
        route: '/api/designs/export',
        request,
        status: 'failure',
        details: { reason: 'load_failed' },
      })
      return NextResponse.json(
        { error: 'Could not load design document.', code: EXPORT_ERROR_CODES.INTERNAL_RENDER_ERROR },
        { status: 500 }
      )
    }

    if (!designRow) {
      await writeAdminAuditLog({
        action: 'design_export.generate',
        entityType: 'product_design',
        entityId: designId,
        route: '/api/designs/export',
        request,
        status: 'failure',
        details: { reason: 'design_not_found' },
      })
      return NextResponse.json(
        { error: 'Design not found.', code: EXPORT_ERROR_CODES.INVALID_SCHEMA },
        { status: 404 }
      )
    }

    const document = parseDesignDocument(designRow.design_document)
    if (!document) {
      await writeAdminAuditLog({
        action: 'design_export.generate',
        entityType: 'product_design',
        entityId: String(designRow.id),
        route: '/api/designs/export',
        request,
        status: 'failure',
        details: { reason: 'invalid_stored_document' },
      })
      return NextResponse.json(
        { error: 'Stored design document is invalid.', code: EXPORT_ERROR_CODES.INVALID_SCHEMA },
        { status: 422 }
      )
    }

    if (document.layers.length > MAX_LAYERS) {
      await writeAdminAuditLog({
        action: 'design_export.generate',
        entityType: 'product_design',
        entityId: String(designRow.id),
        route: '/api/designs/export',
        request,
        status: 'failure',
        details: { reason: 'layer_limit_exceeded', layerCount: document.layers.length },
      })
      return NextResponse.json(
        { error: 'Layer count exceeds supported limit.', code: EXPORT_ERROR_CODES.LIMIT_EXCEEDED },
        { status: 422 }
      )
    }

    const widthPx = Math.round(document.canvas.width_in * dpi)
    const heightPx = Math.round(document.canvas.height_in * dpi)
    if (widthPx > MAX_OUTPUT_DIMENSION_PX || heightPx > MAX_OUTPUT_DIMENSION_PX) {
      await writeAdminAuditLog({
        action: 'design_export.generate',
        entityType: 'product_design',
        entityId: String(designRow.id),
        route: '/api/designs/export',
        request,
        status: 'failure',
        details: { reason: 'output_dimension_limit', widthPx, heightPx, dpi },
      })
      return NextResponse.json(
        {
          error: `Output dimensions exceed ${MAX_OUTPUT_DIMENSION_PX}px limit at requested DPI.`,
          code: EXPORT_ERROR_CODES.LIMIT_EXCEEDED,
        },
        { status: 422 }
      )
    }

    const ownership = await verifyDesignAssetOwnership(supabase, document)
    if (!ownership.ok) {
      await writeAdminAuditLog({
        action: 'design_export.generate',
        entityType: 'product_design',
        entityId: String(designRow.id),
        route: '/api/designs/export',
        request,
        status: 'failure',
        details: { reason: 'asset_verification_failed', code: ownership.code ?? null },
      })
      return NextResponse.json(
        {
          error: ownership.message ?? 'Asset verification failed.',
          code: ownership.code ?? EXPORT_ERROR_CODES.ASSET_UNAUTHORIZED,
        },
        { status: ownership.code === EXPORT_ERROR_CODES.LIMIT_EXCEEDED ? 422 : 403 }
      )
    }

    if (ownership.totalSourceBytes > MAX_TOTAL_SOURCE_BYTES) {
      await writeAdminAuditLog({
        action: 'design_export.generate',
        entityType: 'product_design',
        entityId: String(designRow.id),
        route: '/api/designs/export',
        request,
        status: 'failure',
        details: {
          reason: 'aggregate_source_limit_exceeded',
          totalSourceBytes: ownership.totalSourceBytes,
        },
      })
      return NextResponse.json(
        { error: 'Source assets exceed aggregate size limit.', code: EXPORT_ERROR_CODES.LIMIT_EXCEEDED },
        { status: 422 }
      )
    }

    const results: Array<{
      format: ExportFormat
      status: 'succeeded' | 'failed'
      artifactPath: string | null
      artifactSha256: string | null
      errorCode: ExportErrorCode | null
      errorMessage: string | null
      exportId: string | null
      reused: boolean
    }> = []

    for (const format of formats) {
      const { data: existing } = await supabase
        .from('exp_product_design_exports')
        .select('id, artifact_path, artifact_sha256')
        .eq('design_id', designRow.id)
        .eq('document_hash', designRow.document_hash)
        .eq('format', format)
        .eq('status', 'succeeded')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existing) {
        results.push({
          format,
          status: 'succeeded',
          artifactPath: existing.artifact_path,
          artifactSha256: existing.artifact_sha256,
          errorCode: null,
          errorMessage: null,
          exportId: existing.id,
          reused: true,
        })
        continue
      }

      const { data: pendingRow, error: pendingError } = await supabase
        .from('exp_product_design_exports')
        .insert({
          design_id: designRow.id,
          document_hash: designRow.document_hash,
          format,
          dpi,
          status: 'pending',
          idempotency_key: idempotencyKey,
        })
        .select('id')
        .single()

      if (pendingError || !pendingRow?.id) {
        results.push({
          format,
          status: 'failed',
          artifactPath: null,
          artifactSha256: null,
          errorCode: EXPORT_ERROR_CODES.INTERNAL_RENDER_ERROR,
          errorMessage: 'Could not create export record.',
          exportId: null,
          reused: false,
        })
        continue
      }

      const started = Date.now()
      try {
        const rendered = await withTimeout(
          renderAndStoreArtifact({
            supabase,
            document,
            format,
            designId: designRow.id,
            documentHash: designRow.document_hash,
            dpi,
          }),
          MAX_RENDER_MS
        )

        const renderMs = Date.now() - started
        await supabase
          .from('exp_product_design_exports')
          .update({
            artifact_path: rendered.artifactPath,
            artifact_sha256: rendered.artifactSha256,
            render_ms: renderMs,
            status: 'succeeded',
            error_code: null,
            error_message: null,
          })
          .eq('id', pendingRow.id)

        results.push({
          format,
          status: 'succeeded',
          artifactPath: rendered.artifactPath,
          artifactSha256: rendered.artifactSha256,
          errorCode: null,
          errorMessage: null,
          exportId: pendingRow.id,
          reused: false,
        })
      } catch (error) {
        const errorCode = parseErrorCode(error)
        const errorMessage = parseErrorMessage(error)
        const renderMs = Date.now() - started

        await supabase
          .from('exp_product_design_exports')
          .update({
            render_ms: renderMs,
            status: 'failed',
            error_code: errorCode,
            error_message: errorMessage,
          })
          .eq('id', pendingRow.id)

        results.push({
          format,
          status: 'failed',
          artifactPath: null,
          artifactSha256: null,
          errorCode,
          errorMessage,
          exportId: pendingRow.id,
          reused: false,
        })
      }
    }

    const succeededCount = results.filter((item) => item.status === 'succeeded').length
    const failedCount = results.length - succeededCount

    await writeAdminAuditLog({
      action: 'design_export.generate',
      entityType: 'product_design',
      entityId: String(designRow.id),
      route: '/api/designs/export',
      request,
      status: failedCount > 0 ? 'failure' : 'success',
      details: {
        dpi,
        requestedFormats: formats,
        succeededCount,
        failedCount,
      },
    })

    return NextResponse.json(
      {
        designId: designRow.id,
        idempotencyKey,
        dpi,
        exports: results,
      },
      { status: failedCount > 0 && succeededCount === 0 ? 422 : 200 }
    )
  } catch (error) {
    safeLogError('[design-export]', error)
    await writeAdminAuditLog({
      action: 'design_export.generate',
      entityType: 'product_design',
      entityId: null,
      route: '/api/designs/export',
      request,
      status: 'failure',
      details: { reason: 'unexpected_error' },
    })
    return NextResponse.json(
      {
        error: 'Could not process export request.',
        code: EXPORT_ERROR_CODES.INTERNAL_RENDER_ERROR,
      },
      { status: 500 }
    )
  }
}
