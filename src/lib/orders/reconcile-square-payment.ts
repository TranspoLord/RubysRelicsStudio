import { getSupabaseAdmin } from '@/lib/supabase/client'
import { safeLogError } from '@/lib/security/logger'
import { retrieveSquareOrder } from '@/lib/square/client'

/**
 * OCT #13: the webhook is the authority for "this order was paid", but a
 * misconfigured or temporarily failing webhook would leave a paying customer
 * staring at "Awaiting payment" forever. The success page calls this while the
 * order is still pending, so the page can heal itself.
 *
 * Safety: the amount is taken from the Square order's own `total_money` (with the
 * tax Square applied), and `exp_mark_order_paid` refuses any mismatch — so a tip
 * or a stale read can never mark the wrong amount paid.
 */
export type ReconcileOutcome = 'marked_paid' | 'unchanged' | 'skipped'

export async function reconcileSquarePayment(orderId: string): Promise<ReconcileOutcome> {
  if (!orderId) return 'skipped'

  const supabase = getSupabaseAdmin()

  const { data: order, error: orderError } = await supabase
    .from('exp_orders')
    .select('id, square_order_id, payment_status, created_at')
    .eq('id', orderId)
    .maybeSingle()

  if (orderError || !order) {
    if (orderError) safeLogError('[orders:reconcile:lookup]', orderError)
    return 'skipped'
  }

  if (order.payment_status !== 'pending' || !order.square_order_id) return 'skipped'

  // Give the webhook a head start: it usually lands within a couple of seconds,
  // and this keeps a pending order from hammering Square on every poll.
  const createdAt = new Date(String(order.created_at)).getTime()
  if (Number.isFinite(createdAt) && Date.now() - createdAt < 30_000) return 'skipped'

  let squareOrder: Awaited<ReturnType<typeof retrieveSquareOrder>>
  try {
    squareOrder = await retrieveSquareOrder(String(order.square_order_id))
  } catch (squareError) {
    safeLogError('[orders:reconcile:square]', squareError)
    return 'unchanged'
  }

  const tender = squareOrder?.tenders?.find((entry) => entry.payment_id)
  if (!squareOrder || !tender?.payment_id) return 'unchanged'

  const amountCents = Math.round(squareOrder.total_money?.amount ?? 0)
  const taxCents = Math.round(squareOrder.total_tax_money?.amount ?? 0)
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 'unchanged'

  const { data, error } = await supabase.rpc('exp_mark_order_paid', {
    p_order_id: order.id,
    p_square_payment_id: tender.payment_id,
    p_amount_cents: amountCents,
    p_paid_at: new Date().toISOString(),
    p_source: 'success_page_reconcile',
    p_tax_cents: taxCents,
  })

  if (error) {
    safeLogError('[orders:reconcile:rpc]', error)
    return 'unchanged'
  }

  const outcome = data as { ok?: boolean; reason?: string } | null
  return outcome?.reason === 'marked_paid' ? 'marked_paid' : 'unchanged'
}
