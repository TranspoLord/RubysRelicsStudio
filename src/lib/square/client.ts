// Square API client utilities
// Requires SQUARE_ACCESS_TOKEN and SQUARE_ENVIRONMENT env vars

const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN
const SQUARE_ENVIRONMENT = process.env.SQUARE_ENVIRONMENT ?? 'sandbox'
const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID

const SQUARE_API_BASE = SQUARE_ENVIRONMENT === 'production'
  ? 'https://connect.squareup.com'
  : 'https://connect.squareupsandbox.com'

interface SquareError {
  code?: string
  detail?: string
}

interface SquareCheckoutResponse {
  payment_link: {
    id: string
    url: string
    order_id: string
    created_at: string
  }
  errors?: SquareError[]
}

interface CreateSquareCheckoutParams {
  lineItems: Array<{
    /** OCT #35: stable id so `applied_discounts` can reference this line. */
    uid?: string
    name: string
    quantity: string
    /** OCT #35: the UNDISCOUNTED unit price — discounts ride on `order.discounts`. */
    base_price_money: {
      amount: number  // in cents
      currency: string
    }
    applied_discounts?: Array<{ discount_uid: string }>
  }>
  /**
   * OCT #35: tiers, promos and free shipping are expressed as Square discounts
   * rather than by rewriting unit prices. Square documents a LINE_ITEM-scoped
   * FIXED_AMOUNT discount's `amount_money` as "the total declared monetary amount
   * of the discount" — applied once to the line, not per unit — which is exactly
   * the line's discount in cents.
   */
  discounts?: Array<{
    uid: string
    name: string
    type: 'FIXED_AMOUNT'
    scope: 'LINE_ITEM'
    amount_money: { amount: number; currency: string }
  }>
  idempotencyKey: string
  note?: string
  metadata?: Record<string, string>
}

export async function createSquareCheckout(params: CreateSquareCheckoutParams): Promise<SquareCheckoutResponse> {
  if (!SQUARE_ACCESS_TOKEN || !SQUARE_LOCATION_ID) {
    throw new Error('Square credentials not configured.')
  }

  const response = await fetch(`${SQUARE_API_BASE}/v2/online-checkout/payment-links`, {
    method: 'POST',
    headers: {
      'Square-Version': '2025-06-18',
      'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      idempotency_key: params.idempotencyKey,
      description: params.note,
      order: {
        location_id: SQUARE_LOCATION_ID,
        line_items: params.lineItems.map(item => ({
          ...(item.uid ? { uid: item.uid } : {}),
          name: item.name,
          quantity: item.quantity,
          base_price_money: item.base_price_money,
          item_type: 'ITEM',
          ...(item.applied_discounts?.length
            ? { applied_discounts: item.applied_discounts }
            : {}),
        })),
        ...(params.discounts?.length ? { discounts: params.discounts } : {}),
      },
      checkout_options: {
        redirect_url: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/checkout/success`,
      },
      pre_populated_data: {
        buyer_email: params.metadata?.buyer_email,
        buyer_phone_number: params.metadata?.buyer_phone,
      },
    }),
  })

  const data = await response.json() as SquareCheckoutResponse

  if (data.errors?.length) {
    throw new Error(`Square API error: ${data.errors[0].detail ?? data.errors[0].code}`)
  }

  return data
}

/**
 * OCT #4/#35: fetch a Square order so the webhook can see the tax Square applied.
 *
 * Automatic tax is recorded on the **order** (`total_tax_money`), not on the
 * payment, so this is the only place it is visible — and without it the webhook
 * would compare a tax-inclusive charge against a pre-tax total and refuse to
 * mark the order paid.
 */
export async function retrieveSquareOrder(orderId: string): Promise<{
  id: string
  total_tax_money?: { amount: number; currency: string }
  total_money?: { amount: number; currency: string }
} | null> {
  if (!SQUARE_ACCESS_TOKEN) {
    throw new Error('Square credentials not configured.')
  }

  const response = await fetch(`${SQUARE_API_BASE}/v2/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: {
      'Square-Version': '2025-06-18',
      'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
    },
  })

  const data = (await response.json().catch(() => null)) as {
    order?: {
      id: string
      total_tax_money?: { amount: number; currency: string }
      total_money?: { amount: number; currency: string }
    }
    errors?: SquareError[]
  } | null

  if (!response.ok) {
    const detail = data?.errors?.[0]
    throw new Error(
      `Square retrieve-order error: ${detail?.detail ?? detail?.code ?? response.status}`
    )
  }

  return data?.order ?? null
}

/**
 * Deletes a Square payment link (OCT #2).
 *
 * Used to unwind the link when the order row cannot be updated with it, so a
 * customer is never left holding a payable link for an order we failed to
 * record. Throws on any non-2xx so the caller can log a real failure instead of
 * silently leaving a live link behind.
 */
export async function deleteSquarePaymentLink(paymentLinkId: string): Promise<void> {
  if (!SQUARE_ACCESS_TOKEN) {
    throw new Error('Square credentials not configured.')
  }

  const response = await fetch(
    `${SQUARE_API_BASE}/v2/online-checkout/payment-links/${encodeURIComponent(paymentLinkId)}`,
    {
      method: 'DELETE',
      headers: {
        'Square-Version': '2025-06-18',
        'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
      },
    },
  )

  if (response.ok) return

  const data = (await response.json().catch(() => null)) as { errors?: SquareError[] } | null
  const detail = data?.errors?.[0]?.detail ?? data?.errors?.[0]?.code ?? String(response.status)
  throw new Error(`Square delete-link error: ${detail}`)
}