import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { requireCsrfOriginOnly } from '@/lib/security/csrf'

// ---------------------------------------------------------------------------
// POST /api/cart/capture
//
// Saves a customer's cart + email to exp_cart_captures so a recovery email
// can be sent if they abandon before (or during) checkout.
//
// Called client-side once the customer types a valid email in the checkout
// form — before the Stripe session is created.
//
// Rate-limit note: one capture per email per 30 minutes to avoid spam.
// ---------------------------------------------------------------------------

interface CartCaptureBody {
  email?: unknown
  cartItems?: unknown
}

interface CartItemInput {
  productId?: unknown
  title?: unknown
  quantity?: unknown
  lineTotal?: unknown
  variantLabel?: unknown
}

function asString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function normalizeCartItem(raw: unknown): CartItemInput | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const productId = asString(row.productId, 128)
  const title = asString(row.title, 256)
  if (!productId || !title) return null
  const quantity = Math.max(1, Math.min(999, Number.isFinite(Number(row.quantity)) ? Number(row.quantity) : 1))
  const lineTotal = Number.isFinite(Number(row.lineTotal)) ? Number(row.lineTotal) : 0
  const variantLabel = asString(row.variantLabel ?? '', 128) || null
  return { productId, title, quantity, lineTotal, variantLabel }
}

export async function POST(request: Request) {
  const csrfResponse = requireCsrfOriginOnly(request)
  if (csrfResponse) return csrfResponse

  // SEC-015: Rate limit cart-capture — 10 requests/hour per IP
  const ip = getClientIp(request)
  const rl = await rateLimit(`cart-capture:${ip}`, 10, 60 * 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter ?? 3600)

  let body: CartCaptureBody

  try {
    body = (await request.json()) as CartCaptureBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const email = asString(body.email, 254)
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 })
  }

  const rawItems: unknown[] = Array.isArray(body.cartItems) ? body.cartItems : []
  const cartItems = rawItems.flatMap((raw) => {
    const item = normalizeCartItem(raw)
    return item ? [item] : []
  })

  if (cartItems.length === 0) {
    return NextResponse.json({ error: 'Cart is empty.' }, { status: 400 })
  }

  // Soft rate-limit: skip if a capture for this email already exists within the last 30 minutes
  const supabase = getSupabaseAdmin()
  const throttleWindow = new Date(Date.now() - 30 * 60 * 1000).toISOString()

  const { data: existing } = await supabase
    .from('exp_cart_captures')
    .select('id, created_at')
    .eq('email', email.toLowerCase())
    .gt('created_at', throttleWindow)
    .limit(1)
    .maybeSingle()

  if (existing) {
    // Update the existing capture with the latest cart state
    await supabase
      .from('exp_cart_captures')
      .update({ cart_json: cartItems, updated_at: new Date().toISOString() })
      .eq('id', existing.id)

    return NextResponse.json({ captured: true, updated: true }, { status: 200 })
  }

  // SEC-047: Hash the IP for rate-limit audit only — never store raw IP.
  // Use getClientIp() which only trusts x-forwarded-for on Vercel (where the
  // edge overwrites it). Outside Vercel, returns 'unknown' to prevent spoofing.
  const ipHash = ip !== 'unknown'
    ? createHash('sha256').update(ip).digest('hex')
    : null

  const { error: insertError } = await supabase
    .from('exp_cart_captures')
    .insert({
      email: email.toLowerCase(),
      cart_json: cartItems,
      ip_hash: ipHash,
    })

  if (insertError) {
    console.error('[cart:capture]', insertError.message)
    return NextResponse.json({ error: 'Failed to capture cart.' }, { status: 500 })
  }

  return NextResponse.json({ captured: true }, { status: 200 })
}
