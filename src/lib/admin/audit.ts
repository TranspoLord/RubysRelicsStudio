import { branch, getSupabaseAdmin } from '@/lib/supabase/client'

interface AdminAuditInput {
  action: string
  entityType: string
  entityId?: string | null
  route: string
  request: Request
  status: 'success' | 'failure'
  details?: Record<string, unknown>
}

export async function writeAdminAuditLog(input: AdminAuditInput) {
  try {
    const supabase = getSupabaseAdmin()
    const { error } = await supabase.from('exp_admin_audit_log').insert({
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      route: input.route,
      request_ip: requestIp(input.request),
      user_agent: input.request.headers.get('user-agent')?.slice(0, 500) ?? null,
      status: input.status,
      details: input.details ?? {},
      branch,
    })

    if (error) {
      console.error('[admin:audit]', error.message)
    }
  } catch (error) {
    console.error('[admin:audit]', error)
  }
}

function requestIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() ?? null
  }

  return request.headers.get('x-real-ip')?.trim() ?? null
}