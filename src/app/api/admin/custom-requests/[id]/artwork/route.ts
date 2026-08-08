import { NextResponse } from 'next/server'

import { writeAdminAuditLog } from '@/lib/admin/audit'
import { requireAdminApiSession } from '@/lib/admin/auth'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit'

const BUCKET_NAME = 'customer-artwork'
const SIGNED_URL_EXPIRY_SECONDS = 900 // 15 minutes

interface RequestContext {
  params: Promise<{ id: string }>
}

interface StoredFile {
  name?: unknown
  path?: unknown
  type?: unknown
  size?: unknown
}

/**
 * GET /api/admin/custom-requests/[id]/artwork
 *
 * Returns time-limited signed URLs (1 hour) for all artwork files attached
 * to a custom request. Only files that were fully uploaded (have a `path`
 * field in the JSONB) produce a URL. Legacy records with metadata-only
 * entries are silently skipped.
 */
export async function GET(request: Request, { params }: RequestContext) {
  const auth = await requireAdminApiSession(request)
  if (!auth.ok) return auth.response

  const ip = getClientIp(request)
  const rl = await rateLimit(`admin-artwork-retrieve:${ip}`, 50, 60 * 60 * 1000, { failClosed: true })
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter ?? 60)

  const { id } = await params

  if (!id || typeof id !== 'string') {
    await writeAdminAuditLog({
      action: 'custom_request.artwork_retrieve',
      entityType: 'custom_request',
      entityId: null,
      route: '/api/admin/custom-requests/[id]/artwork',
      request,
      status: 'failure',
      details: { reason: 'missing_request_id' },
    })
    return NextResponse.json({ error: 'Missing request ID.' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('exp_custom_requests')
    .select('id, files')
    .eq('id', id)
    .maybeSingle()

  if (error || !data) {
    await writeAdminAuditLog({
      action: 'custom_request.artwork_retrieve',
      entityType: 'custom_request',
      entityId: id,
      route: '/api/admin/custom-requests/[id]/artwork',
      request,
      status: 'failure',
      details: { reason: 'request_not_found' },
    })
    return NextResponse.json({ error: 'Custom request not found.' }, { status: 404 })
  }

  const rawFiles = Array.isArray(data.files) ? (data.files as StoredFile[]) : []
  const filesWithPaths = rawFiles.filter(
    (f): f is StoredFile & { path: string } =>
      typeof f?.path === 'string' && f.path.length > 0
  )

  if (filesWithPaths.length === 0) {
    return NextResponse.json({ urls: [] }, { status: 200 })
  }

  const urls = await Promise.all(
    filesWithPaths.map(async (f) => {
      const { data: signed, error: signedError } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(f.path, SIGNED_URL_EXPIRY_SECONDS)

      return {
        name: typeof f.name === 'string' ? f.name : f.path.split('/').pop() ?? 'file',
        url: signedError || !signed ? null : signed.signedUrl,
      }
    })
  )

  const filteredUrls = urls.filter((u): u is { name: string; url: string } => u.url !== null)

  await writeAdminAuditLog({
    action: 'custom_request.artwork_retrieve',
    entityType: 'custom_request',
    entityId: id,
    route: '/api/admin/custom-requests/[id]/artwork',
    request,
    status: 'success',
    details: { urls_returned: filteredUrls.length },
  })

  return NextResponse.json(
    { urls: filteredUrls },
    { status: 200 }
  )
}
