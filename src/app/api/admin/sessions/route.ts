import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApiSession } from '@/lib/admin/auth'
import {
  listAdminSessions,
  revokeAdminSession,
  revokeOtherAdminSessions,
  extractJtiFromToken,
} from '@/lib/admin/session'
import { writeAdminAuditLog } from '@/lib/admin/audit'

/**
 * SEC-011: Admin session management API.
 * GET  — list all active admin sessions
 * POST — revoke all other sessions (keep current)
 */

export async function GET(request: NextRequest) {
  const auth = await requireAdminApiSession(request)
  if (!auth.ok) return auth.response

  const sessions = await listAdminSessions()
  return NextResponse.json({ sessions }, { status: 200 })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApiSession(request)
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  const action = typeof body.action === 'string' ? body.action : ''

  if (action === 'revoke_others') {
    // Revoke all sessions except the current one
    const currentJti = extractJtiFromToken(auth.context.sessionToken)
    if (!currentJti) {
      return NextResponse.json({ error: 'Could not identify current session.' }, { status: 400 })
    }

    const success = await revokeOtherAdminSessions(currentJti)
    if (!success) {
      return NextResponse.json({ error: 'Failed to revoke sessions.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'admin.session.revoke_others',
      entityType: 'admin_session',
      route: '/api/admin/sessions',
      request,
      status: 'success',
      details: { currentJti },
    })

    return NextResponse.json({ ok: true, message: 'Other sessions revoked.' }, { status: 200 })
  }

  if (action === 'revoke_one' && typeof body.jti === 'string') {
    // Revoke a specific session by JTI
    const success = await revokeAdminSession(body.jti)
    if (!success) {
      return NextResponse.json({ error: 'Failed to revoke session.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'admin.session.revoke',
      entityType: 'admin_session',
      route: '/api/admin/sessions',
      request,
      status: 'success',
      details: { jti: body.jti },
    })

    return NextResponse.json({ ok: true, message: 'Session revoked.' }, { status: 200 })
  }

  return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 })
}