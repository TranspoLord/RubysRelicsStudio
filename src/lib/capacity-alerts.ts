import { createHmac, timingSafeEqual } from 'node:crypto'

import { getEmailSenderAddress, getResend } from '@/lib/resend/client'
import { getSupabaseAdmin } from '@/lib/supabase/client'

interface CapacityAlertRow {
  id: string
  category_key: string
  email: string
}

function getSecret(): string {
  return process.env.CAPACITY_ALERT_UNSUBSCRIBE_SECRET || process.env.ADMIN_LOGIN_KEY || 'fallback-dev-secret'
}

function sign(encoded: string): string {
  return createHmac('sha256', getSecret()).update(encoded).digest('base64url')
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

export function createCapacityUnsubscribeToken(categoryKey: string, email: string): string {
  const encoded = toBase64Url(`${categoryKey}:${email.toLowerCase()}`)
  return `${encoded}.${sign(encoded)}`
}

export function verifyCapacityUnsubscribeToken(token: string): { categoryKey: string; email: string } | null {
  const [encoded, providedSig] = token.split('.')
  if (!encoded || !providedSig) return null

  const expectedSig = sign(encoded)
  if (expectedSig.length !== providedSig.length) return null
  if (!timingSafeEqual(Buffer.from(expectedSig), Buffer.from(providedSig))) return null

  const decoded = fromBase64Url(encoded)
  if (!decoded) return null

  const [categoryKey, email] = decoded.split(':')
  if (!categoryKey || !email) return null

  return { categoryKey, email: email.toLowerCase() }
}

function buildUnsubscribeUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || 'http://localhost:3000'
  return `${base.replace(/\/$/, '')}/api/capacity-alerts/unsubscribe?token=${encodeURIComponent(token)}`
}

function buildCategoryUrl(categorySlug: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || 'http://localhost:3000'
  return `${base.replace(/\/$/, '')}/shop/categories/${encodeURIComponent(categorySlug)}`
}

async function sendCapacityReopenedEmail(input: {
  email: string
  categoryName: string
  categorySlug: string
  token: string
}) {
  const resend = getResend()
  const fromAddress = await getEmailSenderAddress()

  await resend.emails.send({
    from: fromAddress,
    to: [input.email],
    subject: `Capacity reopened for ${input.categoryName}`,
    html: `
      <h2>Good news - queue capacity reopened</h2>
      <p><strong>${input.categoryName}</strong> is accepting new orders again.</p>
      <p><a href="${buildCategoryUrl(input.categorySlug)}">Browse category</a></p>
      <p style="margin-top:20px;font-size:12px;color:#666;">
        No longer interested?
        <a href="${buildUnsubscribeUrl(input.token)}">Unsubscribe from this category alert</a>
      </p>
    `,
  })
}

export async function processCapacityReopenedAlerts(options?: {
  categoryKeys?: string[]
  limit?: number
}): Promise<{ scanned: number; sent: number; skipped: number; failed: number }> {
  const limit = Math.max(1, Math.min(options?.limit ?? 100, 500))
  const supabase = getSupabaseAdmin()

  let query = supabase
    .from('exp_capacity_reopen_alerts')
    .select('id, category_key, email')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (options?.categoryKeys && options.categoryKeys.length > 0) {
    query = query.in('category_key', options.categoryKeys)
  }

  const { data: alerts, error: alertsError } = await query
  if (alertsError) {
    console.error('[capacity-alerts:query]', alertsError.message)
    return { scanned: 0, sent: 0, skipped: 0, failed: 1 }
  }

  const active = (alerts ?? []) as CapacityAlertRow[]
  if (active.length === 0) return { scanned: 0, sent: 0, skipped: 0, failed: 0 }

  const categoryKeys = Array.from(new Set(active.map((row) => row.category_key)))

  const { data: taxonomyRows, error: taxonomyError } = await supabase
    .from('exp_taxonomy')
    .select('key, slug, display_name')
    .eq('type', 'category')
    .in('key', categoryKeys)

  if (taxonomyError) {
    console.error('[capacity-alerts:taxonomy]', taxonomyError.message)
    return { scanned: active.length, sent: 0, skipped: active.length, failed: 1 }
  }

  const byKey = new Map(
    (taxonomyRows ?? [])
      .filter((row) => typeof row.key === 'string' && typeof row.slug === 'string')
      .map((row) => [row.key as string, { slug: row.slug as string, name: (row.display_name as string) || (row.key as string) }])
  )

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const alert of active) {
    const taxonomy = byKey.get(alert.category_key)
    if (!taxonomy) {
      skipped += 1
      continue
    }

    try {
      const token = createCapacityUnsubscribeToken(alert.category_key, alert.email)
      await sendCapacityReopenedEmail({
        email: alert.email,
        categoryName: taxonomy.name,
        categorySlug: taxonomy.slug,
        token,
      })

      const now = new Date().toISOString()
      const { error: updateError } = await supabase
        .from('exp_capacity_reopen_alerts')
        .update({ status: 'notified', notified_at: now, updated_at: now })
        .eq('id', alert.id)

      if (updateError) {
        failed += 1
        console.error('[capacity-alerts:update]', updateError.message)
        continue
      }

      sent += 1
    } catch (err) {
      failed += 1
      console.error('[capacity-alerts:send]', err)
    }
  }

  return { scanned: active.length, sent, skipped, failed }
}

export async function subscribeCapacityAlert(input: {
  categoryKey: string
  email: string
  source?: string
}): Promise<{ ok: boolean; error?: string }> {
  const categoryKey = input.categoryKey.trim()
  const email = input.email.trim().toLowerCase()

  if (!categoryKey) return { ok: false, error: 'Missing category key.' }
  if (!email.includes('@')) return { ok: false, error: 'Invalid email address.' }

  const supabase = getSupabaseAdmin()
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('exp_capacity_reopen_alerts')
    .upsert(
      {
        category_key: categoryKey,
        email,
        status: 'active',
        source: input.source ?? 'category_page',
        subscribed_at: now,
        notified_at: null,
        unsubscribed_at: null,
        updated_at: now,
      },
      { onConflict: 'category_key,email' }
    )

  if (error) {
    console.error('[capacity-alerts:subscribe]', error.message)
    return { ok: false, error: 'Could not save alert subscription.' }
  }

  return { ok: true }
}

export async function unsubscribeCapacityAlert(token: string): Promise<{ ok: boolean; error?: string }> {
  const decoded = verifyCapacityUnsubscribeToken(token)
  if (!decoded) return { ok: false, error: 'Invalid token.' }

  const supabase = getSupabaseAdmin()
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('exp_capacity_reopen_alerts')
    .update({ status: 'unsubscribed', unsubscribed_at: now, updated_at: now })
    .eq('category_key', decoded.categoryKey)
    .eq('email', decoded.email)

  if (error) {
    console.error('[capacity-alerts:unsubscribe]', error.message)
    return { ok: false, error: 'Could not unsubscribe alert.' }
  }

  return { ok: true }
}
