import { getEmailSenderAddress, getResend } from '@/lib/resend/client'
import { getSupabaseAdmin } from '@/lib/supabase/client'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function sendAbandonedRequestEmail(input: {
  customerEmail: string
  requestId: string
  itemType: string
  createdAt: string
  accessToken: string | null
}) {
  if (!process.env.RESEND_API_KEY) return false

  const base = process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || 'http://localhost:3000'
  const statusUrl = input.accessToken
    ? `${base.replace(/\/$/, '')}/custom-orders/${input.requestId}?access=${encodeURIComponent(input.accessToken)}`
    : `${base.replace(/\/$/, '')}/custom-orders`

  const resend = getResend()
  const fromAddress = await getEmailSenderAddress()

  const { error } = await resend.emails.send({
    from: fromAddress,
    to: [input.customerEmail],
    subject: `Still interested in your custom request? (${input.requestId.slice(0, 8)})`,
    html: `
      <h2>Your custom request is still waiting</h2>
      <p>We noticed your request is still in the queue and wanted to make sure you still want to move forward.</p>
      <p><strong>Request ID:</strong> ${escapeHtml(input.requestId)}</p>
      <p><strong>Item type:</strong> ${escapeHtml(input.itemType)}</p>
      <p><strong>Submitted:</strong> ${escapeHtml(new Date(input.createdAt).toLocaleString())}</p>
      <p><a href="${statusUrl}">Resume your request status page</a></p>
      <p style="margin-top:20px;font-size:12px;color:#666">If you no longer want this request, you can ignore this message.</p>
    `,
  })

  if (error) {
    console.error('[custom-request-recovery:email]', error)
    return false
  }

  return true
}

export async function processAbandonedCustomRequests(options?: {
  thresholdHours?: number
  limit?: number
}): Promise<{ scanned: number; sent: number; skipped: number; failed: number }> {
  const thresholdHours = Math.max(1, Math.min(options?.thresholdHours ?? 24, 24 * 14))
  const limit = Math.max(1, Math.min(options?.limit ?? 100, 500))
  const cutoff = new Date(Date.now() - thresholdHours * 60 * 60 * 1000).toISOString()

  const supabase = getSupabaseAdmin()

  const { data: rows, error } = await supabase
    .from('exp_custom_requests')
    .select('id, customer_email, item_type, created_at, customer_access_token, recovery_reminder_sent_at')
    .eq('status', 'awaiting_quote')
    .is('recovery_reminder_sent_at', null)
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('[custom-request-recovery:query]', error.message)
    return { scanned: 0, sent: 0, skipped: 0, failed: 1 }
  }

  const candidates = rows ?? []
  if (candidates.length === 0) return { scanned: 0, sent: 0, skipped: 0, failed: 0 }

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const row of candidates) {
    const email = typeof row.customer_email === 'string' ? row.customer_email.trim().toLowerCase() : ''
    const itemType = typeof row.item_type === 'string' ? row.item_type : 'Custom request'

    if (!email || !email.includes('@')) {
      skipped += 1
      continue
    }

    try {
      const emailSent = await sendAbandonedRequestEmail({
        customerEmail: email,
        requestId: row.id,
        itemType,
        createdAt: row.created_at,
        accessToken: typeof row.customer_access_token === 'string' ? row.customer_access_token : null,
      })

      if (!emailSent) {
        failed += 1
        continue
      }

      const now = new Date().toISOString()
      const { error: updateError } = await supabase
        .from('exp_custom_requests')
        .update({ recovery_reminder_sent_at: now, updated_at: now })
        .eq('id', row.id)

      if (updateError) {
        console.error('[custom-request-recovery:update]', updateError.message)
        failed += 1
        continue
      }

      sent += 1
    } catch (processError) {
      console.error('[custom-request-recovery:process]', processError)
      failed += 1
    }
  }

  return { scanned: candidates.length, sent, skipped, failed }
}
