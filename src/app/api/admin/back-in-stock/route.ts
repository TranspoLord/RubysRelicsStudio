import { NextResponse } from 'next/server'

import { requireAdminApiSession } from '@/lib/admin/auth'
import { processBackInStockAlerts } from '@/lib/back-in-stock'

interface ProcessBody {
  productIds?: unknown
  limit?: unknown
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-back-in-stock-process',
      maxRequests: 30,
      windowMs: 15 * 60 * 1000,
    })

    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as ProcessBody

    const productIds = Array.isArray(body.productIds)
      ? body.productIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : undefined

    const limit = typeof body.limit === 'number' && Number.isInteger(body.limit) ? body.limit : undefined

    const result = await processBackInStockAlerts({ productIds, limit })

    return NextResponse.json({ ok: true, result }, { status: 200 })
  } catch (error) {
    console.error('[admin:back-in-stock:process]', error)
    return NextResponse.json({ error: 'Could not process back-in-stock alerts.' }, { status: 500 })
  }
}
