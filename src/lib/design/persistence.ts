import { createHash } from 'node:crypto'
import type { DesignDocumentV1 } from '@/lib/design/schema'

const MAX_ASSET_BYTES = 15 * 1024 * 1024

export interface VerifiedDesignAsset {
  assetPath: string
  uploadToken: string
  expiresAt: string | null
  fileSizeBytes: number | null
}

export interface DesignAssetVerificationResult {
  ok: boolean
  code?: 'ASSET_UNAUTHORIZED' | 'LIMIT_EXCEEDED'
  message?: string
  totalSourceBytes: number
  assets: VerifiedDesignAsset[]
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
  return `{${entries.join(',')}}`
}

export function hashDesignDocument(document: DesignDocumentV1): string {
  const canonical = stableStringify(document)
  return createHash('sha256').update(canonical).digest('hex')
}

function getImageAssetBindings(document: DesignDocumentV1): Array<{ assetPath: string; uploadToken: string }> {
  const dedupe = new Set<string>()
  const bindings: Array<{ assetPath: string; uploadToken: string }> = []

  for (const layer of document.layers) {
    if (layer.kind !== 'image') continue
    const key = `${layer.asset_path}::${layer.upload_token}`
    if (dedupe.has(key)) continue
    dedupe.add(key)
    bindings.push({ assetPath: layer.asset_path, uploadToken: layer.upload_token })
  }

  return bindings
}

export async function verifyDesignAssetOwnership(
  supabase: any,
  document: DesignDocumentV1
): Promise<DesignAssetVerificationResult> {
  const bindings = getImageAssetBindings(document)
  if (bindings.length === 0) {
    return { ok: true, totalSourceBytes: 0, assets: [] }
  }

  const nowIso = new Date().toISOString()
  const verifiedAssets: VerifiedDesignAsset[] = []
  let totalBytes = 0

  for (const binding of bindings) {
    const { data, error } = await supabase
      .from('exp_artwork_uploads')
      .select('file_path, upload_token, expires_at, file_size_bytes')
      .eq('file_path', binding.assetPath)
      .eq('upload_token', binding.uploadToken)
      .gt('expires_at', nowIso)
      .maybeSingle()

    if (error || !data) {
      return {
        ok: false,
        code: 'ASSET_UNAUTHORIZED',
        message: `Asset ownership verification failed for ${binding.assetPath}.`,
        totalSourceBytes: 0,
        assets: [],
      }
    }

    const fileSizeBytes =
      typeof data.file_size_bytes === 'number' && Number.isFinite(data.file_size_bytes)
        ? Math.max(0, Math.floor(data.file_size_bytes))
        : null

    if (fileSizeBytes !== null) {
      if (fileSizeBytes > MAX_ASSET_BYTES) {
        return {
          ok: false,
          code: 'LIMIT_EXCEEDED',
          message: `Asset exceeds ${Math.floor(MAX_ASSET_BYTES / (1024 * 1024))}MB limit.`,
          totalSourceBytes: 0,
          assets: [],
        }
      }
      totalBytes += fileSizeBytes
    }

    verifiedAssets.push({
      assetPath: data.file_path,
      uploadToken: data.upload_token,
      expiresAt: typeof data.expires_at === 'string' ? data.expires_at : null,
      fileSizeBytes,
    })
  }

  return {
    ok: true,
    totalSourceBytes: totalBytes,
    assets: verifiedAssets,
  }
}

export async function persistDesignDocument(input: {
  supabase: any
  document: DesignDocumentV1
  source: 'shop' | 'custom_order'
  verifiedAssets?: VerifiedDesignAsset[]
}): Promise<{ designId: string; documentHash: string } | null> {
  const { supabase, document, source } = input
  const documentHash = hashDesignDocument(document)

  const { data: existing, error: existingError } = await supabase
    .from('exp_product_designs')
    .select('id')
    .eq('document_hash', documentHash)
    .eq('product_id', document.product_id)
    .eq('template_id', document.template_id)
    .eq('source', source)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingError) return null

  if (existing?.id) {
    return { designId: existing.id, documentHash }
  }

  const { data: inserted, error: insertError } = await supabase
    .from('exp_product_designs')
    .insert({
      product_id: document.product_id,
      template_id: document.template_id,
      design_document: document,
      document_hash: documentHash,
      source,
    })
    .select('id')
    .single()

  if (insertError || !inserted?.id) return null

  const assets = input.verifiedAssets ?? []
  if (assets.length > 0) {
    const rows = assets.map((asset) => ({
      design_id: inserted.id,
      asset_path: asset.assetPath,
      upload_token_hash: createHash('sha256').update(asset.uploadToken).digest('hex'),
      expires_at: asset.expiresAt,
    }))

    await supabase
      .from('exp_product_design_assets')
      .upsert(rows, { onConflict: 'design_id,asset_path' })
  }

  return { designId: inserted.id, documentHash }
}
