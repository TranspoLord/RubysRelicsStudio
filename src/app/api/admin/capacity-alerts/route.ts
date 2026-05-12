import { NextResponse } from 'next/server'

import { requireAdminApiSession } from '@/lib/admin/auth'
import { processCapacityReopenedAlerts } from '@/lib/capacity-alerts'

interface ProcessBody {
  categoryKeys?: unknown
  limit?: unknown
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-capacity-alert-process',
      maxRequests: 30,
      windowMs: 15 * 60 * 1000,
    })

    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as ProcessBody

    const categoryKeys = Array.isArray(body.categoryKeys)
      ? body.categoryKeys.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : undefined

    const limit = typeof body.limit === 'number' && Number.isInteger(body.limit) ? body.limit : undefined

    const result = await processCapacityReopenedAlerts({ categoryKeys, limit })

    return NextResponse.json({ ok: true, result }, { status: 200 })
  } catch (error) {
    console.error('[admin:capacity-alerts:process]', error)
    return NextResponse.json({ error: 'Could not process capacity-reopened alerts.' }, { status: 500 })
  }
}
