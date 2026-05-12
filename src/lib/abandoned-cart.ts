import { getEmailSenderAddress, getResend } from '@/lib/resend/client'
import { getSupabaseAdmin } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CartItem {
  productId: string
  title: string
  quantity: number
  lineTotal: number
  variantLabel?: string | null
}

interface SendAbandonedCartEmailInput {
  to: string
  cartItems: CartItem[]
  orderId?: string | null
  /** Human-readable total, e.g. "$42.50" */
  orderTotal?: string | null
  /** URL the customer should click to start over or resume */
  resumeUrl?: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildCartItemsHtml(items: CartItem[]): string {
  if (items.length === 0) return '<p><em>Your cart items</em></p>'
  const rows = items
    .map((item) => {
      const variantLine = item.variantLabel
        ? ` <span style="color:#888">(${escapeHtml(item.variantLabel)})</span>`
        : ''
      const totalFormatted = (item.lineTotal / 100).toFixed(2)
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e5e5">${escapeHtml(item.title)}${variantLine}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;text-align:center">×${item.quantity}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;text-align:right">$${totalFormatted}</td>
      </tr>`
    })
    .join('')
  return `<table style="width:100%;border-collapse:collapse;margin:16px 0">${rows}</table>`
}

function buildAbandonedCartEmailHtml(input: SendAbandonedCartEmailInput): string {
  const shopUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://rubysrelicsstudio.com'
  const resumeHref = input.resumeUrl ?? `${shopUrl}/shop`
  const itemsHtml = buildCartItemsHtml(input.cartItems)
  const totalLine =
    input.orderTotal ? `<p style="font-weight:600;margin:4px 0 16px">Order total: ${escapeHtml(input.orderTotal)}</p>` : ''

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9f6f1;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f6f1;padding:32px 16px">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:560px;width:100%">
      <tr>
        <td style="background:#1a1a1a;padding:24px 32px">
          <h1 style="color:#c9a96e;font-size:22px;margin:0;font-family:Georgia,serif">Ruby's Relics Studio</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:32px">
          <h2 style="font-size:20px;color:#1a1a1a;margin:0 0 12px">You left something behind 🐾</h2>
          <p style="color:#555;line-height:1.6;margin:0 0 20px">
            You started checkout but your session ended before payment was completed. Your items are still here — just come back and start fresh.
          </p>
          ${itemsHtml}
          ${totalLine}
          <table cellpadding="0" cellspacing="0" style="margin:24px 0">
            <tr>
              <td style="background:#c9a96e;border-radius:6px">
                <a href="${resumeHref}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px">
                  Return to Shop
                </a>
              </td>
            </tr>
          </table>
          <p style="color:#999;font-size:12px;margin:24px 0 0;line-height:1.5">
            You received this email because you started a checkout at Ruby's Relics Studio.
            If you no longer wish to receive cart recovery emails, you can
            <a href="${shopUrl}/resources/privacy" style="color:#c9a96e">manage your preferences</a>.
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a single abandoned-cart recovery email via Resend.
 * Call this ONLY after confirming the customer has not paid.
 */
export async function sendAbandonedCartEmail(input: SendAbandonedCartEmailInput): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false

  const resend = getResend()
  const fromAddress = await getEmailSenderAddress()

  const { error } = await resend.emails.send({
    from: fromAddress,
    to: [input.to],
    subject: "You left something in your cart — Ruby's Relics Studio",
    html: buildAbandonedCartEmailHtml(input),
  })

  if (error) {
    console.error('[abandoned-cart:email]', error)
    return false
  }

  return true
}

/**
 * Process abandoned cart recovery for a completed-but-expired Stripe
 * checkout session.  Reads cart data from the exp_orders row, sends the
 * recovery email, and stamps `cart_recovery_email_sent_at` to prevent
 * duplicate sends on webhook replays.
 *
 * Returns `true` if an email was dispatched.
 */
export async function processCheckoutAbandonmentRecovery(orderId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()

  const { data: order, error: orderError } = await supabase
    .from('exp_orders')
    .select('id, customer_email, cart_snapshot, order_total, cart_recovery_email_sent_at')
    .eq('id', orderId)
    .maybeSingle()

  if (orderError || !order) {
    console.error('[abandoned-cart:recovery] Order not found', orderId, orderError?.message)
    return false
  }

  // Idempotency guard — do not send twice
  if (order.cart_recovery_email_sent_at) return false

  const email =
    typeof order.customer_email === 'string' && order.customer_email.trim().length > 0
      ? order.customer_email.trim()
      : null

  if (!email) return false

  // Extract cart items from snapshot
  const snapshot = order.cart_snapshot as Record<string, unknown> | null
  const rawItems: unknown[] = Array.isArray(snapshot?.items)
    ? (snapshot!.items as unknown[])
    : []

  const cartItems: CartItem[] = rawItems.flatMap((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
    const row = raw as Record<string, unknown>
    const title = typeof row.product_title === 'string' ? row.product_title : 'Item'
    const quantity = typeof row.quantity === 'number' ? row.quantity : 1
    const lineTotal = typeof row.line_total === 'number' ? row.line_total : 0
    const variantLabel = typeof row.variant_label === 'string' ? row.variant_label : null
    return [{ productId: String(row.product_id ?? ''), title, quantity, lineTotal, variantLabel }]
  })

  const orderTotalFormatted =
    typeof order.order_total === 'number' && order.order_total > 0
      ? `$${(order.order_total / 100).toFixed(2)}`
      : null

  const sent = await sendAbandonedCartEmail({
    to: email,
    cartItems,
    orderId,
    orderTotal: orderTotalFormatted,
    resumeUrl: null,
  })

  if (sent) {
    await supabase
      .from('exp_orders')
      .update({
        cart_recovery_email_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
  }

  return sent
}

/**
 * Find pre-checkout cart captures that are:
 * - older than `thresholdMinutes` (default: 60)
 * - have no linked order (never proceeded to checkout)
 * - have not yet had a recovery email sent
 *
 * Sends recovery emails and stamps `recovery_sent_at`.
 * Returns the number of emails dispatched.
 */
export async function processPreCheckoutAbandonments(
  thresholdMinutes = 60,
  batchLimit = 50
): Promise<number> {
  const supabase = getSupabaseAdmin()
  const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000).toISOString()

  const { data: captures, error } = await supabase
    .from('exp_cart_captures')
    .select('id, email, cart_json')
    .is('order_id', null)
    .is('recovery_sent_at', null)
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(batchLimit)

  if (error) {
    console.error('[abandoned-cart:pre-checkout]', error.message)
    return 0
  }

  let dispatched = 0

  for (const capture of captures ?? []) {
    const rawItems: unknown[] = Array.isArray(capture.cart_json) ? capture.cart_json : []
    const cartItems: CartItem[] = rawItems.flatMap((raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
      const row = raw as Record<string, unknown>
      return [{
        productId: String(row.productId ?? ''),
        title: typeof row.title === 'string' ? row.title : 'Item',
        quantity: typeof row.quantity === 'number' ? row.quantity : 1,
        lineTotal: typeof row.lineTotal === 'number' ? row.lineTotal : 0,
        variantLabel: typeof row.variantLabel === 'string' ? row.variantLabel : null,
      }]
    })

    if (cartItems.length === 0) continue

    const sent = await sendAbandonedCartEmail({
      to: capture.email,
      cartItems,
      orderId: null,
      orderTotal: null,
      resumeUrl: null,
    })

    if (sent) {
      await supabase
        .from('exp_cart_captures')
        .update({ recovery_sent_at: new Date().toISOString() })
        .eq('id', capture.id)
      dispatched++
    }
  }

  return dispatched
}
