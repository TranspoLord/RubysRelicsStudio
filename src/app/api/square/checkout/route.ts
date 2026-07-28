import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createSquareCheckout } from '@/lib/square/client'
import { ShippingRate, getRateByObjectId } from '@/lib/shippo/client'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import {
  computeCanonicalLine,
  PricingContext,
  PricingSelectedOption,
} from '@/lib/pricing/engine'
import { safeLogError } from '@/lib/security/logger'

/**
 * SEC-001: The client MUST NOT supply prices. The request body contains only
 * product identity + quantity + selected options. The server fetches product
 * data from Supabase and computes prices via computeCanonicalLine().
 */
interface CheckoutItemRequest {
  productId: string
  variantId?: string | null
  selectedOptions?: PricingSelectedOption[]
  quantity: number
  selectedProcessKeys?: string[]
}

interface SquareCheckoutRequest {
  items: CheckoutItemRequest[]
  buyerEmail?: string
  buyerPhone?: string
  shippingAddress?: {
    name?: string
    street1: string
    street2?: string
    city: string
    state: string
    zip: string
    country: string
  }
  shippingRate?: ShippingRate
}

/**
 * Fetch a product with its variants, options, and bulk discounts from
 * Supabase, shaped as a PricingContext for computeCanonicalLine().
 */
async function fetchPricingContext(productId: string): Promise<PricingContext | null> {
  const supabase = getSupabaseAdmin()

  const { data: product, error } = await supabase
    .from('exp_products')
    .select('id, title, base_price, is_active, is_archived')
    .eq('id', productId)
    .maybeSingle()

  if (error || !product) return null

  // Fetch variants
  const { data: variants } = await supabase
    .from('exp_product_variants')
    .select('id, label, price_delta, is_enabled')
    .eq('product_id', productId)

  // Fetch options with values
  const { data: options } = await supabase
    .from('exp_product_options')
    .select('option_key, label, option_type, is_required, values:exp_product_option_values(label, value, price_delta, is_enabled)')
    .eq('product_id', productId)

  // Fetch bulk discounts
  const { data: bulkDiscounts } = await supabase
    .from('exp_product_bulk_discounts')
    .select('min_qty, max_qty, discount_type, discount_value, step_qty, label, sort_order, is_enabled')
    .eq('product_id', productId)

  return {
    id: product.id,
    title: product.title,
    base_price: Number(product.base_price),
    is_active: product.is_active,
    is_archived: product.is_archived,
    variants: (variants ?? []).map((v: any) => ({
      id: v.id,
      label: v.label,
      price_delta: Number(v.price_delta),
      is_enabled: v.is_enabled,
    })),
    options: (options ?? []).map((o: any) => ({
      option_key: o.option_key,
      label: o.label,
      option_type: o.option_type,
      is_required: o.is_required,
      values: (o.values ?? []).map((v: any) => ({
        label: v.label,
        value: v.value,
        price_delta: Number(v.price_delta),
        is_enabled: v.is_enabled,
      })),
    })),
    bulk_discounts: (bulkDiscounts ?? []).map((b: any) => ({
      min_qty: b.min_qty,
      max_qty: b.max_qty,
      discount_type: b.discount_type,
      discount_value: Number(b.discount_value),
      step_qty: b.step_qty ?? null,
      label: b.label,
      sort_order: b.sort_order,
      is_enabled: b.is_enabled,
    })),
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SquareCheckoutRequest

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: 'No items provided for checkout.' }, { status: 400 })
    }

    // Check if Square is configured
    if (!process.env.SQUARE_ACCESS_TOKEN || !process.env.SQUARE_LOCATION_ID) {
      return NextResponse.json({ error: 'Square checkout not configured.' }, { status: 503 })
    }

    const supabase = getSupabaseAdmin()
    let totalAmountCents = 0

    // SEC-001: Compute all prices server-side — never trust client prices
    const lineItems = []
    const orderItemsSnapshot = []

    for (const item of body.items) {
      // Fetch product data from DB
      const pricingContext = await fetchPricingContext(item.productId)
      if (!pricingContext) {
        return NextResponse.json(
          { error: `Product not found: ${item.productId}` },
          { status: 400 }
        )
      }

      // Compute canonical price server-side
      const canonical = computeCanonicalLine(
        pricingContext,
        Math.max(1, Math.min(999, Number(item.quantity) || 1)),
        item.variantId ?? null,
        item.selectedOptions ?? []
      )

      if (!canonical) {
        return NextResponse.json(
          { error: `Could not compute price for: ${pricingContext.title}` },
          { status: 400 }
        )
      }

      totalAmountCents += canonical.unitAmountCents * canonical.quantity

      lineItems.push({
        name: canonical.description
          ? `${canonical.name} (${canonical.description})`
          : canonical.name,
        quantity: String(canonical.quantity),
        base_price_money: {
          amount: canonical.unitAmountCents, // Server-computed, never client-supplied
          currency: 'USD',
        },
      })

      orderItemsSnapshot.push({
        product_id: canonical.productId,
        product_title: canonical.name,
        variant_label: canonical.variantLabel,
        selected_options: canonical.selectedOptions,
        unit_price: canonical.unitAmountCents / 100,
        quantity: canonical.quantity,
        line_subtotal: canonical.lineSubtotal,
        line_discount: canonical.lineDiscount,
        line_total: canonical.lineTotal,
      })
    }

    // SEC-047: Validate shipping rate server-side — re-fetch from Shippo by rateToken
    // Never trust the client-supplied amount. The rateToken (Shippo object_id)
    // is the only client-supplied value we use; the amount comes from Shippo.
    let shippingAmountCents = 0
    let verifiedShippingRate: { amount: number; carrier: string; serviceName: string } | null = null
    if (body.shippingRate?.rateToken) {
      verifiedShippingRate = await getRateByObjectId(body.shippingRate.rateToken)

      if (!verifiedShippingRate) {
        return NextResponse.json(
          { error: 'Shipping rate could not be verified. Please refresh rates and try again.' },
          { status: 400 }
        )
      }

      shippingAmountCents = Math.round(verifiedShippingRate.amount * 100)
      totalAmountCents += shippingAmountCents

      lineItems.push({
        name: `Shipping: ${verifiedShippingRate.serviceName}`,
        quantity: '1',
        base_price_money: {
          amount: shippingAmountCents,
          currency: 'USD',
        },
      })
    }

    // Build shipping address note for reference
    const shippingNote = body.shippingAddress
      ? `Ship to: ${body.shippingAddress.street1}${body.shippingAddress.street2 ? ', ' + body.shippingAddress.street2 : ''}, ${body.shippingAddress.city}, ${body.shippingAddress.state} ${body.shippingAddress.zip}, ${body.shippingAddress.country}`
      : ''

    // SEC-042: Use crypto.randomUUID() for idempotency key
    const idempotencyKey = randomUUID()

    // Create checkout with Square
    const checkoutResponse = await createSquareCheckout({
      lineItems,
      idempotencyKey,
      note: shippingNote || 'Order from Ruby\'s Relics Studio',
      metadata: {
        ...(body.buyerEmail && { buyer_email: body.buyerEmail }),
        ...(body.buyerPhone && { buyer_phone: body.buyerPhone }),
        ...(verifiedShippingRate && {
          shipping_carrier: verifiedShippingRate.carrier,
          shipping_service: verifiedShippingRate.serviceName,
          shipping_amount: String(verifiedShippingRate.amount),
        }),
        ...(body.shippingAddress && {
          shipping_country: body.shippingAddress.country,
          shipping_zip: body.shippingAddress.zip,
        }),
      },
    })

    // SEC-002: Persist the order to the database with server-computed total
    const guestTrackingToken = randomUUID()
    const orderTotalDollars = totalAmountCents / 100

    const { error: orderError } = await supabase
      .from('exp_orders')
      .insert({
        square_order_id: checkoutResponse.payment_link.order_id,
        order_path: 'shop',
        payment_mode: 'stripe_checkout',
        payment_status: 'pending',
        status: 'awaiting_payment',
        order_total: orderTotalDollars,
        subtotal: orderItemsSnapshot.reduce((sum, i) => sum + i.line_subtotal, 0),
        discount_amount: orderItemsSnapshot.reduce((sum, i) => sum + i.line_discount, 0),
        shipping_cost: shippingAmountCents / 100,
        shipping_method: verifiedShippingRate?.serviceName || 'standard',
        shipping_address: body.shippingAddress || {},
        cart_snapshot: { items: orderItemsSnapshot },
        customer_email: body.buyerEmail || null,
        guest_tracking_token: guestTrackingToken,
        branch: process.env.NEXT_PUBLIC_APP_ENV === 'production' ? 'PROD' : 'DEV',
      })

    if (orderError) {
      safeLogError('[square:checkout:order-insert]', orderError)
      // Don't fail the checkout — the Square link is already created.
      // The webhook will still work, but reconciliation may fail.
    }

    return NextResponse.json({
      checkoutUrl: checkoutResponse.payment_link.url,
      checkoutId: checkoutResponse.payment_link.id,
      guestTrackingToken, // SEC-002: Return token so client can track the order
    })
  } catch (error) {
    safeLogError('[square:checkout]', error)
    const message = error instanceof Error ? error.message : 'Could not create checkout.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}