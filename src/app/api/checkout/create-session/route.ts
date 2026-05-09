import { NextResponse } from 'next/server'
import { branch, getSupabaseAdmin } from '@/lib/supabase/client'
import { getStripeServerClient } from '@/lib/stripe/server'
import { randomBytes } from 'node:crypto'

const DEFAULT_STRIPE_ENABLED = true
const DEFAULT_DISABLED_MESSAGE =
  'Checkout is temporarily unavailable. Please submit a custom request.'
const DEFAULT_GUEST_TRACKING_ENABLED = true
const DEFAULT_GUEST_TRACKING_NOTIFY_EMAIL = 'orders@rubysrelics.com'

interface CheckoutItemOption {
  key?: unknown
  label?: unknown
  valueLabel?: unknown
  value?: unknown
}

interface CheckoutItemBody {
  productId?: unknown
  quantity?: unknown
  variantId?: unknown
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

function asNullableString(value: unknown, maxLen: number): string | null {
  const normalized = asString(value, maxLen)
  return normalized.length > 0 ? normalized : null
}

interface SelectedOption {
  key: string
  value: string
}

interface NormalizedCheckoutItem {
  productId: string
  quantity: number
  variantId: string | null
  options: SelectedOption[]
}

interface ProductContext {
  id: string
  title: string
  is_active: boolean
  is_archived: boolean
  base_price: number
  production_estimate_band: string | null
  variants: Array<{
    id: string
    label: string
    price_delta: number
    is_enabled: boolean
  }>
  options: Array<{
    option_key: string
    label: string
    option_type: string
    is_required: boolean
    values: Array<{
      label: string
      value: string
      price_delta: number
      is_enabled: boolean
    }>
  }>
  bulk_discounts: Array<{
    min_qty: number
    max_qty: number | null
    discount_type: 'percent' | 'fixed_amount' | 'unit_price'
    discount_value: number
    label: string | null
    sort_order: number
    is_enabled: boolean
  }>
}

interface CanonicalLine {
  productId: string
  name: string
  variantLabel: string | null
  selectedOptions: Record<string, string>
  lineSubtotal: number
  lineDiscount: number
  lineTotal: number
  quantity: number
  unitAmountCents: number
  description?: string
}

function createGuestTrackingToken(): string {
  return randomBytes(24).toString('base64url')
}

function findMatchingBulkTier(
  tiers: ProductContext['bulk_discounts'],
  quantity: number
) {
  const sorted = [...tiers]
    .filter((t) => t.is_enabled)
    .sort((a, b) => a.sort_order - b.sort_order)

  return (
    sorted.find((tier) => {
      const max = tier.max_qty ?? Number.POSITIVE_INFINITY
      return quantity >= tier.min_qty && quantity <= max
    }) ?? null
  )
}

function normalizeCheckoutItems(rawItems: CheckoutItemBody[]): NormalizedCheckoutItem[] {
  return rawItems
    .map((item) => {
      const productId = asString(item.productId, 64)
      const quantity = asQuantity(item.quantity)
      const variantId = asNullableString(item.variantId, 64)
      const options = Array.isArray(item.options)
        ? (item.options as CheckoutItemOption[])
            .map((opt) => ({
              key: asString(opt.key, 80),
              value: asString(opt.value, 160),
            }))
            .filter((opt) => opt.key.length > 0 && opt.value.length > 0)
        : []

      if (!productId) return null
      return { productId, quantity, variantId, options }
    })
    .filter((item): item is NormalizedCheckoutItem => item !== null)
}

async function loadProductContext(productId: string): Promise<ProductContext | null> {
  const supabase = getSupabaseAdmin()

  const [productResult, variantResult, optionResult, bulkResult] = await Promise.all([
    supabase
      .from('exp_products')
      .select('id, title, is_active, is_archived, base_price, production_estimate_band')
      .eq('id', productId)
      .single(),

    supabase
      .from('exp_product_variants')
      .select('id, label, price_delta, is_enabled')
      .eq('product_id', productId),

    supabase
      .from('exp_product_options')
      .select(`
        option_key, label, option_type, is_required,
        values:exp_product_option_values (label, value, price_delta, is_enabled)
      `)
      .eq('product_id', productId),

    supabase
      .from('exp_product_bulk_discounts')
      .select('min_qty, max_qty, discount_type, discount_value, label, sort_order, is_enabled')
      .eq('product_id', productId)
      .eq('is_enabled', true),
  ])

  if (productResult.error || !productResult.data) {
    console.error('[checkout:create-session:product]', productResult.error?.message)
    return null
  }

  if (variantResult.error) {
    console.error('[checkout:create-session:variants]', variantResult.error.message)
  }
  if (optionResult.error) {
    console.error('[checkout:create-session:options]', optionResult.error.message)
  }
  if (bulkResult.error) {
    console.error('[checkout:create-session:bulk]', bulkResult.error.message)
  }

  return {
    ...productResult.data,
    variants: variantResult.data ?? [],
    options: (optionResult.data ?? []).map((opt) => ({
      ...opt,
      values: (opt.values ?? []).filter((v) => v.is_enabled),
    })),
    bulk_discounts: bulkResult.data ?? [],
  }
}

function buildCanonicalLine(
  item: NormalizedCheckoutItem,
  product: ProductContext
): CanonicalLine | null {
  if (!product.is_active || product.is_archived) {
    return null
  }

  let unitPrice = Number(product.base_price)

  const variant = item.variantId
    ? product.variants.find((v) => v.id === item.variantId && v.is_enabled)
    : null

  if (item.variantId && !variant) {
    return null
  }

  if (variant) {
    unitPrice += Number(variant.price_delta)
  }

  const optionMap = new Map(product.options.map((opt) => [opt.option_key, opt]))
  const selectedMap = new Map(item.options.map((opt) => [opt.key, opt.value]))

  for (const opt of product.options) {
    if (!opt.is_required) continue
    const selected = selectedMap.get(opt.option_key)
    if (!selected || selected.trim().length === 0) {
      return null
    }
  }

  const descriptionParts: string[] = []
  if (variant?.label) descriptionParts.push(variant.label)
  const selectedOptions: Record<string, string> = {}

  for (const selected of item.options) {
    const def = optionMap.get(selected.key)
    if (!def) continue

    const valueMeta = def.values.find((v) => v.value === selected.value)
    if (valueMeta) {
      unitPrice += Number(valueMeta.price_delta)
      descriptionParts.push(`${def.label}: ${valueMeta.label}`)
      selectedOptions[def.option_key] = valueMeta.value
    } else {
      descriptionParts.push(`${def.label}: ${selected.value}`)
      selectedOptions[def.option_key] = selected.value
    }
  }

  const subtotal = unitPrice * item.quantity
  const bulkTier = findMatchingBulkTier(product.bulk_discounts, item.quantity)

  let discount = 0
  if (bulkTier) {
    if (bulkTier.discount_type === 'percent') {
      discount = subtotal * (Number(bulkTier.discount_value) / 100)
    } else if (bulkTier.discount_type === 'fixed_amount') {
      discount = Number(bulkTier.discount_value) * item.quantity
    } else if (bulkTier.discount_type === 'unit_price') {
      discount = Math.max(0, (unitPrice - Number(bulkTier.discount_value)) * item.quantity)
    }
  }

  const total = Math.max(0, subtotal - discount)
  const unitAmountCents = toCents(total / item.quantity)

  const description =
    descriptionParts.length > 0
      ? descriptionParts.join(' | ').slice(0, 240)
      : undefined

  return {
    productId: product.id,
    name: product.title,
    variantLabel: variant?.label ?? null,
    selectedOptions,
    lineSubtotal: subtotal,
    lineDiscount: discount,
    lineTotal: total,
    quantity: item.quantity,
    unitAmountCents,
    description,
  }
}

async function getStripeCheckoutConfig() {
  try {
    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('exp_storefront_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['stripe_checkout_enabled', 'guest_order_tracking'])

    if (error) {
      console.error('[checkout:create-session:settings]', error.message)
    }

    const byKey = new Map(
      (data ?? []).map((row) => [row.setting_key, row.setting_value as Record<string, unknown>])
    )

    const stripeConfig = byKey.get('stripe_checkout_enabled')
    const trackingConfig = byKey.get('guest_order_tracking')

    const stripeCheckoutEnabled =
      typeof stripeConfig?.enabled === 'boolean'
        ? stripeConfig.enabled
        : DEFAULT_STRIPE_ENABLED

    const stripeDisabledMessage =
      typeof stripeConfig?.disabled_message === 'string'
        ? stripeConfig.disabled_message
        : DEFAULT_DISABLED_MESSAGE

    const guestOrderTrackingEnabled =
      typeof trackingConfig?.enabled === 'boolean'
        ? trackingConfig.enabled
        : DEFAULT_GUEST_TRACKING_ENABLED

    const guestOrderTrackingNotifyEmail =
      typeof trackingConfig?.notify_email === 'string' && trackingConfig.notify_email.trim().length > 3
        ? trackingConfig.notify_email.trim()
        : process.env.ORDER_TRACKING_NOTIFY_EMAIL ?? DEFAULT_GUEST_TRACKING_NOTIFY_EMAIL

    return {
      stripeCheckoutEnabled,
      stripeDisabledMessage,
      guestOrderTrackingEnabled,
      guestOrderTrackingNotifyEmail,
    }
  } catch (error) {
    console.error('[checkout:create-session:settings]', error)
    return {
      stripeCheckoutEnabled: DEFAULT_STRIPE_ENABLED,
      stripeDisabledMessage: DEFAULT_DISABLED_MESSAGE,
      guestOrderTrackingEnabled: DEFAULT_GUEST_TRACKING_ENABLED,
      guestOrderTrackingNotifyEmail:
        process.env.ORDER_TRACKING_NOTIFY_EMAIL ?? DEFAULT_GUEST_TRACKING_NOTIFY_EMAIL,
    }
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdmin()
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

    const normalizedItems = normalizeCheckoutItems(rawItems)

    if (normalizedItems.length === 0) {
      return NextResponse.json(
        { error: 'Cart payload is invalid.' },
        { status: 400 }
      )
    }

    const productIds = Array.from(new Set(normalizedItems.map((item) => item.productId)))
    const contextMap = new Map<string, ProductContext>()

    await Promise.all(
      productIds.map(async (id) => {
        const context = await loadProductContext(id)
        if (context) contextMap.set(id, context)
      })
    )

    const canonicalLines = normalizedItems
      .map((item) => {
        const context = contextMap.get(item.productId)
        if (!context) return null
        return buildCanonicalLine(item, context)
      })
      .filter((line): line is CanonicalLine => line !== null)

    const lineItems = canonicalLines.map((line) => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: line.name,
          ...(line.description ? { description: line.description } : {}),
        },
        unit_amount: line.unitAmountCents,
      },
      quantity: line.quantity,
    }))

    if (lineItems.length === 0) {
      return NextResponse.json(
        { error: 'No valid purchasable cart items were found for checkout.' },
        { status: 400 }
      )
    }

    const subtotal = canonicalLines.reduce((sum, line) => sum + line.lineSubtotal, 0)
    const discountAmount = canonicalLines.reduce((sum, line) => sum + line.lineDiscount, 0)
    const orderTotal = canonicalLines.reduce((sum, line) => sum + line.lineTotal, 0)
    const guestTrackingToken = config.guestOrderTrackingEnabled ? createGuestTrackingToken() : null
    const guestTrackingExpiresAt = config.guestOrderTrackingEnabled
      ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 45).toISOString()
      : null

    const firstContext = contextMap.get(canonicalLines[0].productId)

    const { data: orderRow, error: orderError } = await supabase
      .from('exp_orders')
      .insert({
        order_path: 'shop',
        payment_mode: 'stripe_checkout',
        payment_status: 'pending',
        status: 'awaiting_payment',
        production_estimate_band: firstContext?.production_estimate_band ?? 'To be confirmed',
        subtotal,
        discount_amount: discountAmount,
        order_total: orderTotal,
        shipping_cost: 0,
        shipping_method: 'standard',
        shipping_address: {},
        guest_tracking_token: guestTrackingToken,
        guest_tracking_expires_at: guestTrackingExpiresAt,
        cart_snapshot: {
          lines: canonicalLines.map((line) => ({
            productId: line.productId,
            title: line.name,
            variantLabel: line.variantLabel,
            selectedOptions: line.selectedOptions,
            quantity: line.quantity,
            lineSubtotal: line.lineSubtotal,
            lineDiscount: line.lineDiscount,
            lineTotal: line.lineTotal,
          })),
        },
        branch,
      })
      .select('id')
      .single()

    if (orderError || !orderRow) {
      console.error('[checkout:create-session:order-insert]', orderError?.message)
      return NextResponse.json(
        { error: 'Could not initialize order record for checkout.' },
        { status: 500 }
      )
    }

    const orderItemsPayload = canonicalLines.map((line) => ({
      order_id: orderRow.id,
      product_id: line.productId,
      product_title: line.name,
      selected_options: line.selectedOptions,
      unit_price: line.quantity > 0 ? line.lineTotal / line.quantity : 0,
      quantity: line.quantity,
      line_subtotal: line.lineSubtotal,
      line_discount: line.lineDiscount,
      line_total: line.lineTotal,
      variant_label: line.variantLabel,
    }))

    const { error: itemInsertError } = await supabase
      .from('exp_order_items')
      .insert(orderItemsPayload)

    if (itemInsertError) {
      console.error('[checkout:create-session:order-items-insert]', itemInsertError.message)
      return NextResponse.json(
        { error: 'Could not initialize order items for checkout.' },
        { status: 500 }
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
        order_id: orderRow.id,
      },
    })

    if (!session.url) {
      return NextResponse.json(
        { error: 'Could not initialize Stripe checkout.' },
        { status: 500 }
      )
    }

    const { error: updateOrderError } = await supabase
      .from('exp_orders')
      .update({ stripe_session_id: session.id, updated_at: new Date().toISOString() })
      .eq('id', orderRow.id)

    if (updateOrderError) {
      console.error('[checkout:create-session:order-update]', updateOrderError.message)
    }

    return NextResponse.json(
      {
        checkoutUrl: session.url,
        sessionId: session.id,
        orderId: orderRow.id,
        orderTrackingToken: guestTrackingToken,
        guestOrderTrackingEnabled: config.guestOrderTrackingEnabled,
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
