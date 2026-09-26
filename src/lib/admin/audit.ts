import { readAuthClaims } from '@/lib/auth/claims'
import { branch, getSupabaseAdmin } from '@/lib/supabase/client'
import { createServerSupabaseClient } from '@/lib/supabase/server'

interface AdminAuditInput {
  action: string
  entityType: string
  entityId?: string | null
  route: string
  request: Request
  status: 'success' | 'failure'
  details?: Record<string, unknown>
}

/**
 * Writes an admin audit entry, attributed to the acting admin (§10.7).
 *
 * Before the Google-OAuth switch every admin shared one key, so this log could
 * say *what* happened but never *who* did it. The actor is derived from the
 * verified session inside this helper rather than passed in by callers: there
 * are ~178 call sites across 37 files, and deriving it means a new route cannot
 * forget to attribute its writes — while an unauthenticated write (a webhook,
 * say) correctly records no actor at all. Best-effort: attribution never fails
 * the audit write, and an audit failure never fails the request that triggered
 * it.
 */
export async function writeAdminAuditLog(input: AdminAuditInput) {
  try {
    const actor = await resolveAuditActor()
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
      actor_user_id: actor?.userId ?? null,
      actor_email: actor?.email ?? null,
    })

    if (error) {
      console.error('[admin:audit]', error.message)
    }
  } catch (error) {
    console.error('[admin:audit]', error)
  }
}

/**
 * Resolves the acting admin from the verified Supabase session.
 * Returns `null` for unauthenticated callers (webhooks, storefront flows).
 */
async function resolveAuditActor(): Promise<{ userId: string; email: string | null } | null> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.auth.getClaims()
    if (error) return null

    const claims = readAuthClaims(data?.claims)
    if (!claims) return null

    return { userId: claims.sub, email: claims.email }
  } catch {
    return null
  }
}

function requestIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() ?? null
  }

  return request.headers.get('x-real-ip')?.trim() ?? null
}