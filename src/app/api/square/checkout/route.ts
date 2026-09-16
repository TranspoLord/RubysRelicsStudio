import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createSquareCheckout } from '@/lib/square/client'
import { ShippingRate, verifyShippingRate } from '@/lib/shippo/client'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import {
  computeCanonicalLine,
  PricingContext,
  PricingSelectedOption,
} from '@/lib/pricing/engine'
import {
  applyPromotions,
  resolveEligibleDeals,
  validatePromoCode,
  PromotionLineInput,
} from '@/lib/pricing/promotions'
import { parseJsonBodyOrError } from '@/lib/security/body'
import { parseDesignDocument } from '@/lib/design/schema'
import type { DesignDocumentV1 } from '@/lib/design/schema'
import {
  persistDesignDocument,
  verifyDesignAssetOwnership,
} from '@/lib/design/persistence'
import { requireCsrfOriginOnly } from '@/lib/security/csrf'
import { safeLogError } from '@/lib/security/logger'

const MAX_DESIGN_SOURCE_BYTES = 60 * 1024 * 1024

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
  designDocument?: DesignDocumentV1 | null
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
  discountCode?: string
}

/**
 * Fetch a product with its variants, options, and bulk discounts from
 * Supabase, shaped as a PricingContext for computeCanonicalLine().
 */
async function fetchPricingContext(productId: string): Promise<PricingContext | null> {
  const supabase = getSupabaseAdmin()

  const { data: product, error } = await supabase
    .from('exp_products')
    .select('id, title, base_price, is_active, is_archived, category_key')
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
    .select('min_qty, max_qty, discount_type, discount_value, step_qty, label, description, sort_order, is_enabled')
    .eq('product_id', productId)

  return {
    id: product.id,
    title: product.title,
    base_price: Number(product.base_price),
    is_active: product.is_active,
    is_archived: product.is_archived,
    categoryKey: product.category_key ?? null,
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
      description: b.description ?? null,
      sort_order: b.sort_order,
      is_enabled: b.is_enabled,
    })),
  }
}

export async function POST(request: Request) {
  try {
    const csrfResponse = requireCsrfOriginOnly(request)
    if (csrfResponse) return csrfResponse

    const parsed = await parseJsonBodyOrError<SquareCheckoutRequest>(request, 20 * 1024 * 1024)
    if (!parsed.ok) return parsed.response

    const body = parsed.body

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
    const promotionLines: PromotionLineInput[] = []

    for (const item of body.items) {
      const parsedDesign = item.designDocument ? parseDesignDocument(item.designDocument) : null
      if (item.designDocument && !parsedDesign) {
        safeLogError('[square:checkout:design-invalid]', { productId: item.productId })
        return NextResponse.json(
          { error: 'One or more design documents are invalid. Please review your cart and try again.' },
          { status: 400 }
        )
      }
      if (parsedDesign && parsedDesign.product_id !== item.productId) {
        safeLogError('[square:checkout:design-mismatch]', { productId: item.productId, designProductId: parsedDesign.product_id })
        return NextResponse.json(
          { error: 'One or more design documents do not match the selected product. Please review your cart and try again.' },
          { status: 400 }
        )
      }

      let designId: string | null = null
      let designSnapshot: DesignDocumentV1 | null = null
      if (parsedDesign) {
        const assetVerification = await verifyDesignAssetOwnership(supabase, parsedDesign)
        if (!assetVerification.ok) {
          safeLogError('[square:checkout:asset-verification]', { productId: item.productId, code: assetVerification.code })
          return NextResponse.json(
            { error: assetVerification.message ?? 'Design asset ownership verification failed.' },
            { status: assetVerification.code === 'LIMIT_EXCEEDED' ? 400 : 403 }
          )
        }

        if (assetVerification.totalSourceBytes > MAX_DESIGN_SOURCE_BYTES) {
          return NextResponse.json(
            { error: 'Design source assets exceed the 60MB aggregate limit.' },
            { status: 400 }
          )
        }

        const persisted = await persistDesignDocument({
          supabase,
          document: parsedDesign,
          source: 'shop',
          verifiedAssets: assetVerification.assets,
        })

        if (!persisted) {
          safeLogError('[square:checkout:persist-design]', { productId: item.productId })
          return NextResponse.json(
            { error: 'Could not finalize your design. Please try again.' },
            { status: 500 }
          )
        }

        designId = persisted.designId
        designSnapshot = parsedDesign
      }

      // Fetch product data from DB
      const pricingContext = await fetchPricingContext(item.productId)
      if (!pricingContext) {
        safeLogError('[square:checkout:product-not-found]', { productId: item.productId })
        return NextResponse.json(
          { error: 'One or more products in your cart could not be found. Please refresh and try again.' },
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
        safeLogError('[square:checkout:price-compute]', { productId: item.productId, title: pricingContext.title })
        return NextResponse.json(
          { error: 'We could not calculate a price for one or more items. Please review your selections.' },
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
        design_id: designId,
        design_snapshot: designSnapshot,
        unit_price: canonical.unitAmountCents / 100,
        quantity: canonical.quantity,
        line_subtotal: canonical.lineSubtotal,
        line_discount: canonical.lineDiscount,
        line_total: canonical.lineTotal,
      })

      promotionLines.push({
        productId: canonical.productId,
        categoryKey: pricingContext.categoryKey ?? null,
        quantity: canonical.quantity,
        lineTotal: canonical.lineTotal,
        selectedOptions: canonical.selectedOptions,
      })
    }

    // SEC-047 / M-1: Verify shipping rate server-side. Re-fetch Shippo rates for
    // the server-derived cart weight and confirm the client-selected service/carrier
    // is available at that weight. This prevents a client from fetching a rate for
    // a tiny parcel and applying it to a heavy order.
    // P-5: A ship-to address and a verifiable rate are REQUIRED — never fall back
    // to $0 shipping on a physical order.
    const shippingAddress = body.shippingAddress
    if (
      !shippingAddress ||
      !shippingAddress.street1 ||
      !shippingAddress.city ||
      !shippingAddress.state ||
      !shippingAddress.zip ||
      !shippingAddress.country
    ) {
      return NextResponse.json({ error: 'A complete shipping address is required.' }, { status: 400 })
    }
    if (!body.shippingRate) {
      return NextResponse.json({ error: 'A shipping method is required.' }, { status: 400 })
    }

    let shippingAmountCents = 0
    let verifiedShippingRate: { amount: number; carrier: string; serviceName: string } | null = null

    verifiedShippingRate = await verifyShippingRate({
      items: body.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId ?? null,
        quantity: Math.max(1, Math.min(999, Number(item.quantity) || 1)),
      })),
      address: shippingAddress,
      selectedRate: body.shippingRate,
    })

    if (!verifiedShippingRate) {
      return NextResponse.json(
        { error: 'Shipping rate could not be verified for this cart. Please refresh rates and try again.' },
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

    // SEC-047 / P-2: Apply promo / bundle-deal discounts server-side.
    let promoDiscountCents = 0
    let appliedDiscountCode: string | null = null
    let appliedPromoId: string | null = null
    const appliedDealIds: string[] = []
    if (body.discountCode && promotionLines.length > 0) {
      const rawCode =
        typeof body.discountCode === 'string'
          ? body.discountCode.replace(/[%_\\]/g, '').trim().toUpperCase()
          : ''
      if (rawCode && rawCode.length <= 40) {
        const now = new Date()

        const { data: promoRows } = await supabase
          .from('exp_promo_codes')
          .select('*')
          .eq('is_active', true)
          .eq('code', rawCode)
          .limit(1)
        const promoValidation = validatePromoCode((promoRows?.[0] ?? null) as any, rawCode, now)

        const { data: dealRows } = await supabase
          .from('exp_bundle_deals')
          .select('*')
          .eq('is_active', true)
        const dealsValidation = resolveEligibleDeals((dealRows ?? []) as any, promotionLines, rawCode, now)

        const appliedPromo = promoValidation.ok && promoValidation.promo ? promoValidation.promo : null
        const appliedDeals = dealsValidation.ok ? dealsValidation.deals : []

        if (appliedPromo) appliedPromoId = appliedPromo.id
        for (const deal of appliedDeals) appliedDealIds.push(deal.id)

        if (appliedPromo || appliedDeals.length > 0) {
          const outcome = applyPromotions({
            lines: promotionLines,
            shippingCost: shippingAmountCents / 100,
            promo: appliedPromo as any,
            deals: appliedDeals as any,
          })

          // Reduce each product line by its allocated discount.
          for (let i = 0; i < orderItemsSnapshot.length; i += 1) {
            const discountCents = Math.round((outcome.lineDiscounts[i] ?? 0) * 100)
            if (discountCents <= 0 || !lineItems[i]) continue
            const lineCentsBefore = lineItems[i].base_price_money.amount * orderItemsSnapshot[i].quantity
            const lineCentsAfter = Math.max(1, lineCentsBefore - discountCents)
            const unitCents = Math.max(1, Math.round(lineCentsAfter / orderItemsSnapshot[i].quantity))
            lineItems[i].base_price_money.amount = unitCents
            promoDiscountCents += lineCentsBefore - lineCentsAfter
          }

          // Free-shipping: reduce or remove the shipping line item.
          const shippingDiscountCents = Math.round(outcome.shippingDiscount * 100)
          if (shippingAmountCents > 0 && shippingDiscountCents > 0) {
            const newShippingCents = Math.max(0, shippingAmountCents - shippingDiscountCents)
            const shippingLineIndex = lineItems.length - 1
            if (newShippingCents === 0) {
              lineItems.splice(shippingLineIndex, 1)
              promoDiscountCents += shippingAmountCents
              shippingAmountCents = 0
            } else if (lineItems[shippingLineIndex]) {
              lineItems[shippingLineIndex].base_price_money.amount = newShippingCents
              promoDiscountCents += shippingAmountCents - newShippingCents
              shippingAmountCents = newShippingCents
            }
          }

          appliedDiscountCode = rawCode

          totalAmountCents = lineItems.reduce(
            (sum, li) => sum + li.base_price_money.amount * Number(li.quantity),
            0
          )
        }
      }
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
        ...(appliedDiscountCode && { promo_code: appliedDiscountCode }),
        ...(promoDiscountCents > 0 && { promo_discount_cents: String(promoDiscountCents) }),
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

    // SEC-062: Increment promo/bundle usage counters now that a real payment
    // link exists. Best-effort — never fail checkout if the increment errors.
    if (appliedPromoId || appliedDealIds.length > 0) {
      try {
        if (appliedPromoId) {
          await supabase.rpc('exp_increment_promo_code_usage', { p_code_id: appliedPromoId })
        }
        for (const dealId of appliedDealIds) {
          await supabase.rpc('exp_increment_bundle_deal_usage', { p_deal_id: dealId })
        }
      } catch (err) {
        safeLogError('[square:checkout:promo-usage]', err)
      }
    }

    // SEC-002: Persist the order to the database with server-computed total
    const guestTrackingToken = randomUUID()
    const orderTotalDollars = totalAmountCents / 100

    const { data: orderRow, error: orderError } = await supabase
      .from('exp_orders')
      .insert({
        square_order_id: checkoutResponse.payment_link.order_id,
        order_path: 'shop',
        payment_mode: 'square_checkout',
        payment_status: 'pending',
        status: 'awaiting_payment',
        order_total: orderTotalDollars,
        subtotal: orderItemsSnapshot.reduce((sum, i) => sum + i.line_subtotal, 0),
        discount_amount:
          orderItemsSnapshot.reduce((sum, i) => sum + i.line_discount, 0) + promoDiscountCents / 100,
        shipping_cost: shippingAmountCents / 100,
        shipping_method: verifiedShippingRate?.serviceName || 'standard',
        shipping_address: body.shippingAddress || {},
        cart_snapshot: { items: orderItemsSnapshot },
        customer_email: body.buyerEmail || null,
        guest_tracking_token: guestTrackingToken,
        branch: process.env.NEXT_PUBLIC_APP_ENV === 'production' ? 'PROD' : 'DEV',
      })
      .select('id')
      .single()

    if (orderError) {
      safeLogError('[square:checkout:order-insert]', orderError)
      // Don't fail the checkout — the Square link is already created.
      // The webhook will still work, but reconciliation may fail.
    } else if (orderRow?.id) {
      const orderItemsRows = orderItemsSnapshot.map((item) => ({
        order_id: orderRow.id,
        product_id: item.product_id,
        product_title: item.product_title,
        variant_label: item.variant_label,
        selected_options: item.selected_options,
        option_snapshot: item.selected_options,
        design_id: item.design_id,
        design_snapshot: item.design_snapshot,
        unit_price: item.unit_price,
        quantity: item.quantity,
        line_subtotal: item.line_subtotal,
        line_discount: item.line_discount,
        line_total: item.line_total,
      }))

      const { error: orderItemsError } = await supabase
        .from('exp_order_items')
        .insert(orderItemsRows)

      if (orderItemsError) {
        safeLogError('[square:checkout:order-items-insert]', orderItemsError)
      }
    }

    return NextResponse.json({
      checkoutUrl: checkoutResponse.payment_link.url,
      checkoutId: checkoutResponse.payment_link.id,
      guestTrackingToken, // SEC-002: Return token so client can track the order
    })
  } catch (error) {
    safeLogError('[square:checkout]', error)
    return NextResponse.json({ error: 'Could not create checkout. Please try again.' }, { status: 500 })
  }
}