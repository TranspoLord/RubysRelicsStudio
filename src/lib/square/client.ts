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
    name: string
    quantity: string
    base_price_money: {
      amount: number  // in cents
      currency: string
    }
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
          name: item.name,
          quantity: item.quantity,
          base_price_money: item.base_price_money,
          item_type: 'ITEM',
        })),
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