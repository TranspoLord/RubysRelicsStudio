import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createSquareCheckout, deleteSquarePaymentLink } from '@/lib/square/client'
import { NORTH_AMERICA_COUNTRIES, ShippingRate, verifyShippingRate } from '@/lib/shippo/client'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import {
  computeCanonicalLine,
  MAX_LINE_QUANTITY,
  PricingContext,
  PricingSelectedOption,
} from '@/lib/pricing/engine'
import {
  applyPromotions,
  resolveEligibleDeals,
  validatePromoCode,
  PromotionLineInput,
  PromoCodeRecord,
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
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { sanitizePhone, sanitizeText, validateEmail } from '@/lib/validate'
import { reconcileOrderTotals } from '@/lib/pricing/reconcile'
import { evaluateInventoryState } from '@/lib/inventory/state'
import type { InventoryStateInput } from '@/lib/inventory/state'

const MAX_DESIGN_SOURCE_BYTES = 60 * 1024 * 1024

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * OCT #2: `checkout_attempt_id` is a uuid column, so a malformed value would
 * make the insert throw. Anything that is not a well-formed UUID is treated as
 * absent (the checkout still works, it just loses retry idempotency).
 */
function normalizeCheckoutAttemptId(value: unknown): string | null {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value.toLowerCase() : null
}

// OCT #20: 2 MB is plenty for a cart plus design documents (design *assets* are
// uploaded through their own endpoint); the previous 20 MB cap was an easy
// memory-exhaustion lever. 50 items is far above any real order.
const MAX_CHECKOUT_BYTES = 2 * 1024 * 1024
const MAX_CHECKOUT_ITEMS = 50

interface SanitizedShippingAddress {
  name?: string
  street1: string
  street2?: string
  city: string
  state: string
  zip: string
  country: string
  phone?: string
}

/**
 * OCT #20: `shippingAddress` was stored verbatim and forwarded whole to Shippo,
 * so any client-supplied key landed in `exp_orders.shipping_address` and in the
 * Shippo payload. Rebuild it from a whitelist with length caps and a
 * supported-country check. Returns null when a required field is missing.
 *
 * `name` is optional here because the storefront form does not collect it yet —
 * #31 makes it required once the form does (same for the email, #30).
 */
function sanitizeShippingAddress(value: unknown): SanitizedShippingAddress | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>

  const name = sanitizeText(raw.name, 100)
  const street1 = sanitizeText(raw.street1, 200)
  const street2 = sanitizeText(raw.street2, 200)
  const city = sanitizeText(raw.city, 100)
  const state = sanitizeText(raw.state, 50)
  const zip = sanitizeText(raw.zip, 20)
  const phone = sanitizePhone(raw.phone)

  // Exactly a two-letter code — do not let `sanitizeText` truncate 'USA' to 'US'.
  const country = typeof raw.country === 'string' ? raw.country.trim().toUpperCase() : ''
  if (!NORTH_AMERICA_COUNTRIES.includes(country)) return null

  if (!street1 || !city || !state || !zip) return null

  return {
    ...(name ? { name } : {}),
    street1,
    ...(street2 ? { street2 } : {}),
    city,
    state,
    zip,
    country,
    ...(phone ? { phone } : {}),
  }
}

interface UnavailableLine {
  productId: string
  available: number
  requested: number
  reason: 'forced_out_of_stock' | 'insufficient_stock'
}

/** An `exp_product_inventory` row, plus the product it belongs to. */
type InventoryRow = InventoryStateInput & { product_id: string }

/**
 * OCT #12: stock was enforced only in the browser, so a direct POST — or a cart
 * built before stock changed — could buy an out-of-stock one-of-a-kind item.
 * Aggregate the requested quantity per product and check it against
 * `exp_product_inventory` with the same helper the storefront uses. Returns the
 * first short line, or null when every ready-made line is satisfiable.
 *
 * This is the friendly pre-check, not the guarantee: `exp_reserve_order_inventory`
 * re-checks under `FOR UPDATE` once the order row exists.
 */
async function findUnavailableLine(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  items: CheckoutItemRequest[],
): Promise<UnavailableLine | null> {
  const requested = new Map<string, number>()
  for (const item of items) {
    const qty = Math.max(1, Math.min(999, Number(item.quantity) || 1))
    requested.set(item.productId, (requested.get(item.productId) ?? 0) + qty)
  }

  const productIds = [...requested.keys()]
  if (productIds.length === 0) return null

  const { data: products } = await supabase
    .from('exp_products')
    .select('id, is_ready_made')
    .in('id', productIds)

  const readyMade: string[] = (products ?? [])
    .filter((row: { is_ready_made: boolean | null }) => row.is_ready_made)
    .map((row: { id: string }) => row.id)
  if (readyMade.length === 0) return null

  const { data: inventory } = await supabase
    .from('exp_product_inventory')
    .select('product_id, available_qty, low_stock_threshold, availability_override, is_track_inventory')
    .in('product_id', readyMade)

  const byProduct = new Map<string, InventoryRow>(
    (inventory ?? []).map((row: InventoryRow) => [row.product_id, row] as const),
  )

  for (const productId of readyMade) {
    const want = requested.get(productId) ?? 0
    const row = byProduct.get(productId)

    // A ready-made product with no inventory row is not purchasable at all.
    if (!row) {
      return { productId, available: 0, requested: want, reason: 'forced_out_of_stock' }
    }

    const state = evaluateInventoryState(row)
    if (state.status === 'forced_out_of_stock') {
      return { productId, available: 0, requested: want, reason: 'forced_out_of_stock' }
    }
    if (state.maxPurchasable !== null && want > state.maxPurchasable) {
      return {
        productId,
        available: state.maxPurchasable,
        requested: want,
        reason: 'insufficient_stock',
      }
    }
  }

  return null
}

/**
 * OCT #19: hand back claims already taken in this request when a later claim
 * fails, so a partly-applied multi-deal cart does not burn usage. Best-effort —
 * a failed release is logged, never fatal.
 */
async function releaseClaims(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  claims: Array<{ release: string; id: string }>,
): Promise<void> {
  for (const claim of claims) {
    try {
      await supabase.rpc(claim.release, { p_id: claim.id })
    } catch (error) {
      safeLogError('[square:checkout:promo-release]', error)
    }
  }
}

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
  /** OCT #5: the NFC tag add-on. Only `enabled` affects the price. */
  nfc?: { enabled?: boolean; targetData?: string; leaveUnlocked?: boolean } | null
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
  /** OCT #2: client-generated idempotency key; a retry resolves to the same order. */
  checkoutAttemptId?: string
}

/**
 * Fetch a product with its variants, options, and bulk discounts from
 * Supabase, shaped as a PricingContext for computeCanonicalLine().
 */
async function fetchPricingContext(productId: string): Promise<PricingContext | null> {
  const supabase = getSupabaseAdmin()

  const { data: product, error } = await supabase
    .from('exp_products')
    .select('id, title, base_price, is_active, is_archived, category_key, nfc_price_delta')
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

  // OCT #5: process add-ons and multi-process combo discounts are part of the
  // price. The engine ignored both, so the storefront showed one total and Square
  // charged another.
  const { data: processPricing } = await supabase
    .from('exp_product_process_pricing')
    .select('id, product_id, process_type_key, price_delta, is_enabled')
    .eq('product_id', productId)

  const { data: comboDiscounts } = await supabase
    .from('exp_product_combo_discounts')
    .select('id, product_id, min_processes, discount_type, discount_value, label, is_enabled')
    .eq('product_id', productId)

  return {
    id: product.id,
    title: product.title,
    base_price: Number(product.base_price),
    is_active: product.is_active,
    is_archived: product.is_archived,
    categoryKey: product.category_key ?? null,
    nfc_price_delta: Number(product.nfc_price_delta ?? 1),
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
    process_pricing: (processPricing ?? []).map((p: any) => ({
      id: p.id,
      product_id: p.product_id,
      process_type_key: p.process_type_key,
      price_delta: Number(p.price_delta),
      is_enabled: p.is_enabled,
    })),
    combo_discounts: (comboDiscounts ?? []).map((c: any) => ({
      id: c.id,
      product_id: c.product_id,
      min_processes: Number(c.min_processes),
      discount_type: c.discount_type,
      discount_value: c.discount_value === null ? null : Number(c.discount_value),
      label: c.label ?? null,
      is_enabled: c.is_enabled,
    })),
  }
}

export async function POST(request: Request) {
  try {
    const csrfResponse = requireCsrfOriginOnly(request)
    if (csrfResponse) return csrfResponse

    // OCT #20: the most expensive public endpoint (per-item DB queries, a Shippo
    // shipment, a Square link and inserts) and the only paid-API public route with
    // no limit. Fail closed so a flood cannot exhaust Square/Shippo quota.
    const rl = await rateLimit(`checkout:${getClientIp(request)}`, 10, 10 * 60_000, {
      failClosed: true,
    })
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter ?? 60)

    const parsed = await parseJsonBodyOrError<SquareCheckoutRequest>(request, MAX_CHECKOUT_BYTES)
    if (!parsed.ok) return parsed.response

    const body = parsed.body

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: 'No items provided for checkout.' }, { status: 400 })
    }

    if (body.items.length > MAX_CHECKOUT_ITEMS) {
      return NextResponse.json(
        { error: `Checkout is limited to ${MAX_CHECKOUT_ITEMS} items. Please split your order.` },
        { status: 400 },
      )
    }

    // OCT #20: validate the email instead of storing whatever was sent.
    // Required-ness is #30 — the storefront form does not require it yet.
    const buyerEmail = body.buyerEmail === undefined ? null : validateEmail(body.buyerEmail)
    if (body.buyerEmail !== undefined && buyerEmail === null) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }

    const buyerPhone = sanitizePhone(body.buyerPhone)

    // OCT #20: whitelist the address; never store or forward the raw object.
    const shippingAddress = sanitizeShippingAddress(body.shippingAddress)
    if (!shippingAddress) {
      return NextResponse.json({ error: 'A complete shipping address is required.' }, { status: 400 })
    }

    // Check if Square is configured
    if (!process.env.SQUARE_ACCESS_TOKEN || !process.env.SQUARE_LOCATION_ID) {
      return NextResponse.json({ error: 'Square checkout not configured.' }, { status: 503 })
    }

    const supabase = getSupabaseAdmin()

    // OCT #12: stock was enforced only in the browser. Check it here — before the
    // per-item pricing queries, the Shippo shipment and the Square link — so an
    // oversold cart is rejected cheaply and nothing payable is ever created.
    const unavailable = await findUnavailableLine(supabase, body.items)
    if (unavailable) {
      safeLogError('[square:checkout:inventory]', unavailable)
      return NextResponse.json(
        {
          error:
            unavailable.reason === 'forced_out_of_stock'
              ? 'One of your items is no longer available.'
              : `Only ${unavailable.available} left of one of your items.`,
          productId: unavailable.productId,
          available: unavailable.available,
        },
        { status: 409 },
      )
    }

    let totalAmountCents = 0

    // SEC-001: Compute all prices server-side — never trust client prices
    const lineItems: Array<{
      uid: string
      name: string
      quantity: string
      base_price_money: { amount: number; currency: string }
      applied_discounts?: Array<{ discount_uid: string }>
    }> = []
    const orderItemsSnapshot = []
    const promotionLines: PromotionLineInput[] = []
    // OCT #35: per-line discounts in integer cents — the engine's tier discount and
    // the promo allocation tracked separately, so the order totals reconcile and
    // each line can be emitted as a Square discount.
    const lineTierDiscountCents: number[] = []
    const linePromoDiscountCents: number[] = []
    let shippingPromoCents = 0
    let shippingLineIndex = -1

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

      // OCT #5: reject a bad quantity instead of silently clamping it. The old
      // `Math.max(1, Math.min(999, …))` turned `1.5` into `1` locally and still
      // sent `"1.5"` to Square, and accepted 0.
      const lineQuantity = Number(item.quantity)
      if (!Number.isInteger(lineQuantity) || lineQuantity < 1 || lineQuantity > MAX_LINE_QUANTITY) {
        return NextResponse.json(
          {
            error: 'One or more items have an invalid quantity. Please review your cart and try again.',
          },
          { status: 400 },
        )
      }

      // Compute canonical price server-side
      const canonical = computeCanonicalLine(
        pricingContext,
        lineQuantity,
        item.variantId ?? null,
        item.selectedOptions ?? [],
        Array.isArray(item.selectedProcessKeys) ? item.selectedProcessKeys : [],
        item.nfc?.enabled === true ? { enabled: true } : null
      )

      if (!canonical) {
        safeLogError('[square:checkout:price-compute]', { productId: item.productId, title: pricingContext.title })
        return NextResponse.json(
          { error: 'We could not calculate a price for one or more items. Please review your selections.' },
          { status: 400 }
        )
      }

      // OCT #35: exact integer cents. Square gets the UNDISCOUNTED unit price and
      // the tier discount rides on a `discounts` line — rewriting the unit price
      // is what made the charge differ from the displayed total.
      totalAmountCents += canonical.lineSubtotalCents

      lineItems.push({
        uid: `line-${lineItems.length + 1}`,
        name: canonical.description
          ? `${canonical.name} (${canonical.description})`
          : canonical.name,
        quantity: String(canonical.quantity),
        base_price_money: {
          amount: canonical.unitCents, // Server-computed, never client-supplied
          currency: 'USD',
        },
      })

      lineTierDiscountCents.push(canonical.lineDiscountCents)
      linePromoDiscountCents.push(0)

      orderItemsSnapshot.push({
        product_id: canonical.productId,
        product_title: canonical.name,
        variant_label: canonical.variantLabel,
        selected_options: canonical.selectedOptions,
        design_id: designId,
        design_snapshot: designSnapshot,
        selected_process_keys: canonical.selectedProcessKeys,
        nfc: canonical.nfcEnabled
          ? {
              targetData:
                typeof item.nfc?.targetData === 'string' ? item.nfc.targetData.slice(0, 250) : '',
              leaveUnlocked: item.nfc?.leaveUnlocked === true,
            }
          : null,
        unit_price: canonical.unitCents / 100,
        quantity: canonical.quantity,
        line_subtotal: canonical.lineSubtotalCents / 100,
        line_subtotal_cents: canonical.lineSubtotalCents,
        line_discount: canonical.lineDiscountCents / 100,
        line_discount_cents: canonical.lineDiscountCents,
        line_total: canonical.lineTotalCents / 100,
        line_total_cents: canonical.lineTotalCents,
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

    shippingLineIndex = lineItems.length
    lineItems.push({
      uid: 'line-shipping',
      name: `Shipping: ${verifiedShippingRate.serviceName}`,
      quantity: '1',
      base_price_money: {
        amount: shippingAmountCents,
        currency: 'USD',
      },
    })

    // SEC-047 / P-2: Apply promo / bundle-deal discounts server-side.
    // OCT #19: automatic deals are resolved independently of any code. They used
    // to be dropped whenever no code was entered, and also whenever a *promo*
    // code was entered — resolveEligibleDeals returns ok:false for an unmatched
    // code, and the route threw its automatic deals away along with it.
    let promoDiscountCents = 0
    let appliedDiscountCode: string | null = null
    let appliedPromoId: string | null = null
    const appliedDealIds: string[] = []

    const now = new Date()
    const rawCode =
      typeof body.discountCode === 'string'
        ? body.discountCode.replace(/[%_\\]/g, '').trim().toUpperCase()
        : ''
    const code = rawCode.length > 0 && rawCode.length <= 40 ? rawCode : ''

    const { data: dealRows } = await supabase
      .from('exp_bundle_deals')
      .select('*')
      .eq('is_active', true)

    // Hand the code to deal resolution ONLY when it names an active deal code;
    // otherwise resolve the automatic deals on their own.
    const isDealCode =
      code.length > 0 &&
      (dealRows ?? []).some(
        (deal) => deal.trigger_type === 'code' && (deal.code ?? '').trim().toUpperCase() === code,
      )

    const dealsValidation = resolveEligibleDeals(
      (dealRows ?? []) as any,
      promotionLines,
      isDealCode ? code : null,
      now,
    )
    const appliedDeals = dealsValidation.ok ? dealsValidation.deals : []

    let appliedPromo: PromoCodeRecord | null = null
    if (code.length > 0) {
      const { data: promoRows } = await supabase
        .from('exp_promo_codes')
        .select('*')
        .eq('is_active', true)
        .eq('code', code)
        .limit(1)
      const promoValidation = validatePromoCode((promoRows?.[0] ?? null) as any, code, now)
      appliedPromo = promoValidation.ok && promoValidation.promo ? promoValidation.promo : null
    }

    // OCT #19: an entered code that resolves to nothing is a hard error. The old
    // behaviour dropped it silently and charged full price with no message.
    if (code.length > 0 && !appliedPromo && !isDealCode) {
      return NextResponse.json(
        { error: "That code isn't valid", code: 'promo_invalid' },
        { status: 422 },
      )
    }

    if (appliedPromo) appliedPromoId = appliedPromo.id
    for (const deal of appliedDeals) appliedDealIds.push(deal.id)

    if (appliedPromo || appliedDeals.length > 0) {
      const outcome = applyPromotions({
        lines: promotionLines,
        shippingCost: shippingAmountCents / 100,
        promo: appliedPromo as any,
        deals: appliedDeals as any,
      })

      // OCT #35: record the promo allocation per line instead of rewriting the unit
      // price. Rewriting it re-introduced the per-unit rounding this item exists to
      // remove, and Square needs the UNDISCOUNTED unit to attribute a discount line.
      // Each allocation is clamped to what is left on the line, so a line can never
      // go negative.
      for (let i = 0; i < orderItemsSnapshot.length; i += 1) {
        const requested = Math.round((outcome.lineDiscounts[i] ?? 0) * 100)
        if (requested <= 0) continue

        const alreadyDiscounted =
          (lineTierDiscountCents[i] ?? 0) + (linePromoDiscountCents[i] ?? 0)
        const lineSubtotalCents = orderItemsSnapshot[i].line_subtotal_cents
        linePromoDiscountCents[i] = Math.max(
          0,
          Math.min(requested, lineSubtotalCents - alreadyDiscounted)
        )
        promoDiscountCents += linePromoDiscountCents[i]
      }

      // Free shipping is a discount on the shipping line, not a removed line, so
      // Square still shows what was bought.
      const requestedShippingDiscount = Math.round(outcome.shippingDiscount * 100)
      if (shippingAmountCents > 0 && requestedShippingDiscount > 0) {
        shippingPromoCents = Math.min(requestedShippingDiscount, shippingAmountCents)
      }

      appliedDiscountCode = code || null
    }

    // ── OCT #35: fold the promo into the stored per-line totals ──────────────
    for (let i = 0; i < orderItemsSnapshot.length; i += 1) {
      const subtotalCents = orderItemsSnapshot[i].line_subtotal_cents
      const totalDiscountCents = Math.min(
        subtotalCents,
        (lineTierDiscountCents[i] ?? 0) + (linePromoDiscountCents[i] ?? 0)
      )

      orderItemsSnapshot[i].line_discount_cents = totalDiscountCents
      orderItemsSnapshot[i].line_discount = totalDiscountCents / 100
      orderItemsSnapshot[i].line_total_cents = subtotalCents - totalDiscountCents
      orderItemsSnapshot[i].line_total = (subtotalCents - totalDiscountCents) / 100
    }

    // ── OCT #35: emit a Square discount line for every discounted line ───────
    const squareDiscounts: Array<{
      uid: string
      name: string
      type: 'FIXED_AMOUNT'
      scope: 'LINE_ITEM'
      amount_money: { amount: number; currency: string }
    }> = []

    for (let i = 0; i < lineItems.length; i += 1) {
      const isShippingLine = i === shippingLineIndex
      const discountCents = isShippingLine
        ? shippingPromoCents
        : (lineTierDiscountCents[i] ?? 0) + (linePromoDiscountCents[i] ?? 0)

      if (discountCents <= 0) continue

      const discountUid = `${lineItems[i].uid}-discount`
      squareDiscounts.push({
        uid: discountUid,
        name: isShippingLine ? 'Free shipping' : (appliedDiscountCode ?? 'Volume discount'),
        type: 'FIXED_AMOUNT',
        scope: 'LINE_ITEM',
        amount_money: { amount: discountCents, currency: 'USD' },
      })
      lineItems[i].applied_discounts = [{ discount_uid: discountUid }]
    }

    // ── OCT #35: totals from exact cents, then assert they reconcile ─────────
    const orderTotals = {
      subtotalCents: orderItemsSnapshot.reduce(
        (sum, i) => sum + i.line_subtotal_cents,
        0
      ),
      discountCents:
        lineTierDiscountCents.reduce((a, b) => a + b, 0) +
        linePromoDiscountCents.reduce((a, b) => a + b, 0),
      shippingCents: shippingAmountCents,
      shippingDiscountCents: shippingPromoCents,
      // OCT #35 step 4: tax stays 0 until the owner sets a nexus/tax policy.
      taxCents: 0,
      totalCents: 0,
    }
    orderTotals.totalCents =
      orderTotals.subtotalCents -
      orderTotals.discountCents +
      orderTotals.shippingCents -
      orderTotals.shippingDiscountCents +
      orderTotals.taxCents

    const reconciliation = reconcileOrderTotals(orderTotals)
    if (!reconciliation.ok) {
      // The charge and the record disagree — fail before anything payable exists.
      safeLogError('[square:checkout:reconcile]', reconciliation)
      return NextResponse.json(
        { error: 'Could not start checkout. Please try again.' },
        { status: 500 },
      )
    }

    totalAmountCents = orderTotals.totalCents

    // Build shipping address note for reference
    const shippingNote = `Ship to: ${shippingAddress.street1}${shippingAddress.street2 ? ', ' + shippingAddress.street2 : ''}, ${shippingAddress.city}, ${shippingAddress.state} ${shippingAddress.zip}, ${shippingAddress.country}`

    // ── OCT #2: write the order BEFORE creating the Square link ──────────────
    // Previously the link was created first and any insert failure was only
    // logged, so the customer paid and no order was ever recorded. The order now
    // lands first; the link is created only once there is a row to attach it to.
    let guestTrackingToken = randomUUID()
    let orderId = randomUUID()
    const checkoutAttemptId = normalizeCheckoutAttemptId(body.checkoutAttemptId)

    // Idempotency: a retried attempt resolves to the order it already created,
    // instead of minting a second link and a second order row.
    //
    // This must also cover the *half-finished* attempt. If a first try failed
    // after the order row existed but before a link was attached (items, stock,
    // promo or Square failure), the row still carries the `checkout_attempt_id`.
    // Inserting again violates `exp_orders_checkout_attempt_uidx` (23505), so
    // every retry 500s. The row is reused instead.
    let reusedOrder: {
      id: string
      guest_tracking_token: string | null
      claimed_at: string | null
    } | null = null

    if (checkoutAttemptId) {
      const { data: existing } = await supabase
        .from('exp_orders')
        .select(
          'id, guest_tracking_token, claimed_at, square_payment_link_id, square_payment_link_url',
        )
        .eq('checkout_attempt_id', checkoutAttemptId)
        .maybeSingle()

      if (existing?.square_payment_link_url) {
        return NextResponse.json({
          checkoutUrl: existing.square_payment_link_url,
          checkoutId: existing.square_payment_link_id,
          guestTrackingToken: existing.guest_tracking_token,
        })
      }

      if (existing?.id) {
        reusedOrder = {
          id: existing.id,
          guest_tracking_token: existing.guest_tracking_token,
          claimed_at: existing.claimed_at,
        }
        orderId = existing.id
        guestTrackingToken = existing.guest_tracking_token ?? guestTrackingToken
      }
    }

    // OCT #35: store from the reconciled cents, so the row satisfies
    // subtotal − discount_amount + shipping_cost − shipping_discount + tax_amount
    //   = order_total
    const orderTotalDollars = totalAmountCents / 100

    const orderFields = {
      order_path: 'shop',
      payment_mode: 'square_checkout',
      payment_status: 'pending',
      status: 'awaiting_payment',
      order_total: orderTotalDollars,
      subtotal: orderTotals.subtotalCents / 100,
      discount_amount: orderTotals.discountCents / 100,
      shipping_cost: orderTotals.shippingCents / 100,
      shipping_discount: orderTotals.shippingDiscountCents / 100,
      tax_amount: orderTotals.taxCents / 100,
      shipping_method: verifiedShippingRate?.serviceName || 'standard',
      shipping_address: shippingAddress,
      cart_snapshot: { items: orderItemsSnapshot },
      customer_email: buyerEmail,
      guest_tracking_token: guestTrackingToken,
      promo_code_id: appliedPromoId,
      bundle_deal_ids: appliedDealIds,
      branch: process.env.NEXT_PUBLIC_APP_ENV === 'production' ? 'PROD' : 'DEV',
    }

    // A first attempt inserts the row; a retry rewrites the row the idempotency
    // lookup above resolved to, so the attempt stays one order.
    const { data: orderRow, error: orderError } = reusedOrder
      ? await supabase
          .from('exp_orders')
          .update({ ...orderFields, updated_at: new Date().toISOString() })
          .eq('id', orderId)
          .select('id')
          .single()
      : await supabase
          .from('exp_orders')
          .insert({
            id: orderId,
            checkout_attempt_id: checkoutAttemptId,
            ...orderFields,
          })
          .select('id')
          .single()

    if (orderError || !orderRow?.id) {
      // No Square link exists yet, so there is nothing to unwind and nothing for
      // the customer to pay. Fail loudly rather than returning a payable URL for
      // an order we could not record.
      safeLogError('[square:checkout:order-insert]', orderError)
      return NextResponse.json(
        { error: 'Could not start checkout. Please try again.' },
        { status: 500 },
      )
    }

    const orderItemsRows = orderItemsSnapshot.map((item) => ({
      order_id: orderRow.id,
      product_id: item.product_id,
      product_title: item.product_title,
      variant_label: item.variant_label,
      selected_options: item.selected_options,
      option_snapshot: item.selected_options,
      design_id: item.design_id,
      design_snapshot: item.design_snapshot,
      selected_process_keys: item.selected_process_keys ?? [],
      nfc: item.nfc ?? null,
      unit_price: item.unit_price,
      quantity: item.quantity,
      line_subtotal: item.line_subtotal,
      line_discount: item.line_discount,
      line_total: item.line_total,
    }))

    if (reusedOrder) {
      // A previous attempt can have written items before failing later (stock,
      // promo or Square), so replace them instead of appending duplicate lines.
      const { error: clearItemsError } = await supabase
        .from('exp_order_items')
        .delete()
        .eq('order_id', orderRow.id)

      if (clearItemsError) {
        safeLogError('[square:checkout:order-items-clear]', clearItemsError)
        await supabase.from('exp_orders').update({ status: 'cancelled' }).eq('id', orderRow.id)
        return NextResponse.json(
          { error: 'Could not start checkout. Please try again.' },
          { status: 500 },
        )
      }
    }

    const { error: orderItemsError } = await supabase
      .from('exp_order_items')
      .insert(orderItemsRows)

    if (orderItemsError) {
      // An order without its items cannot be fulfilled — unwind and fail.
      safeLogError('[square:checkout:order-items-insert]', orderItemsError)
      await supabase.from('exp_orders').update({ status: 'cancelled' }).eq('id', orderRow.id)
      return NextResponse.json(
        { error: 'Could not start checkout. Please try again.' },
        { status: 500 },
      )
    }

    // ── OCT #12: reserve stock before any Square link exists ─────────────────
    // `exp_reserve_order_inventory` re-checks under `FOR UPDATE` (so two
    // concurrent buyers cannot both win) and writes the `order_reserved`
    // adjustment that moves `available_qty`. Doing this before the link means a
    // short order is cancelled with nothing payable outstanding.
    const { data: reserveResult, error: reserveError } = await supabase.rpc(
      'exp_reserve_order_inventory',
      { p_order_id: orderRow.id },
    )

    if (reserveError) {
      safeLogError('[square:checkout:reserve]', reserveError)
      await supabase.from('exp_orders').update({ status: 'cancelled' }).eq('id', orderRow.id)
      return NextResponse.json(
        { error: 'Could not reserve stock. Please try again.' },
        { status: 500 },
      )
    }

    const reserve = reserveResult as {
      ok?: boolean
      reason?: string
      product_id?: string
      available_qty?: number
    } | null

    if (reserve && reserve.ok === false) {
      await supabase.from('exp_orders').update({ status: 'cancelled' }).eq('id', orderRow.id)
      const available = Number(reserve.available_qty ?? 0)
      safeLogError('[square:checkout:reserve-short]', reserve)
      return NextResponse.json(
        {
          error:
            available > 0
              ? `Only ${available} left of one of your items.`
              : 'One of your items is no longer available.',
          productId: reserve.product_id ?? null,
          available,
        },
        { status: 409 },
      )
    }

    // ── OCT #19: claim promo/deal usage atomically, before any Square link ───
    // The old code incremented *after* the link existed and unconditionally, so
    // concurrent checkouts overshot `usage_limit` and an abandoned checkout
    // consumed a limited code. Each claim is a single conditional UPDATE; a
    // non-true result means someone else took the last unit.
    const claims = [
      ...(appliedPromoId
        ? [
            {
              claim: 'exp_try_redeem_promo_code',
              release: 'exp_release_promo_code',
              id: appliedPromoId,
            },
          ]
        : []),
      ...appliedDealIds.map((id) => ({
        claim: 'exp_try_redeem_bundle_deal',
        release: 'exp_release_bundle_deal',
        id,
      })),
    ]
    const claimed: Array<{ release: string; id: string }> = []

    // A retry reuses the order row, and `claimed_at` records that this order has
    // already consumed its promo/deal usage. Claiming again would charge a
    // limited code twice, so the claims are skipped when the marker is set.
    if (!reusedOrder?.claimed_at) {
      for (const claim of claims) {
        const { data: taken, error: claimError } = await supabase.rpc(claim.claim, {
          p_id: claim.id,
        })

        if (claimError) {
          safeLogError('[square:checkout:promo-claim]', claimError)
          await releaseClaims(supabase, claimed)
          await supabase.from('exp_orders').update({ status: 'cancelled' }).eq('id', orderRow.id)
          return NextResponse.json(
            { error: 'Could not apply your discount. Please try again.' },
            { status: 500 },
          )
        }

        if (taken !== true) {
          await releaseClaims(supabase, claimed)
          await supabase.from('exp_orders').update({ status: 'cancelled' }).eq('id', orderRow.id)
          return NextResponse.json(
            { error: "That code isn't valid", code: 'promo_invalid' },
            { status: 422 },
          )
        }

        claimed.push({ release: claim.release, id: claim.id })
      }

      if (claims.length > 0) {
        // Only after the whole round succeeded, so a partly-applied cart that was
        // released above leaves the marker unset for the retry to claim again.
        await supabase
          .from('exp_orders')
          .update({ claimed_at: new Date().toISOString() })
          .eq('id', orderRow.id)
      }
    }

    // ── Create the Square link, now that the order row exists ────────────────
    // The idempotency key is the checkout attempt (or the order id), so a retry
    // that slips past the lookup above cannot mint a second link.
    const idempotencyKey = checkoutAttemptId ?? orderRow.id

    let checkoutResponse: Awaited<ReturnType<typeof createSquareCheckout>>
    try {
      checkoutResponse = await createSquareCheckout({
        lineItems,
        discounts: squareDiscounts,
        idempotencyKey,
        note: shippingNote || 'Order from Ruby\'s Relics Studio',
        // OCT #13: send the buyer back to *their* order instead of a bare
        // "thanks" page — Square appends its own params after ours.
        redirectUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/checkout/success?order=${encodeURIComponent(orderRow.id)}&access=${encodeURIComponent(guestTrackingToken)}`,
        metadata: {
          ...(buyerEmail && { buyer_email: buyerEmail }),
          ...(buyerPhone && { buyer_phone: buyerPhone }),
          ...(appliedDiscountCode && { promo_code: appliedDiscountCode }),
          ...(promoDiscountCents > 0 && { promo_discount_cents: String(promoDiscountCents) }),
          ...(verifiedShippingRate && {
            shipping_carrier: verifiedShippingRate.carrier,
            shipping_service: verifiedShippingRate.serviceName,
            shipping_amount: String(verifiedShippingRate.amount),
          }),
          shipping_country: shippingAddress.country,
          shipping_zip: shippingAddress.zip,
        },
      })
    } catch (squareError) {
      safeLogError('[square:checkout:link-create]', squareError)
      await supabase.from('exp_orders').update({ status: 'cancelled' }).eq('id', orderRow.id)
      return NextResponse.json(
        { error: 'Could not reach the payment provider. Please try again.' },
        { status: 502 },
      )
    }

    // ── Attach the link to the order ─────────────────────────────────────────
    const { error: linkAttachError } = await supabase
      .from('exp_orders')
      .update({
        square_order_id: checkoutResponse.payment_link.order_id,
        square_payment_link_id: checkoutResponse.payment_link.id,
        square_payment_link_url: checkoutResponse.payment_link.url,
      })
      .eq('id', orderRow.id)

    if (linkAttachError) {
      // The link is live but unrecorded. Delete it so the customer cannot pay
      // for an order we cannot reconcile, then fail.
      safeLogError('[square:checkout:link-attach]', linkAttachError)
      try {
        await deleteSquarePaymentLink(checkoutResponse.payment_link.id)
      } catch (deleteError) {
        safeLogError('[square:checkout:link-attach:delete]', deleteError)
      }
      await supabase.from('exp_orders').update({ status: 'cancelled' }).eq('id', orderRow.id)
      return NextResponse.json(
        { error: 'Could not start checkout. Please try again.' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      checkoutUrl: checkoutResponse.payment_link.url,
      checkoutId: checkoutResponse.payment_link.id,
      guestTrackingToken, // SEC-002: Return token so client can track the order
      // OCT #5: the authoritative total. The client compares it with its own
      // summary and warns instead of silently redirecting when they differ.
      chargedTotalCents: totalAmountCents,
    })
  } catch (error) {
    safeLogError('[square:checkout]', error)
    return NextResponse.json({ error: 'Could not create checkout. Please try again.' }, { status: 500 })
  }
}