import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { getStripeServerClient } from '@/lib/stripe/server'

const DEFAULT_STRIPE_ENABLED = true
const DEFAULT_DISABLED_MESSAGE =
  'Checkout is temporarily unavailable. Please submit a custom request.'

interface CheckoutItemOption {
  label?: unknown
  valueLabel?: unknown
  value?: unknown
}

interface CheckoutItemBody {
  title?: unknown
  quantity?: unknown
  lineTotal?: unknown
  variantLabel?: unknown
  options?: unknown
}

interface CreateCheckoutSessionBody {
  items?: unknown
}

function asString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

function asQuantity(value: unknown): number {
  const n = Number.parseInt(String(value), 10)
  if (!Number.isFinite(n)) return 1
  return Math.max(1, Math.min(999, n))
}

function asMoney(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, n)
}

function toCents(value: number): number {
  return Math.max(1, Math.round(value * 100))
}

function getItemDescription(item: CheckoutItemBody): string | undefined {
  const variantLabel = asString(item.variantLabel, 80)
  const options = Array.isArray(item.options) ? (item.options as CheckoutItemOption[]) : []

  const optionText = options
    .slice(0, 4)
    .map((option) => {
      const label = asString(option.label, 32)
      const rawValue = asString(option.valueLabel, 48) || asString(option.value, 48)
      if (!label || !rawValue) return ''
      return `${label}: ${rawValue}`
    })
    .filter(Boolean)
    .join(' | ')

  const parts = [variantLabel, optionText].filter(Boolean)
  if (parts.length === 0) return undefined
  return parts.join(' | ').slice(0, 240)
}

async function getStripeCheckoutConfig() {
  try {
    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('exp_storefront_settings')
      .select('setting_value')
      .eq('setting_key', 'stripe_checkout_enabled')
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('[checkout:create-session:settings]', error.message)
    }

    const stripeCheckoutEnabled =
      typeof data?.setting_value?.enabled === 'boolean'
        ? data.setting_value.enabled
        : DEFAULT_STRIPE_ENABLED

    const stripeDisabledMessage =
      typeof data?.setting_value?.disabled_message === 'string'
        ? data.setting_value.disabled_message
        : DEFAULT_DISABLED_MESSAGE

    return {
      stripeCheckoutEnabled,
      stripeDisabledMessage,
    }
  } catch (error) {
    console.error('[checkout:create-session:settings]', error)
    return {
      stripeCheckoutEnabled: DEFAULT_STRIPE_ENABLED,
      stripeDisabledMessage: DEFAULT_DISABLED_MESSAGE,
    }
  }
}

export async function POST(request: Request) {
  try {
    const config = await getStripeCheckoutConfig()

    if (!config.stripeCheckoutEnabled) {
      return NextResponse.json(
        {
          error: config.stripeDisabledMessage,
          stripeCheckoutEnabled: false,
        },
        { status: 409 }
      )
    }

    const body = (await request.json()) as CreateCheckoutSessionBody
    const rawItems = Array.isArray(body.items) ? (body.items as CheckoutItemBody[]) : []

    if (rawItems.length === 0) {
      return NextResponse.json(
        { error: 'Your cart is empty. Add items before checkout.' },
        { status: 400 }
      )
    }

    if (rawItems.length > 50) {
      return NextResponse.json(
        { error: 'Cart has too many items to process in one checkout session.' },
        { status: 400 }
      )
    }

    const lineItems = rawItems
      .map((item) => {
        const name = asString(item.title, 120)
        const quantity = asQuantity(item.quantity)
        const lineTotal = asMoney(item.lineTotal)

        if (!name || lineTotal <= 0) return null

        const unitAmount = toCents(lineTotal / quantity)
        const description = getItemDescription(item)

        return {
          price_data: {
            currency: 'usd',
            product_data: {
              name,
              ...(description ? { description } : {}),
            },
            unit_amount: unitAmount,
          },
          quantity,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    if (lineItems.length === 0) {
      return NextResponse.json(
        { error: 'No valid cart items were found for checkout.' },
        { status: 400 }
      )
    }

    const stripe = getStripeServerClient()
    const origin = new URL(request.url).origin

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/cancel`,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      metadata: {
        source: 'expansion_storefront',
      },
    })

    if (!session.url) {
      return NextResponse.json(
        { error: 'Could not initialize Stripe checkout.' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        checkoutUrl: session.url,
        sessionId: session.id,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[checkout:create-session]', error)

    return NextResponse.json(
      {
        error:
          'Checkout could not be started right now. Please try again or request a custom order.',
      },
      { status: 500 }
    )
  }
}
