import { NextResponse } from 'next/server'
import { branch, getSupabaseAdmin } from '@/lib/supabase/client'
import { getStripeServerClient } from '@/lib/stripe/server'
import { randomBytes } from 'node:crypto'
import {
  getGuestOrderTrackingSettings,
  getStripeCheckoutSettings,
} from '@/lib/storefront-settings'
import { computeCanonicalLine } from '@/lib/pricing/engine'
import {
  applyPromotions,
  resolveEligibleDeals,
  validatePromoCode,
  type BundleDealRecord,
  type PromoCodeRecord,
  type PromotionLineInput,
} from '@/lib/pricing/promotions'

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
  promoCode?: unknown
  dealCode?: unknown
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
  category_key: string | null
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

function createGuestTrackingToken(): string {
  return randomBytes(24).toString('base64url')
}

function normalizeCode(value: unknown): string | null {
  const raw = asString(value, 40)
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
  return raw.length > 0 ? raw : null
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
      .select('id, title, category_key, is_active, is_archived, base_price, production_estimate_band')
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

async function loadActivePromoByCode(code: string): Promise<PromoCodeRecord | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('exp_promo_codes')
    .select('id, code, discount_type, discount_value, is_active, usage_limit, usage_count, valid_from, valid_to')
    .eq('code', code)
    .maybeSingle()

  if (error) {
    console.error('[checkout:create-session:promo]', error.message)
    return null
  }

  return (data ?? null) as PromoCodeRecord | null
}

async function loadPotentialDeals(code: string | null): Promise<BundleDealRecord[]> {
  const supabase = getSupabaseAdmin()

  let query = supabase
    .from('exp_bundle_deals')
    .select('id, name, trigger_type, code, conditions_json, rewards_json, is_active, is_stackable, usage_limit, usage_count, valid_from, valid_to')
    .eq('is_active', true)

  if (code) {
    query = query.or(`trigger_type.eq.automatic,code.eq.${code}`)
  } else {
    query = query.eq('trigger_type', 'automatic')
  }

  const { data, error } = await query

  if (error) {
    console.error('[checkout:create-session:deals]', error.message)
    return []
  }

  return (data ?? []) as BundleDealRecord[]
}

async function getStripeCheckoutConfig() {
  try {
    const [stripeConfig, trackingConfig] = await Promise.all([
      getStripeCheckoutSettings(),
      getGuestOrderTrackingSettings(),
    ])

    return {
      stripeCheckoutEnabled: stripeConfig.enabled,
      stripeDisabledMessage: stripeConfig.disabled_message,
      guestOrderTrackingEnabled: trackingConfig.enabled,
      guestOrderTrackingNotifyEmail: trackingConfig.notify_email,
    }
  } catch (error) {
    console.error('[checkout:create-session:settings]', error)
    const [stripeConfig, trackingConfig] = await Promise.all([
      getStripeCheckoutSettings(),
      getGuestOrderTrackingSettings(),
    ])
    return {
      stripeCheckoutEnabled: stripeConfig.enabled,
      stripeDisabledMessage: stripeConfig.disabled_message,
      guestOrderTrackingEnabled: trackingConfig.enabled,
      guestOrderTrackingNotifyEmail: trackingConfig.notify_email,
    }
  }
}

async function callInventoryFunction(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  fnName: 'exp_reserve_order_inventory' | 'exp_release_order_inventory',
  args: Record<string, unknown>
) {
  const { data, error } = await supabase.rpc(fnName, args)
  if (error) {
    console.error(`[checkout:create-session:${fnName}]`, error.message)
    return { ok: false, reason: 'rpc_error', payload: null as Record<string, unknown> | null }
  }

  const payload =
    typeof data === 'object' && data !== null
      ? (data as Record<string, unknown>)
      : null

  return {
    ok: payload?.ok === true,
    reason: typeof payload?.reason === 'string' ? payload.reason : 'unknown',
    payload,
  }
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin()
  let createdOrderId: string | null = null
  let inventoryReserved = false

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
    const promoCodeInput = normalizeCode(body.promoCode)
    const dealCodeInput = normalizeCode(body.dealCode)

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
        return computeCanonicalLine(context, item.quantity, item.variantId, item.options)
      })
      .filter((line): line is NonNullable<ReturnType<typeof computeCanonicalLine>> => line !== null)

    const now = new Date()
    const promo = promoCodeInput ? await loadActivePromoByCode(promoCodeInput) : null
    const promoValidation = validatePromoCode(promo, promoCodeInput, now)
    if (!promoValidation.ok) {
      return NextResponse.json(
        { error: promoValidation.reason },
        { status: 400 }
      )
    }

    const potentialDeals = await loadPotentialDeals(dealCodeInput)
    const promotionLines: PromotionLineInput[] = canonicalLines.map((line) => ({
      productId: line.productId,
      categoryKey: contextMap.get(line.productId)?.category_key ?? null,
      quantity: line.quantity,
      lineTotal: line.lineTotal,
      selectedOptions: line.selectedOptions,
    }))

    const eligibleDeals = resolveEligibleDeals(potentialDeals, promotionLines, dealCodeInput, now)
    if (!eligibleDeals.ok) {
      return NextResponse.json(
        { error: eligibleDeals.reason },
        { status: 400 }
      )
    }

    const promotionOutcome = applyPromotions({
      lines: promotionLines,
      shippingCost: 0,
      promo: promoValidation.promo,
      deals: eligibleDeals.deals,
    })

    const finalLineTotals = canonicalLines.map((line, index) =>
      Math.max(0, line.lineTotal - (promotionOutcome.lineDiscounts[index] ?? 0))
    )

    const lineItems = canonicalLines.map((line, index) => {
      const finalLineTotal = finalLineTotals[index]
      const finalUnitAmountCents = Math.max(1, Math.round((finalLineTotal / line.quantity) * 100))

      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: line.name,
            ...(line.description ? { description: line.description } : {}),
          },
          unit_amount: finalUnitAmountCents,
        },
        quantity: line.quantity,
      }
    })

    if (lineItems.length === 0) {
      return NextResponse.json(
        { error: 'No valid purchasable cart items were found for checkout.' },
        { status: 400 }
      )
    }

    const subtotal = canonicalLines.reduce((sum, line) => sum + line.lineSubtotal, 0)
    const baseDiscountAmount = canonicalLines.reduce((sum, line) => sum + line.lineDiscount, 0)
    const promotionDiscountAmount = promotionOutcome.lineDiscounts.reduce((sum, amount) => sum + amount, 0)
    const discountAmount = baseDiscountAmount + promotionDiscountAmount
    const orderTotal = finalLineTotals.reduce((sum, lineTotal) => sum + lineTotal, 0)
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
          lines: canonicalLines.map((line, index) => ({
            productId: line.productId,
            title: line.name,
            variantLabel: line.variantLabel,
            selectedOptions: line.selectedOptions,
            quantity: line.quantity,
            lineSubtotal: line.lineSubtotal,
            lineDiscount: line.lineDiscount + (promotionOutcome.lineDiscounts[index] ?? 0),
            lineTotal: finalLineTotals[index] ?? line.lineTotal,
          })),
          promotions: {
            promoCode: promoValidation.promo?.code ?? null,
            bundleDealCode: dealCodeInput,
            appliedDeals: promotionOutcome.appliedDeals,
            appliedPromo: promotionOutcome.appliedPromo,
            dealDiscount: promotionOutcome.dealDiscount,
            promoDiscount: promotionOutcome.promoDiscount,
            shippingDiscount: promotionOutcome.shippingDiscount,
          },
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

    createdOrderId = orderRow.id

    const orderItemsPayload = canonicalLines.map((line, index) => ({
      order_id: orderRow.id,
      product_id: line.productId,
      product_title: line.name,
      selected_options: line.selectedOptions,
      unit_price: line.quantity > 0 ? (finalLineTotals[index] ?? line.lineTotal) / line.quantity : 0,
      quantity: line.quantity,
      line_subtotal: line.lineSubtotal,
      line_discount: line.lineDiscount + (promotionOutcome.lineDiscounts[index] ?? 0),
      line_total: finalLineTotals[index] ?? line.lineTotal,
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

    const reserveResult = await callInventoryFunction(supabase, 'exp_reserve_order_inventory', {
      p_order_id: orderRow.id,
    })

    if (!reserveResult.ok) {
      const inventoryReason =
        reserveResult.reason === 'insufficient_stock' || reserveResult.reason === 'forced_out_of_stock'
          ? 'Some ready-made items sold out while checkout was initializing. Please refresh your cart quantities and try again.'
          : 'Inventory could not be reserved for this checkout session.'

      const releaseNote =
        reserveResult.reason === 'insufficient_stock'
          ? 'Checkout reservation failed due to insufficient stock.'
          : 'Checkout reservation failed before Stripe session creation.'

      await callInventoryFunction(supabase, 'exp_release_order_inventory', {
        p_order_id: orderRow.id,
        p_note: releaseNote,
      })

      await supabase
        .from('exp_orders')
        .update({ payment_status: 'failed', status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', orderRow.id)

      return NextResponse.json(
        { error: inventoryReason },
        { status: 409 }
      )
    }

    inventoryReserved = true

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
      await callInventoryFunction(supabase, 'exp_release_order_inventory', {
        p_order_id: orderRow.id,
        p_note: 'Checkout session URL missing; inventory released.',
      })

      await supabase
        .from('exp_orders')
        .update({ payment_status: 'failed', status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', orderRow.id)

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

    if (createdOrderId && inventoryReserved) {
      await callInventoryFunction(supabase, 'exp_release_order_inventory', {
        p_order_id: createdOrderId,
        p_note: 'Unexpected checkout error after inventory reservation.',
      })

      await supabase
        .from('exp_orders')
        .update({ payment_status: 'failed', status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', createdOrderId)
    }

    return NextResponse.json(
      {
        error:
          'Checkout could not be started right now. Please try again or request a custom order.',
      },
      { status: 500 }
    )
  }
}
