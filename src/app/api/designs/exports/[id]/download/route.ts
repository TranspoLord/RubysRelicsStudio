import { NextResponse } from 'next/server'
import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit'

const EXPORT_BUCKET_NAME = 'design-artifacts'
const SIGNED_URL_EXPIRY_SECONDS = 600

interface RequestContext {
  params: Promise<{ id: string }>
}

function asString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

async function hasCustomerAccess(input: {
  supabase: any
  designId: string
  requestId: string
  accessToken: string
}): Promise<boolean> {
  const { data, error } = await input.supabase
    .from('exp_custom_requests')
    .select('id, customer_access_expires_at')
    .eq('id', input.requestId)
    .eq('customer_access_token', input.accessToken)
    .eq('design_id', input.designId)
    .maybeSingle()

  if (error || !data) return false

  if (data.customer_access_expires_at) {
    const expiresAt = new Date(data.customer_access_expires_at)
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
      return false
    }
  }

  return true
}

export async function GET(request: Request, context: RequestContext) {
  const ip = getClientIp(request)
  const rl = await rateLimit(`design-export-download:${ip}`, 60, 60 * 60 * 1000, { failClosed: true })
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter ?? 60)

  const params = await context.params
  const exportId = asString(params.id, 80)
  if (!exportId) {
    await writeAdminAuditLog({
      action: 'design_export.download',
      entityType: 'design_export',
      entityId: null,
      route: '/api/designs/exports/[id]/download',
      request,
      status: 'failure',
      details: { reason: 'missing_export_id' },
    })
    return NextResponse.json({ error: 'Missing export id.' }, { status: 400 })
  }

  const url = new URL(request.url)
  const requestId = asString(url.searchParams.get('requestId'), 80)
  const accessToken = asString(url.searchParams.get('access'), 220)

  const supabase = getSupabaseAdmin()

  const { data: exportRow, error: exportError } = await supabase
    .from('exp_product_design_exports')
    .select('id, design_id, format, artifact_path, status')
    .eq('id', exportId)
    .maybeSingle()

  if (exportError || !exportRow) {
    await writeAdminAuditLog({
      action: 'design_export.download',
      entityType: 'design_export',
      entityId: exportId,
      route: '/api/designs/exports/[id]/download',
      request,
      status: 'failure',
      details: { reason: 'export_not_found' },
    })
    return NextResponse.json({ error: 'Export artifact not found.' }, { status: 404 })
  }

  if (exportRow.status !== 'succeeded' || !exportRow.artifact_path) {
    await writeAdminAuditLog({
      action: 'design_export.download',
      entityType: 'design_export',
      entityId: String(exportRow.id),
      route: '/api/designs/exports/[id]/download',
      request,
      status: 'failure',
      details: { reason: 'artifact_not_ready', status: String(exportRow.status) },
    })
    return NextResponse.json({ error: 'Export artifact is not ready.' }, { status: 409 })
  }

  let authorized = false
  let accessPath: 'customer_token' | 'admin_session' | 'none' = 'none'

  if (requestId && accessToken) {
    authorized = await hasCustomerAccess({
      supabase,
      designId: String(exportRow.design_id),
      requestId,
      accessToken,
    })

    if (authorized) {
      accessPath = 'customer_token'
    }
  }

  if (!authorized) {
    const auth = await requireAdminApiSession(request, {
      key: 'design-export-read',
      maxRequests: 120,
      windowMs: 15 * 60 * 1000,
    })

    if (!auth.ok) {
      await writeAdminAuditLog({
        action: 'design_export.download',
        entityType: 'design_export',
        entityId: String(exportRow.id),
        route: '/api/designs/exports/[id]/download',
        request,
        status: 'failure',
        details: { reason: 'authorization_failed', hadCustomerParams: Boolean(requestId && accessToken) },
      })
      return NextResponse.json({ error: 'Not authorized to access this export.' }, { status: 403 })
    }

    authorized = true
    accessPath = 'admin_session'
  }

  if (!authorized) {
    await writeAdminAuditLog({
      action: 'design_export.download',
      entityType: 'design_export',
      entityId: String(exportRow.id),
      route: '/api/designs/exports/[id]/download',
      request,
      status: 'failure',
      details: { reason: 'authorization_failed_fallback' },
    })
    return NextResponse.json({ error: 'Not authorized to access this export.' }, { status: 403 })
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from(EXPORT_BUCKET_NAME)
    .createSignedUrl(exportRow.artifact_path, SIGNED_URL_EXPIRY_SECONDS)

  if (signedError || !signed?.signedUrl) {
    await writeAdminAuditLog({
      action: 'design_export.download',
      entityType: 'design_export',
      entityId: String(exportRow.id),
      route: '/api/designs/exports/[id]/download',
      request,
      status: 'failure',
      details: { reason: 'signed_url_failed', accessPath },
    })
    return NextResponse.json({ error: 'Could not create download URL.' }, { status: 500 })
  }

  await writeAdminAuditLog({
    action: 'design_export.download',
    entityType: 'design_export',
    entityId: String(exportRow.id),
    route: '/api/designs/exports/[id]/download',
    request,
    status: 'success',
    details: {
      accessPath,
      format: String(exportRow.format),
      expiresInSeconds: SIGNED_URL_EXPIRY_SECONDS,
    },
  })

  return NextResponse.json(
    {
      exportId: exportRow.id,
      format: exportRow.format,
      expiresInSeconds: SIGNED_URL_EXPIRY_SECONDS,
      url: signed.signedUrl,
    },
    { status: 200 }
  )
}
