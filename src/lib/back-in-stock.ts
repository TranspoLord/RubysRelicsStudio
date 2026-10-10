import { createHmac, timingSafeEqual } from 'node:crypto'

import { evaluateInventoryState, type InventoryAvailabilityOverride } from '@/lib/inventory/state'
import { sendEmail } from '@/lib/resend/send'
import { getSupabaseAdmin } from '@/lib/supabase/client'

interface BackInStockAlertRow {
  id: string
  product_id: string
  email: string
  status: 'active' | 'notified' | 'unsubscribed'
  /** OCT #14: failed send attempts, surfaced instead of failing silently. */
  send_attempts?: number | null
}

interface ProductRow {
  id: string
  title: string
  slug: string
  category_key: string
  is_active: boolean
  is_archived: boolean
}

interface InventoryRow {
  product_id: string
  available_qty: number
  low_stock_threshold: number
  availability_override: InventoryAvailabilityOverride
  is_track_inventory: boolean
}

function getUnsubscribeSecret(): string {
  const secret = process.env.BACK_IN_STOCK_UNSUBSCRIBE_SECRET
  if (!secret || secret.trim().length < 32) {
    throw new Error('BACK_IN_STOCK_UNSUBSCRIBE_SECRET must be set to a strong value (32+ chars).')
  }
  return secret
}

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function fromBase64Url(value: string): string | null {
  try {
    return Buffer.from(value, 'base64url').toString('utf8')
  } catch {
    return null
  }
}

export function createBackInStockUnsubscribeToken(productId: string, email: string): string {
  const payload = `${productId}:${email.toLowerCase()}`
  const encoded = toBase64Url(payload)
  const signature = createHmac('sha256', getUnsubscribeSecret()).update(encoded).digest('base64url')
  return `${encoded}.${signature}`
}

export function verifyBackInStockUnsubscribeToken(
  token: string
): { productId: string; email: string } | null {
  const [encoded, providedSig] = token.split('.')
  if (!encoded || !providedSig) return null

  const expectedSig = createHmac('sha256', getUnsubscribeSecret()).update(encoded).digest('base64url')
  if (providedSig.length !== expectedSig.length) return null

  const isValid = timingSafeEqual(Buffer.from(providedSig), Buffer.from(expectedSig))
  if (!isValid) return null

  const decoded = fromBase64Url(encoded)
  if (!decoded) return null

  const [productId, email] = decoded.split(':')
  if (!productId || !email) return null

  return { productId, email: email.toLowerCase() }
}

function buildUnsubscribeUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || 'http://localhost:3000'
  return `${base.replace(/\/$/, '')}/api/back-in-stock/unsubscribe?token=${encodeURIComponent(token)}`
}

async function sendBackInStockEmail(input: {
  email: string
  productTitle: string
  token: string
  productUrl: string
  availableQty: number
}) {
  const unsubscribeUrl = buildUnsubscribeUrl(input.token)
  const availabilityHint =
    input.availableQty > 0
      ? `${input.availableQty} unit${input.availableQty === 1 ? '' : 's'} just restocked.`
      : 'Inventory has been refreshed.'

  // OCT #14: return the typed result so the caller only marks the alert
  // `notified` when the email actually went out. The key comes from the alert's
  // own token, so a retry (or a second processor run) is a no-op.
  return sendEmail({
    to: input.email,
    subject: `${input.productTitle} is back in stock`,
    idempotencyKey: `back-in-stock:${input.token}`,
    html: `
      <h2>Good news - it's back in stock</h2>
      <p><strong>${input.productTitle}</strong> is available again.</p>
      <p>${availabilityHint}</p>
      <p><a href="${input.productUrl}">View product</a></p>
      <p style="margin-top:20px;font-size:12px;color:#666;">
        No longer interested?
        <a href="${unsubscribeUrl}">Unsubscribe from this product alert</a>
      </p>
    `,
  })
}

function buildProductUrl(productSlug: string, categorySlug: string | null): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || 'http://localhost:3000'
  if (!categorySlug || !productSlug) {
    return `${base.replace(/\/$/, '')}/shop`
  }

  return `${base.replace(/\/$/, '')}/shop/categories/${encodeURIComponent(categorySlug)}/${encodeURIComponent(productSlug)}`
}

function isProductBackInStock(product: ProductRow | undefined, inventory: InventoryRow | undefined): boolean {
  if (!product || !product.is_active || product.is_archived) return false
  if (!inventory) return false

  return evaluateInventoryState({
    available_qty: Number(inventory.available_qty ?? 0),
    low_stock_threshold: Number(inventory.low_stock_threshold ?? 3),
    availability_override: (inventory.availability_override ?? 'inherit') as InventoryAvailabilityOverride,
    is_track_inventory: Boolean(inventory.is_track_inventory ?? false),
  }).isInStock
}

export async function processBackInStockAlerts(options?: {
  productIds?: string[]
  limit?: number
}): Promise<{ scanned: number; sent: number; skipped: number; failed: number }> {
  const supabase = getSupabaseAdmin()
  const limit = Math.max(1, Math.min(options?.limit ?? 100, 500))

  let alertQuery = supabase
    .from('exp_back_in_stock_alerts')
    .select('id, product_id, email, status, send_attempts')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (options?.productIds && options.productIds.length > 0) {
    alertQuery = alertQuery.in('product_id', options.productIds)
  }

  const { data: alerts, error: alertsError } = await alertQuery

  if (alertsError) {
    console.error('[back-in-stock:process:alerts]', alertsError.message)
    return { scanned: 0, sent: 0, skipped: 0, failed: 1 }
  }

  const activeAlerts = (alerts ?? []) as BackInStockAlertRow[]
  if (activeAlerts.length === 0) {
    return { scanned: 0, sent: 0, skipped: 0, failed: 0 }
  }

  const productIds = [...new Set(activeAlerts.map((row) => row.product_id))]

  const [productsResult, inventoryResult] = await Promise.all([
    supabase
      .from('exp_products')
      .select('id, title, slug, category_key, is_active, is_archived')
      .in('id', productIds),
    supabase
      .from('exp_product_inventory')
      .select('product_id, available_qty, low_stock_threshold, availability_override, is_track_inventory')
      .in('product_id', productIds),
  ])

  if (productsResult.error) {
    console.error('[back-in-stock:process:products]', productsResult.error.message)
    return { scanned: activeAlerts.length, sent: 0, skipped: activeAlerts.length, failed: 1 }
  }

  if (inventoryResult.error) {
    console.error('[back-in-stock:process:inventory]', inventoryResult.error.message)
    return { scanned: activeAlerts.length, sent: 0, skipped: activeAlerts.length, failed: 1 }
  }

  const categoryKeys = Array.from(
    new Set(
      (productsResult.data ?? [])
        .map((row) => (typeof row.category_key === 'string' && row.category_key.trim().length > 0 ? row.category_key : null))
        .filter((value): value is string => value !== null)
    )
  )

  let categorySlugByKey = new Map<string, string>()

  if (categoryKeys.length > 0) {
    const { data: taxonomyRows, error: taxonomyError } = await supabase
      .from('exp_taxonomy')
      .select('key, slug')
      .eq('type', 'category')
      .in('key', categoryKeys)

    if (taxonomyError) {
      console.error('[back-in-stock:process:taxonomy]', taxonomyError.message)
      return { scanned: activeAlerts.length, sent: 0, skipped: activeAlerts.length, failed: 1 }
    }

    categorySlugByKey = new Map<string, string>(
      (taxonomyRows ?? [])
        .filter((row) => typeof row.key === 'string' && typeof row.slug === 'string')
        .map((row) => [row.key as string, row.slug as string])
    )
  }

  const productsById = new Map<string, ProductRow>((productsResult.data ?? []).map((row) => [row.id, row as ProductRow]))
  const inventoryByProductId = new Map<string, InventoryRow>(
    (inventoryResult.data ?? []).map((row) => [row.product_id, row as InventoryRow])
  )

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const alert of activeAlerts) {
    const product = productsById.get(alert.product_id)
    const inventory = inventoryByProductId.get(alert.product_id)

    if (!isProductBackInStock(product, inventory)) {
      skipped += 1
      continue
    }

    // OCT #14: claim the alert before sending, so two concurrent processor runs
    // cannot both send it. A claim left behind by a crash is reclaimable after
    // 15 minutes.
    const claimCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { data: claimed } = await supabase
      .from('exp_back_in_stock_alerts')
      .update({ claimed_at: new Date().toISOString() })
      .eq('id', alert.id)
      .eq('status', 'active')
      .or(`claimed_at.is.null,claimed_at.lt.${claimCutoff}`)
      .select('id')
      .maybeSingle()

    if (!claimed) {
      skipped += 1
      continue
    }

    try {
      const token = createBackInStockUnsubscribeToken(alert.product_id, alert.email)
      const categorySlug = categorySlugByKey.get(product?.category_key ?? '') ?? null
      const sendResult = await sendBackInStockEmail({
        email: alert.email,
        productTitle: product?.title ?? 'Your product',
        token,
        productUrl: buildProductUrl(product?.slug ?? '', categorySlug),
        availableQty: Number(inventory?.available_qty ?? 0),
      })

      // OCT #14: a rejected send (Resend 429/5xx) used to still mark the alert
      // `notified`, so the subscriber never heard back and the alert was gone.
      // Leave it active so the next run retries.
      if (!sendResult.ok) {
        failed += 1
        console.error('[back-in-stock:process:send]', sendResult.error)
        // OCT #14: release the claim and record why, so the next run retries and a
        // permanently failing address becomes visible instead of silent.
        await supabase
          .from('exp_back_in_stock_alerts')
          .update({
            claimed_at: null,
            send_attempts: Number(alert.send_attempts ?? 0) + 1,
            last_send_error: sendResult.error,
            updated_at: new Date().toISOString(),
          })
          .eq('id', alert.id)
        continue
      }

      const now = new Date().toISOString()
      const { error: markError } = await supabase
        .from('exp_back_in_stock_alerts')
        .update({
          status: 'notified',
          notified_at: now,
          updated_at: now,
        })
        .eq('id', alert.id)

      if (markError) {
        failed += 1
        console.error('[back-in-stock:process:mark-notified]', markError.message)
        continue
      }

      sent += 1
    } catch (error) {
      failed += 1
      console.error('[back-in-stock:process:send]', error)
    }
  }

  return {
    scanned: activeAlerts.length,
    sent,
    skipped,
    failed,
  }
}

export async function unsubscribeBackInStockByToken(token: string): Promise<{ ok: boolean; error?: string }> {
  const decoded = verifyBackInStockUnsubscribeToken(token)
  if (!decoded) {
    return { ok: false, error: 'Invalid or expired unsubscribe token.' }
  }

  const supabase = getSupabaseAdmin()
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('exp_back_in_stock_alerts')
    .update({
      status: 'unsubscribed',
      unsubscribed_at: now,
      updated_at: now,
    })
    .eq('product_id', decoded.productId)
    .eq('email', decoded.email)

  if (error) {
    console.error('[back-in-stock:unsubscribe]', error.message)
    return { ok: false, error: 'Could not unsubscribe alert.' }
  }

  return { ok: true }
}
