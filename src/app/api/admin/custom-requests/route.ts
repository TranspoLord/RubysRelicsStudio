import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { requireAdminApiSession } from '@/lib/admin/auth'

function asString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdminApiSession(request)
    if (!auth.ok) {
      return auth.response
    }

    const supabase = getSupabaseAdmin()
    const url = new URL(request.url)
    const status = asString(url.searchParams.get('status'), 40)
    const q = asString(url.searchParams.get('q'), 120).toLowerCase()

    let query = supabase
      .from('exp_custom_requests')
      .select('id, status, customer_name, customer_email, item_type, quantity, description, files, design_id, design_document, quote_amount, square_payment_link_url, quote_sent_at, quote_expires_at, quote_last_resent_at, quote_resend_count, production_handoff_at, recovery_reminder_sent_at, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(60)

    if (status.length > 0 && status !== 'all') {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      console.error('[admin:custom-requests:get]', error.message)
      return NextResponse.json({ error: 'Could not load custom requests.' }, { status: 500 })
    }

    const rows = (data ?? []).filter((row) => {
      if (!q) return true
      return (
        String(row.id).toLowerCase().includes(q) ||
        String(row.customer_email).toLowerCase().includes(q) ||
        String(row.customer_name ?? '').toLowerCase().includes(q) ||
        String(row.item_type).toLowerCase().includes(q)
      )
    })

    const designIds = rows
      .map((row) => (typeof row.design_id === 'string' ? row.design_id : null))
      .filter((value): value is string => Boolean(value))

    const exportSummaryByDesignId: Record<
      string,
      {
        pending: number
        succeeded: number
        failed: number
        latestPerFormat: Record<string, string>
      }
    > = {}

    if (designIds.length > 0) {
      const { data: exportRows } = await supabase
        .from('exp_product_design_exports')
        .select('design_id, format, status, created_at')
        .in('design_id', designIds)
        .order('created_at', { ascending: false })
        .limit(500)

      for (const row of exportRows ?? []) {
        const designId = typeof row.design_id === 'string' ? row.design_id : null
        const format = typeof row.format === 'string' ? row.format.toLowerCase() : null
        const statusValue = typeof row.status === 'string' ? row.status.toLowerCase() : null
        if (!designId || !format || !statusValue) continue

        if (!exportSummaryByDesignId[designId]) {
          exportSummaryByDesignId[designId] = {
            pending: 0,
            succeeded: 0,
            failed: 0,
            latestPerFormat: {},
          }
        }

        const summary = exportSummaryByDesignId[designId]
        if (statusValue === 'pending') summary.pending += 1
        if (statusValue === 'succeeded') summary.succeeded += 1
        if (statusValue === 'failed') summary.failed += 1

        if (!summary.latestPerFormat[format]) {
          summary.latestPerFormat[format] = statusValue
        }
      }
    }

    return NextResponse.json(
      {
        requests: rows,
        exportSummaryByDesignId,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[admin:custom-requests:get]', error)
    return NextResponse.json({ error: 'Could not load custom requests.' }, { status: 500 })
  }
}
