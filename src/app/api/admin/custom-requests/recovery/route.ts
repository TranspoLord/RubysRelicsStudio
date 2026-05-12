import { NextResponse } from 'next/server'

import { requireAdminApiSession } from '@/lib/admin/auth'
import { processAbandonedCustomRequests } from '@/lib/custom-request-recovery'

interface RecoveryBody {
  thresholdHours?: unknown
  limit?: unknown
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-custom-request-recovery',
      maxRequests: 20,
      windowMs: 15 * 60 * 1000,
    })

    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as RecoveryBody
    const thresholdHours =
      typeof body.thresholdHours === 'number' && Number.isFinite(body.thresholdHours)
        ? body.thresholdHours
        : 24
    const limit =
      typeof body.limit === 'number' && Number.isInteger(body.limit)
        ? body.limit
        : 100

    const result = await processAbandonedCustomRequests({ thresholdHours, limit })
    return NextResponse.json({ ok: true, result }, { status: 200 })
  } catch (error) {
    console.error('[admin:custom-requests:recovery]', error)
    return NextResponse.json({ error: 'Could not process abandoned custom request reminders.' }, { status: 500 })
  }
}
