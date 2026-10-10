import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * OCT #2: the order row is written BEFORE the Square link is created, an insert
 * failure is fatal instead of logged-and-ignored, and a retried checkout is
 * idempotent. Before this, the link was created first, the insert error was
 * swallowed and the payable URL was returned anyway — the customer paid and no
 * order was ever recorded.
 */

const state = vi.hoisted(() => ({
  body: {} as Record<string, unknown>,
}))

const plan = vi.hoisted(() => ({
  product: null as unknown,
  existingOrder: null as unknown,
  orderInsertError: null as unknown,
  orderItemsInsertError: null as unknown,
  linkUpdateError: null as unknown,
  orderUpdates: [] as Array<Record<string, unknown>>,
  orderInserts: [] as Array<Record<string, unknown>>,
  orderItemRows: [] as Array<Record<string, unknown>>,
  products: [] as Array<Record<string, unknown>>,
  inventory: [] as Array<Record<string, unknown>>,
  reserveResult: null as unknown,
  reserveError: null as unknown,
  reserveCalls: [] as string[],
  claimResult: true as unknown,
  claimError: null as unknown,
  claimResults: [] as boolean[],
  claimCalls: [] as Array<{ name: string; id: string }>,
  releaseCalls: [] as Array<{ name: string; id: string }>,
  orderItemDeletes: [] as Array<{ column: string; value: unknown }>,
}))

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  createSquareCheckout: vi.fn(),
  deleteSquarePaymentLink: vi.fn(),
  verifyShippingRate: vi.fn(),
  computeCanonicalLine: vi.fn(),
  validatePromoCode: vi.fn(),
  resolveEligibleDeals: vi.fn(),
  applyPromotions: vi.fn(),
  rateLimit: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }))
vi.mock('@/lib/square/client', () => ({
  createSquareCheckout: mocks.createSquareCheckout,
  deleteSquarePaymentLink: mocks.deleteSquarePaymentLink,
}))
vi.mock('@/lib/shippo/client', () => ({
  NORTH_AMERICA_COUNTRIES: ['US', 'CA', 'MX'],
  verifyShippingRate: mocks.verifyShippingRate,
}))
vi.mock('@/lib/pricing/engine', () => ({
  computeCanonicalLine: mocks.computeCanonicalLine,
  MAX_LINE_QUANTITY: 999,
}))
vi.mock('@/lib/pricing/promotions', () => ({
  validatePromoCode: mocks.validatePromoCode,
  resolveEligibleDeals: mocks.resolveEligibleDeals,
  applyPromotions: mocks.applyPromotions,
}))
vi.mock('@/lib/rate-limit', () => ({
  getClientIp: () => '127.0.0.1',
  rateLimit: mocks.rateLimit,
  rateLimitResponse: (retryAfter: number) =>
    new Response(JSON.stringify({ error: 'Too many requests. Please wait before trying again.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
    }),
}))
vi.mock('@/lib/security/csrf', () => ({ requireCsrfOriginOnly: () => null }))
vi.mock('@/lib/security/body', () => ({
  parseJsonBodyOrError: vi.fn(async () => ({ ok: true, body: state.body })),
}))
vi.mock('@/lib/security/logger', () => ({ safeLogError: vi.fn() }))

import { POST } from './route'

const ORDER_ID = '99999999-9999-4999-8999-999999999999'
const LINK_ID = 'square-link-1'
const LINK_URL = 'https://square.link/u/abc123'
const ATTEMPT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const PRODUCT = {
  id: 'prod-1',
  title: 'Test Product',
  base_price: 25,
  is_active: true,
  is_archived: false,
  category_key: 'signs',
}

const CANONICAL = {
  productId: 'prod-1',
  name: 'Test Product',
  description: null,
  variantLabel: null,
  selectedOptions: [],
  unitAmountCents: 2500,
  // OCT #35: exact cents — the route builds Square lines and the order row from these.
  unitCents: 2500,
  lineSubtotalCents: 2500,
  lineDiscountCents: 0,
  lineTotalCents: 2500,
  quantity: 1,
  lineSubtotal: 25,
  lineDiscount: 0,
  lineTotal: 25,
}

/** Table-aware PostgREST stand-in; also awaitable so `.update().eq()` works. */
function resolveAwaited(table: string) {
  if (table === 'exp_order_items') return { data: null, error: plan.orderItemsInsertError }
  if (table === 'exp_orders') return { data: null, error: plan.linkUpdateError }
  if (table === 'exp_products') return { data: plan.products, error: null }
  if (table === 'exp_product_inventory') return { data: plan.inventory, error: null }
  return { data: [], error: null }
}

function makeSupabase() {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {}
    // `.delete().eq(...)` is how a retried checkout clears stale item rows.
    let deleting = false
    builder.select = vi.fn(() => builder)
    builder.eq = vi.fn((column: string, value: unknown) => {
      if (deleting && table === 'exp_order_items') plan.orderItemDeletes.push({ column, value })
      return builder
    })
    builder.in = vi.fn(() => builder)
    builder.limit = vi.fn(async () => ({ data: [], error: null }))
    builder.delete = vi.fn(() => {
      deleting = true
      return builder
    })
    builder.insert = vi.fn((values: Record<string, unknown>) => {
      if (table === 'exp_orders') plan.orderInserts.push(values)
      if (table === 'exp_order_items' && Array.isArray(values)) {
        plan.orderItemRows.push(...(values as Array<Record<string, unknown>>))
      }
      return builder
    })
    builder.update = vi.fn((values: Record<string, unknown>) => {
      if (table === 'exp_orders') plan.orderUpdates.push(values)
      return builder
    })
    builder.maybeSingle = vi.fn(async () => {
      if (table === 'exp_products') return { data: plan.product, error: null }
      if (table === 'exp_orders') return { data: plan.existingOrder, error: null }
      return { data: null, error: null }
    })
    builder.single = vi.fn(async () => {
      if (table !== 'exp_orders') return { data: null, error: null }
      return plan.orderInsertError
        ? { data: null, error: plan.orderInsertError }
        : { data: { id: ORDER_ID }, error: null }
    })
    builder.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(resolveAwaited(table)).then(onFulfilled, onRejected)
    return builder
  }

  const rpc = vi.fn(async (name: string, args: unknown) => {
    if (name === 'exp_reserve_order_inventory') {
      plan.reserveCalls.push((args as { p_order_id: string }).p_order_id)
      return { data: plan.reserveResult, error: plan.reserveError }
    }
    if (name === 'exp_try_redeem_promo_code' || name === 'exp_try_redeem_bundle_deal') {
      plan.claimCalls.push({ name, id: (args as { p_id: string }).p_id })
      // `claimResults` lets a test make the Nth claim succeed and a later one fail.
      const result = plan.claimResults[plan.claimCalls.length - 1] ?? plan.claimResult
      return { data: result, error: plan.claimError }
    }
    if (name === 'exp_release_promo_code' || name === 'exp_release_bundle_deal') {
      plan.releaseCalls.push({ name, id: (args as { p_id: string }).p_id })
      return { data: null, error: null }
    }
    return { data: null, error: null }
  })

  return { from: vi.fn(from), rpc }
}

function makeRequest(): Request {
  return new Request('http://localhost:3000/api/square/checkout', { method: 'POST' })
}

beforeEach(() => {
  vi.clearAllMocks()
  plan.product = PRODUCT
  plan.existingOrder = null
  plan.orderInsertError = null
  plan.orderItemsInsertError = null
  plan.linkUpdateError = null
  plan.orderUpdates = []
  plan.orderInserts = []
  plan.orderItemRows = []
  plan.products = []
  plan.inventory = []
  plan.reserveResult = { ok: true, reason: 'reserved' }
  plan.reserveError = null
  plan.reserveCalls = []
  plan.claimResult = true
  plan.claimError = null
  plan.claimResults = []
  plan.claimCalls = []
  plan.releaseCalls = []
  plan.orderItemDeletes = []

  state.body = {
    items: [{ productId: 'prod-1', quantity: 1, selectedOptions: [] }],
    buyerEmail: 'buyer@example.com',
    shippingAddress: {
      street1: '1 Main St',
      city: 'Springfield',
      state: 'IL',
      zip: '62701',
      country: 'US',
    },
    shippingRate: { carrier: 'USPS', serviceName: 'Priority', amount: 5 },
    checkoutAttemptId: ATTEMPT_ID,
  }

  process.env.SQUARE_ACCESS_TOKEN = 'test-token'
  process.env.SQUARE_LOCATION_ID = 'test-location'

  mocks.getSupabaseAdmin.mockImplementation(() => makeSupabase())
  mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 9 })
  mocks.computeCanonicalLine.mockReturnValue(CANONICAL)
  mocks.verifyShippingRate.mockResolvedValue({
    amount: 5,
    carrier: 'USPS',
    serviceName: 'Priority',
  })
  mocks.createSquareCheckout.mockResolvedValue({
    payment_link: {
      id: LINK_ID,
      url: LINK_URL,
      order_id: 'square-order-1',
      created_at: '2026-10-08T00:00:00Z',
    },
  })
  mocks.deleteSquarePaymentLink.mockResolvedValue(undefined)
  mocks.validatePromoCode.mockReturnValue({ ok: false, reason: 'Code was not found.' })
  mocks.resolveEligibleDeals.mockReturnValue({ ok: false, reason: 'Code was not found.' })
  mocks.applyPromotions.mockReturnValue({
    lineDiscounts: [0],
    promoDiscount: 0,
    dealDiscount: 0,
    shippingDiscount: 0,
    appliedDeals: [],
    appliedPromo: null,
  })
})

afterEach(() => {
  delete process.env.SQUARE_ACCESS_TOKEN
  delete process.env.SQUARE_LOCATION_ID
})

describe('POST /api/square/checkout (OCT #2)', () => {
  it('writes the order before creating the Square link, then attaches the link', async () => {
    const response = await POST(makeRequest())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.checkoutUrl).toBe(LINK_URL)
    expect(payload.checkoutId).toBe(LINK_ID)
    expect(mocks.createSquareCheckout).toHaveBeenCalledTimes(1)

    // The link is attached to the order in a follow-up update.
    const attach = plan.orderUpdates.find((update) => 'square_payment_link_url' in update)
    expect(attach).toMatchObject({
      square_order_id: 'square-order-1',
      square_payment_link_id: LINK_ID,
      square_payment_link_url: LINK_URL,
    })
    expect(mocks.deleteSquarePaymentLink).not.toHaveBeenCalled()
  })

  it('sends the buyer back to their own order after paying', async () => {
    const response = await POST(makeRequest())
    expect(response.status).toBe(200)

    // OCT #13: the Square redirect carries the order id and the guest token, so
    // the success page can load the order instead of showing a bare "thanks".
    const call = mocks.createSquareCheckout.mock.calls[0][0] as { redirectUrl?: string }
    expect(call.redirectUrl).toContain('/checkout/success?order=')
    expect(call.redirectUrl).toContain('access=')
  })

  it('is idempotent: a repeated checkoutAttemptId returns the stored link', async () => {
    plan.existingOrder = {
      id: ORDER_ID,
      guest_tracking_token: 'stored-token',
      square_payment_link_id: LINK_ID,
      square_payment_link_url: LINK_URL,
    }

    const response = await POST(makeRequest())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.checkoutUrl).toBe(LINK_URL)
    expect(payload.guestTrackingToken).toBe('stored-token')
    expect(mocks.createSquareCheckout).not.toHaveBeenCalled()
  })

  it('reuses the half-finished order row instead of inserting a duplicate', async () => {
    // The first attempt wrote the row and then failed before a link existed
    // (items, stock, promo or Square), so the row holds the attempt id but no
    // link. Inserting again would violate exp_orders_checkout_attempt_uidx
    // (23505) and 500 on every retry, so the row is reused.
    plan.existingOrder = {
      id: ORDER_ID,
      guest_tracking_token: 'stored-token',
      claimed_at: null,
      square_payment_link_id: null,
      square_payment_link_url: null,
    }

    const response = await POST(makeRequest())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.checkoutUrl).toBe(LINK_URL)
    expect(payload.guestTrackingToken).toBe('stored-token')
    // No second order row, and the attempt id is left untouched on the update.
    expect(plan.orderInserts).toEqual([])
    const reuse = plan.orderUpdates.find((update) => 'cart_snapshot' in update)
    expect(reuse).toMatchObject({
      status: 'awaiting_payment',
      guest_tracking_token: 'stored-token',
    })
    expect(reuse).not.toHaveProperty('checkout_attempt_id')
    // Stale items from the failed attempt are cleared before re-inserting.
    expect(plan.orderItemDeletes).toEqual([{ column: 'order_id', value: ORDER_ID }])
    expect(plan.orderItemRows).toHaveLength(1)
    expect(mocks.createSquareCheckout).toHaveBeenCalledTimes(1)
  })

  it('does not re-claim promo/deal usage for a reused order that already claimed it', async () => {
    plan.existingOrder = {
      id: ORDER_ID,
      guest_tracking_token: 'stored-token',
      claimed_at: '2026-10-10T00:00:00.000Z',
      square_payment_link_id: null,
      square_payment_link_url: null,
    }
    mocks.resolveEligibleDeals.mockReturnValue({
      ok: true,
      deals: [{ id: 'deal-auto', name: 'Free shipping', trigger_type: 'automatic' }],
    })

    const response = await POST(makeRequest())

    expect(response.status).toBe(200)
    expect(plan.claimCalls).toEqual([])
    expect(plan.orderUpdates.some((update) => 'claimed_at' in update)).toBe(false)
  })

  it('claims once and records claimed_at on a first attempt', async () => {
    mocks.resolveEligibleDeals.mockReturnValue({
      ok: true,
      deals: [{ id: 'deal-auto', name: 'Free shipping', trigger_type: 'automatic' }],
    })

    const response = await POST(makeRequest())

    expect(response.status).toBe(200)
    expect(plan.claimCalls).toEqual([{ name: 'exp_try_redeem_bundle_deal', id: 'deal-auto' }])
    expect(plan.orderUpdates.some((update) => 'claimed_at' in update)).toBe(true)
  })

  it('fails with 500 and never calls Square when the order insert fails', async () => {
    plan.orderInsertError = { code: '23514', message: 'check constraint violated' }

    const response = await POST(makeRequest())

    expect(response.status).toBe(500)
    expect(mocks.createSquareCheckout).not.toHaveBeenCalled()
  })

  it('cancels the order and returns 502 when Square is unreachable', async () => {
    mocks.createSquareCheckout.mockRejectedValue(new Error('square down'))

    const response = await POST(makeRequest())

    expect(response.status).toBe(502)
    expect(plan.orderUpdates.some((update) => update.status === 'cancelled')).toBe(true)
    expect(mocks.deleteSquarePaymentLink).not.toHaveBeenCalled()
  })

  it('deletes the link and cancels the order when the link cannot be attached', async () => {
    plan.linkUpdateError = { code: '23505', message: 'duplicate key' }

    const response = await POST(makeRequest())

    expect(response.status).toBe(500)
    expect(mocks.deleteSquarePaymentLink).toHaveBeenCalledWith(LINK_ID)
    expect(plan.orderUpdates.some((update) => update.status === 'cancelled')).toBe(true)
  })

  it('rejects an incomplete shipping address before touching the database', async () => {
    state.body = { items: [{ productId: 'prod-1', quantity: 1 }] }

    const response = await POST(makeRequest())

    expect(response.status).toBe(400)
    expect(mocks.createSquareCheckout).not.toHaveBeenCalled()
  })

  // ── OCT #20: rate limit, item cap, address/email validation ────────────────
  it('returns 429 when rate limited', async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfter: 300 })

    const response = await POST(makeRequest())

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('300')
    expect(mocks.createSquareCheckout).not.toHaveBeenCalled()
  })

  it('rejects a cart above the 50-item cap', async () => {
    state.body = {
      ...(state.body as Record<string, unknown>),
      items: Array.from({ length: 51 }, () => ({ productId: 'prod-1', quantity: 1 })),
    }

    const response = await POST(makeRequest())

    expect(response.status).toBe(400)
    expect(mocks.createSquareCheckout).not.toHaveBeenCalled()
  })

  it('rejects an invalid email', async () => {
    state.body = { ...(state.body as Record<string, unknown>), buyerEmail: 'not-an-email' }

    const response = await POST(makeRequest())

    expect(response.status).toBe(400)
    expect(mocks.createSquareCheckout).not.toHaveBeenCalled()
  })

  it('stores only whitelisted address fields', async () => {
    state.body = {
      ...(state.body as Record<string, unknown>),
      shippingAddress: {
        street1: '1 Main St',
        city: 'Springfield',
        state: 'IL',
        zip: '62701',
        country: 'US',
        foo: 'bar',
      },
    }

    const response = await POST(makeRequest())
    expect(response.status).toBe(200)

    expect(plan.orderInserts[0]?.shipping_address).toEqual({
      street1: '1 Main St',
      city: 'Springfield',
      state: 'IL',
      zip: '62701',
      country: 'US',
    })
  })

  it('rejects an unsupported country', async () => {
    state.body = {
      ...(state.body as Record<string, unknown>),
      shippingAddress: {
        street1: '1 Main St',
        city: 'London',
        state: 'Greater London',
        zip: 'SW1A 1AA',
        country: 'GB',
      },
    }

    const response = await POST(makeRequest())

    expect(response.status).toBe(400)
    expect(mocks.createSquareCheckout).not.toHaveBeenCalled()
  })

  it('rate-limits, caps the body and caps the item count (source contract)', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/api/square/checkout/route.ts'), 'utf-8')
    expect(source).toContain('rateLimit(')
    expect(source).toContain('MAX_CHECKOUT_BYTES')
    expect(source).toContain('MAX_CHECKOUT_ITEMS')
  })

  // ── OCT #12: inventory is checked and reserved before any Square link ───────
  const IN_STOCK_ROW = {
    product_id: 'prod-1',
    available_qty: 5,
    low_stock_threshold: 1,
    availability_override: 'inherit',
    is_track_inventory: true,
  }

  function makeReadyMade(inventory: Array<Record<string, unknown>>) {
    plan.products = [{ id: 'prod-1', is_ready_made: true }]
    plan.inventory = inventory
  }

  it('rejects a force_out_of_stock item with 409 and no Square call', async () => {
    makeReadyMade([{ ...IN_STOCK_ROW, availability_override: 'force_out_of_stock' }])

    const response = await POST(makeRequest())

    expect(response.status).toBe(409)
    expect(mocks.createSquareCheckout).not.toHaveBeenCalled()
  })

  it('rejects a quantity above what is available with 409', async () => {
    makeReadyMade([{ ...IN_STOCK_ROW, available_qty: 1 }])
    state.body = {
      ...(state.body as Record<string, unknown>),
      items: [{ productId: 'prod-1', quantity: 2, selectedOptions: [] }],
    }

    const response = await POST(makeRequest())
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.available).toBe(1)
    expect(mocks.createSquareCheckout).not.toHaveBeenCalled()
  })

  it('rejects a ready-made item with no inventory row with 409', async () => {
    makeReadyMade([])

    const response = await POST(makeRequest())

    expect(response.status).toBe(409)
    expect(mocks.createSquareCheckout).not.toHaveBeenCalled()
  })

  it('cancels the order and returns 409 when the reserve RPC reports short', async () => {
    plan.reserveResult = {
      ok: false,
      reason: 'insufficient_stock',
      product_id: 'prod-1',
      available_qty: 0,
    }

    const response = await POST(makeRequest())

    expect(response.status).toBe(409)
    expect(mocks.createSquareCheckout).not.toHaveBeenCalled()
    expect(plan.orderUpdates.some((update) => update.status === 'cancelled')).toBe(true)
  })

  it('fails with 500 and cancels the order when the reserve RPC errors', async () => {
    plan.reserveError = { code: '57014', message: 'statement timeout' }

    const response = await POST(makeRequest())

    expect(response.status).toBe(500)
    expect(mocks.createSquareCheckout).not.toHaveBeenCalled()
    expect(plan.orderUpdates.some((update) => update.status === 'cancelled')).toBe(true)
  })

  it('reserves exactly once on the happy path', async () => {
    makeReadyMade([IN_STOCK_ROW])

    const response = await POST(makeRequest())

    expect(response.status).toBe(200)
    expect(plan.reserveCalls).toEqual([ORDER_ID])
  })

  // ── OCT #19: automatic deals apply; claims are atomic and happen pre-link ───
  const AUTO_DEAL = { id: 'deal-auto', name: 'Free shipping', trigger_type: 'automatic' }

  it('applies an automatic deal even with no code entered', async () => {
    mocks.resolveEligibleDeals.mockReturnValue({ ok: true, deals: [AUTO_DEAL] })

    const response = await POST(makeRequest())

    expect(response.status).toBe(200)
    // Deal resolution is reached with a null code, and the deal is recorded.
    expect(mocks.resolveEligibleDeals).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      null,
      expect.anything(),
    )
    expect(plan.orderInserts[0]?.bundle_deal_ids).toEqual(['deal-auto'])
    expect(plan.claimCalls).toEqual([{ name: 'exp_try_redeem_bundle_deal', id: 'deal-auto' }])
  })

  it('returns 422 for a code that resolves to nothing', async () => {
    state.body = { ...(state.body as Record<string, unknown>), discountCode: 'NOPE' }

    const response = await POST(makeRequest())
    const payload = await response.json()

    expect(response.status).toBe(422)
    expect(payload.code).toBe('promo_invalid')
    expect(mocks.createSquareCheckout).not.toHaveBeenCalled()
  })

  it('returns 422 and never calls Square when a claim is refused', async () => {
    mocks.resolveEligibleDeals.mockReturnValue({ ok: true, deals: [AUTO_DEAL] })
    plan.claimResult = false

    const response = await POST(makeRequest())

    expect(response.status).toBe(422)
    expect(mocks.createSquareCheckout).not.toHaveBeenCalled()
    expect(plan.orderUpdates.some((update) => update.status === 'cancelled')).toBe(true)
  })

  it('releases an already-taken claim when a later claim fails', async () => {
    mocks.validatePromoCode.mockReturnValue({
      ok: true,
      promo: { id: 'promo-1', code: 'SAVE10', discount_type: 'percent', discount_value: 10 },
    })
    mocks.resolveEligibleDeals.mockReturnValue({ ok: true, deals: [AUTO_DEAL] })
    state.body = { ...(state.body as Record<string, unknown>), discountCode: 'SAVE10' }
    // The promo claim succeeds; the deal claim is refused.
    plan.claimResults = [true, false]

    const response = await POST(makeRequest())

    expect(response.status).toBe(422)
    expect(plan.releaseCalls).toEqual([{ name: 'exp_release_promo_code', id: 'promo-1' }])
    expect(mocks.createSquareCheckout).not.toHaveBeenCalled()
  })

  it('no longer uses the unconditional usage increment (source contract)', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/api/square/checkout/route.ts'), 'utf-8')
    expect(source).not.toContain('exp_increment_promo_code_usage')
    expect(source).not.toContain('exp_increment_bundle_deal_usage')
    expect(source).toContain('exp_try_redeem_promo_code')
  })

  // ── OCT #5: pricing integrity ──────────────────────────────────────────────
  it('rejects a non-integer quantity with 400 and no Square call', async () => {
    state.body = {
      ...(state.body as Record<string, unknown>),
      items: [{ productId: 'prod-1', quantity: 1.5, selectedOptions: [] }],
    }

    const response = await POST(makeRequest())

    expect(response.status).toBe(400)
    expect(mocks.createSquareCheckout).not.toHaveBeenCalled()
  })

  it('rejects a line the engine refuses to price (tampered option) with 400', async () => {
    mocks.computeCanonicalLine.mockReturnValue(null)

    const response = await POST(makeRequest())

    expect(response.status).toBe(400)
    expect(mocks.createSquareCheckout).not.toHaveBeenCalled()
  })

  it('persists the priced process keys on the order item', async () => {
    mocks.computeCanonicalLine.mockReturnValue({ ...CANONICAL, selectedProcessKeys: ['uv_print'] })

    const response = await POST(makeRequest())

    expect(response.status).toBe(200)
    expect(plan.orderItemRows[0]?.selected_process_keys).toEqual(['uv_print'])
  })

  it('returns the authoritative total in cents', async () => {
    const response = await POST(makeRequest())
    const payload = await response.json()

    // 2500 for the product line + 500 for shipping.
    expect(payload.chargedTotalCents).toBe(3000)
  })

  it('prices and persists the NFC add-on', async () => {
    mocks.computeCanonicalLine.mockReturnValue({ ...CANONICAL, nfcEnabled: true })
    state.body = {
      ...(state.body as Record<string, unknown>),
      items: [
        {
          productId: 'prod-1',
          quantity: 1,
          selectedOptions: [],
          nfc: { enabled: true, targetData: 'https://example.test', leaveUnlocked: true },
        },
      ],
    }

    const response = await POST(makeRequest())

    expect(response.status).toBe(200)
    expect(mocks.computeCanonicalLine).toHaveBeenCalledWith(
      expect.anything(),
      1,
      null,
      [],
      [],
      { enabled: true },
    )
    expect(plan.orderItemRows[0]?.nfc).toEqual({
      targetData: 'https://example.test',
      leaveUnlocked: true,
    })
  })
})
