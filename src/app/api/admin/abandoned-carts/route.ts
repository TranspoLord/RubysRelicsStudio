import { NextResponse } from 'next/server'
import { requireAdminApiSession } from '@/lib/admin/auth'
import { processPreCheckoutAbandonments } from '@/lib/abandoned-cart'
import { getSupabaseAdmin } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// GET  /api/admin/abandoned-carts   — list captures + expired sessions
// POST /api/admin/abandoned-carts   — trigger recovery batch manually
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const authResult = await requireAdminApiSession(request)
  if (authResult instanceof NextResponse) return authResult

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') ?? 'all'      // 'captures' | 'sessions' | 'all'
  const limitParam = searchParams.get('limit') ?? '50'
  const limit = Math.min(200, Math.max(1, Number.parseInt(limitParam, 10) || 50))

  const supabase = getSupabaseAdmin()

  const results: {
    captures?: unknown[]
    abandonedSessions?: unknown[]
  } = {}

  if (type === 'captures' || type === 'all') {
    const { data, error } = await supabase
      .from('exp_cart_captures')
      .select('id, email, cart_json, recovery_sent_at, order_id, created_at')
      .is('order_id', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[admin:abandoned-carts:captures]', error.message)
    } else {
      results.captures = data ?? []
    }
  }

  if (type === 'sessions' || type === 'all') {
    // Orders whose Stripe session expired and we have a customer email but payment never came
    const { data, error } = await supabase
      .from('exp_orders')
      .select('id, customer_email, order_total, cart_snapshot, cart_recovery_email_sent_at, updated_at, created_at')
      .eq('status', 'cancelled')
      .eq('payment_status', 'failed')
      .not('customer_email', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[admin:abandoned-carts:sessions]', error.message)
    } else {
      results.abandonedSessions = data ?? []
    }
  }

  return NextResponse.json(results, { status: 200 })
}

export async function POST(request: Request) {
  const authResult = await requireAdminApiSession(request)
  if (authResult instanceof NextResponse) return authResult

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    body = {}
  }

  const action = typeof body.action === 'string' ? body.action : 'run_pre_checkout_batch'
  const thresholdMinutes =
    typeof body.thresholdMinutes === 'number' && body.thresholdMinutes > 0
      ? body.thresholdMinutes
      : 60

  if (action === 'run_pre_checkout_batch') {
    const dispatched = await processPreCheckoutAbandonments(thresholdMinutes, 50)
    return NextResponse.json({ dispatched }, { status: 200 })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
