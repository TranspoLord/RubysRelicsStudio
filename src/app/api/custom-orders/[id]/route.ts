import { NextResponse } from 'next/server'
import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { getEmailSenderAddress, getResend } from '@/lib/resend/client'

interface RequestContext {
  params: Promise<{ id: string }>
}

interface QuoteActionBody {
  action?: unknown
  quoteAmount?: unknown
  note?: unknown
  confirmAction?: unknown
  extendDays?: unknown
}

function asString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

function asMoney(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100) / 100
}

function asPositiveInt(value: unknown): number | null {
  const n = Number.parseInt(String(value), 10)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

const QUOTE_EXPIRY_DAYS = 7

async function sendQuoteEmail(input: {
  customerEmail: string
  itemType: string
  requestId: string
  quoteAmount: number
  paymentLinkUrl: string
  statusUrl: string
  note: string | null
}) {
  if (!process.env.RESEND_API_KEY) return

  const resend = getResend()
  const fromAddress = await getEmailSenderAddress()
  await resend.emails.send({
    from: fromAddress,
    to: [input.customerEmail],
    subject: `Your custom quote is ready (${input.requestId.slice(0, 8)})`,
    html: `
      <h2>Your Quote Is Ready</h2>
      <p><strong>Request ID:</strong> ${input.requestId}</p>
      <p><strong>Item type:</strong> ${input.itemType}</p>
      <p><strong>Quoted total:</strong> $${input.quoteAmount.toFixed(2)}</p>
      <p>
        <a href="${input.paymentLinkUrl}">Pay securely via Square</a>
      </p>
      <p>
        Track your request status: <a href="${input.statusUrl}">${input.statusUrl}</a>
      </p>
      ${input.note ? `<p><strong>Note from the studio:</strong> ${input.note}</p>` : ''}
    `,
  })
}

// Create a Square payment URL for custom quote
function createSquareQuotePaymentUrl(input: {
  requestId: string
  itemType: string
  quoteAmount: number
  origin: string
}) {
  const amountCents = Math.round(input.quoteAmount * 100)

  // Create a checkout URL using Square's Payment API (hosted checkout)
  const checkoutUrl = `${input.origin}/api/square/checkout`

  // Store quote details - Square will handle the payment
  // In production, you'd create a proper payment link via Square's API
  // For now, we'll just use the checkout page

  return {
    paymentLinkId: `quote_${input.requestId}`,
    paymentLinkUrl: `${checkoutUrl}?amount=${amountCents}&requestId=${input.requestId}&itemType=${encodeURIComponent(input.itemType)}`,
  }
}

export async function GET(request: Request, context: RequestContext) {
  try {
    const params = await context.params
    const requestId = asString(params.id, 64)
    const accessToken = asString(new URL(request.url).searchParams.get('access'), 200)

    if (!requestId || !accessToken) {
      return NextResponse.json({ error: 'Missing request access token.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('exp_custom_requests')
      .select('id, status, item_type, quantity, description, quote_amount, square_payment_link_url, admin_notes, created_at, updated_at, customer_access_expires_at, quote_expires_at')
      .eq('id', requestId)
      .eq('customer_access_token', accessToken)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Request status link is invalid.' }, { status: 404 })
    }

    if (data.customer_access_expires_at) {
      const expiresAt = new Date(data.customer_access_expires_at)
      if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
        return NextResponse.json({ error: 'Request status link has expired.' }, { status: 410 })
      }
    }

    if (data.status === 'quote_sent' && data.quote_expires_at) {
      const quoteExpiresAt = new Date(data.quote_expires_at)
      if (!Number.isNaN(quoteExpiresAt.getTime()) && quoteExpiresAt.getTime() < Date.now()) {
        await supabase
          .from('exp_custom_requests')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .eq('id', requestId)

        return NextResponse.json({ error: 'Quote has expired. Please contact support for a refreshed quote.' }, { status: 410 })
      }
    }

    return NextResponse.json({ request: data }, { status: 200 })
  } catch (error) {
    console.error('[custom-orders:id:get]', error)
    return NextResponse.json({ error: 'Could not load request status.' }, { status: 500 })
  }
}

export async function PATCH(request: Request, context: RequestContext) {
  try {
    const auth = await requireAdminApiSession(request, {
      key: 'admin-custom-request-write',
      maxRequests: 30,
      windowMs: 15 * 60 * 1000,
    })
    if (!auth.ok) {
      return auth.response
    }

    const params = await context.params
    const requestId = asString(params.id, 64)
    const body = (await request.json()) as QuoteActionBody
    const action = asString(body.action, 40)
    const confirmAction = asString(body.confirmAction, 40)

    if (!requestId || !action) {
      await writeAdminAuditLog({ action: 'custom_request.update', entityType: 'custom_request', entityId: requestId || null, route: `/api/custom-orders/${requestId || '[missing]'}`, request, status: 'failure', details: { reason: 'missing_request_or_action' } })
      return NextResponse.json({ error: 'Missing request id or action.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { data: requestRow, error: requestError } = await supabase
      .from('exp_custom_requests')
      .select('id, status, customer_email, item_type, customer_access_token, quote_amount, quote_expires_at, square_payment_link_url, quote_resend_count')
      .eq('id', requestId)
      .single()

    if (requestError || !requestRow) {
      await writeAdminAuditLog({ action: 'custom_request.update', entityType: 'custom_request', entityId: requestId, route: `/api/custom-orders/${requestId}`, request, status: 'failure', details: { reason: 'request_not_found' } })
      return NextResponse.json({ error: 'Custom request was not found.' }, { status: 404 })
    }

    if (action === 'send_quote') {
      const quoteAmount = asMoney(body.quoteAmount)
      const note = asString(body.note, 2000) || null

      if (!quoteAmount) {
        await writeAdminAuditLog({ action: 'custom_request.send_quote', entityType: 'custom_request', entityId: requestRow.id, route: `/api/custom-orders/${requestRow.id}`, request, status: 'failure', details: { reason: 'invalid_quote_amount' } })
        return NextResponse.json({ error: 'Quote amount must be greater than zero.' }, { status: 400 })
      }

      const origin = new URL(request.url).origin
      const paymentLink = createSquareQuotePaymentUrl({
        requestId: requestRow.id,
        itemType: requestRow.item_type,
        quoteAmount,
        origin,
      })

      const now = Date.now()
      const quoteExpiresAt = new Date(now + QUOTE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()

      const { data: updated, error: updateError } = await supabase
        .from('exp_custom_requests')
        .update({
          status: 'quote_sent',
          quote_amount: quoteAmount,
          square_payment_link_id: paymentLink.paymentLinkId,
          square_payment_link_url: paymentLink.paymentLinkUrl,
          quote_sent_at: new Date().toISOString(),
          quote_expires_at: quoteExpiresAt,
          quote_last_resent_at: null,
          quote_resend_count: 0,
          production_handoff_at: null,
          admin_notes: note,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestRow.id)
        .in('status', ['awaiting_quote', 'quote_sent'])
        .select('id, status, quote_amount, square_payment_link_url, updated_at')
        .single()

      if (updateError || !updated) {
        console.error('[custom-orders:id:send-quote:update]', updateError?.message)
        await writeAdminAuditLog({ action: 'custom_request.send_quote', entityType: 'custom_request', entityId: requestRow.id, route: `/api/custom-orders/${requestRow.id}`, request, status: 'failure', details: { reason: 'update_failed', message: updateError?.message ?? null } })
        return NextResponse.json({ error: 'Could not save quote details.' }, { status: 500 })
      }

      const statusUrl = requestRow.customer_access_token
        ? `${origin}/custom-orders/${requestRow.id}?access=${encodeURIComponent(requestRow.customer_access_token)}`
        : `${origin}/custom-orders`

      try {
        await sendQuoteEmail({
          customerEmail: requestRow.customer_email,
          itemType: requestRow.item_type,
          requestId: requestRow.id,
          quoteAmount,
          paymentLinkUrl: paymentLink.paymentLinkUrl,
          statusUrl,
          note,
        })
      } catch (mailError) {
        console.error('[custom-orders:id:send-quote:email]', mailError)
      }

      await writeAdminAuditLog({ action: 'custom_request.send_quote', entityType: 'custom_request', entityId: requestRow.id, route: `/api/custom-orders/${requestRow.id}`, request, status: 'success', details: { quoteAmount, status: 'quote_sent' } })

      return NextResponse.json({ request: updated }, { status: 200 })
    }

    if (action === 'resend_quote') {
      if (requestRow.status !== 'quote_sent' || !requestRow.square_payment_link_url) {
        return NextResponse.json({ error: 'Only quote_sent requests with a payment link can be resent.' }, { status: 400 })
      }

      if (!requestRow.quote_amount || Number(requestRow.quote_amount) <= 0) {
        return NextResponse.json({ error: 'Quote amount is missing for this request.' }, { status: 400 })
      }

      if (requestRow.quote_expires_at) {
        const expiresAt = new Date(requestRow.quote_expires_at)
        if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
          await supabase
            .from('exp_custom_requests')
            .update({ status: 'expired', updated_at: new Date().toISOString() })
            .eq('id', requestRow.id)
          return NextResponse.json({ error: 'Quote has already expired. Extend expiry before resending.' }, { status: 409 })
        }
      }

      const note = asString(body.note, 2000) || null
      const origin = new URL(request.url).origin
      const statusUrl = requestRow.customer_access_token
        ? `${origin}/custom-orders/${requestRow.id}?access=${encodeURIComponent(requestRow.customer_access_token)}`
        : `${origin}/custom-orders`

      try {
        await sendQuoteEmail({
          customerEmail: requestRow.customer_email,
          itemType: requestRow.item_type,
          requestId: requestRow.id,
          quoteAmount: Number(requestRow.quote_amount),
          paymentLinkUrl: requestRow.square_payment_link_url,
          statusUrl,
          note,
        })
      } catch (mailError) {
        console.error('[custom-orders:id:resend-quote:email]', mailError)
      }

      const { data: updated, error: updateError } = await supabase
        .from('exp_custom_requests')
        .update({
          quote_last_resent_at: new Date().toISOString(),
          quote_resend_count: Number(requestRow.quote_resend_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestRow.id)
        .select('id, status, quote_last_resent_at, quote_resend_count, updated_at')
        .single()

      if (updateError || !updated) {
        return NextResponse.json({ error: 'Could not record quote resend.' }, { status: 500 })
      }

      await writeAdminAuditLog({ action: 'custom_request.resend_quote', entityType: 'custom_request', entityId: requestRow.id, route: `/api/custom-orders/${requestRow.id}`, request, status: 'success', details: { resendCount: updated.quote_resend_count } })

      return NextResponse.json({ request: updated }, { status: 200 })
    }

    if (action === 'extend_quote_expiry') {
      if (requestRow.status !== 'quote_sent') {
        return NextResponse.json({ error: 'Only quote_sent requests can be extended.' }, { status: 400 })
      }

      const extendDays = asPositiveInt(body.extendDays)
      if (!extendDays || extendDays > 30) {
        return NextResponse.json({ error: 'Extend days must be between 1 and 30.' }, { status: 400 })
      }

      const currentExpiry = requestRow.quote_expires_at ? new Date(requestRow.quote_expires_at) : new Date()
      const base = Number.isNaN(currentExpiry.getTime()) || currentExpiry.getTime() < Date.now()
        ? new Date()
        : currentExpiry
      const nextExpiry = new Date(base.getTime() + extendDays * 24 * 60 * 60 * 1000).toISOString()

      const { data: updated, error: updateError } = await supabase
        .from('exp_custom_requests')
        .update({ quote_expires_at: nextExpiry, updated_at: new Date().toISOString() })
        .eq('id', requestRow.id)
        .select('id, status, quote_expires_at, updated_at')
        .single()

      if (updateError || !updated) {
        return NextResponse.json({ error: 'Could not extend quote expiry.' }, { status: 500 })
      }

      await writeAdminAuditLog({ action: 'custom_request.extend_quote_expiry', entityType: 'custom_request', entityId: requestRow.id, route: `/api/custom-orders/${requestRow.id}`, request, status: 'success', details: { extendDays, quote_expires_at: updated.quote_expires_at } })

      return NextResponse.json({ request: updated }, { status: 200 })
    }

    if (action === 'handoff_to_production') {
      if (requestRow.status !== 'paid') {
        return NextResponse.json({ error: 'Only paid custom requests can be handed off to production.' }, { status: 400 })
      }

      const note = asString(body.note, 2000) || null

      const { data: orderRow, error: orderError } = await supabase
        .from('exp_orders')
        .select('id, status, payment_status')
        .eq('custom_request_id', requestRow.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (orderError || !orderRow) {
        return NextResponse.json({ error: 'No linked paid order found for this request.' }, { status: 404 })
      }

      if (orderRow.payment_status !== 'paid') {
        return NextResponse.json({ error: 'Linked order is not paid yet.' }, { status: 400 })
      }

      const { error: orderUpdateError } = await supabase
        .from('exp_orders')
        .update({ status: 'in_production', updated_at: new Date().toISOString() })
        .eq('id', orderRow.id)

      if (orderUpdateError) {
        return NextResponse.json({ error: 'Could not hand off linked order to production.' }, { status: 500 })
      }

      const { data: updated, error: requestUpdateError } = await supabase
        .from('exp_custom_requests')
        .update({
          production_handoff_at: new Date().toISOString(),
          admin_notes: note,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestRow.id)
        .select('id, status, production_handoff_at, updated_at')
        .single()

      if (requestUpdateError || !updated) {
        return NextResponse.json({ error: 'Could not record production handoff.' }, { status: 500 })
      }

      await writeAdminAuditLog({ action: 'custom_request.handoff_to_production', entityType: 'custom_request', entityId: requestRow.id, route: `/api/custom-orders/${requestRow.id}`, request, status: 'success', details: { orderId: orderRow.id } })

      return NextResponse.json({ request: updated }, { status: 200 })
    }

    if (action === 'mark_rejected') {
      if (confirmAction !== 'mark_rejected') {
        await writeAdminAuditLog({ action: 'custom_request.reject', entityType: 'custom_request', entityId: requestRow.id, route: `/api/custom-orders/${requestRow.id}`, request, status: 'failure', details: { reason: 'missing_confirmation_contract' } })
        return NextResponse.json({ error: 'Missing destructive action confirmation.' }, { status: 400 })
      }

      const note = asString(body.note, 2000) || 'Request rejected by admin review.'

      const { data: updated, error: updateError } = await supabase
        .from('exp_custom_requests')
        .update({
          status: 'cancelled',
          admin_notes: note,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestRow.id)
        .select('id, status, admin_notes, updated_at')
        .single()

      if (updateError || !updated) {
        console.error('[custom-orders:id:mark-rejected:update]', updateError?.message)
        await writeAdminAuditLog({ action: 'custom_request.reject', entityType: 'custom_request', entityId: requestRow.id, route: `/api/custom-orders/${requestRow.id}`, request, status: 'failure', details: { reason: 'update_failed', message: updateError?.message ?? null } })
        return NextResponse.json({ error: 'Could not update request status.' }, { status: 500 })
      }

      await writeAdminAuditLog({ action: 'custom_request.reject', entityType: 'custom_request', entityId: requestRow.id, route: `/api/custom-orders/${requestRow.id}`, request, status: 'success', details: { status: 'cancelled' } })

      return NextResponse.json({ request: updated }, { status: 200 })
    }

    if (action === 'reopen_request') {
      if (requestRow.status !== 'cancelled') {
        return NextResponse.json({ error: 'Only cancelled requests can be reopened.' }, { status: 400 })
      }

      const note = asString(body.note, 2000) || null

      const { data: updated, error: updateError } = await supabase
        .from('exp_custom_requests')
        .update({
          status: 'awaiting_quote',
          admin_notes: note,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestRow.id)
        .select('id, status, admin_notes, updated_at')
        .single()

      if (updateError || !updated) {
        console.error('[custom-orders:id:reopen:update]', updateError?.message)
        await writeAdminAuditLog({ action: 'custom_request.reopen', entityType: 'custom_request', entityId: requestRow.id, route: `/api/custom-orders/${requestRow.id}`, request, status: 'failure', details: { reason: 'update_failed', message: updateError?.message ?? null } })
        return NextResponse.json({ error: 'Could not reopen request.' }, { status: 500 })
      }

      await writeAdminAuditLog({ action: 'custom_request.reopen', entityType: 'custom_request', entityId: requestRow.id, route: `/api/custom-orders/${requestRow.id}`, request, status: 'success', details: { status: 'awaiting_quote' } })

      return NextResponse.json({ request: updated }, { status: 200 })
    }

    await writeAdminAuditLog({ action: 'custom_request.update', entityType: 'custom_request', entityId: requestRow.id, route: `/api/custom-orders/${requestRow.id}`, request, status: 'failure', details: { reason: 'unsupported_action', action } })
    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 })
  } catch (error) {
    console.error('[custom-orders:id:patch]', error)
    const params = await context.params.catch(() => ({ id: '' }))
    await writeAdminAuditLog({ action: 'custom_request.update', entityType: 'custom_request', entityId: params.id || null, route: `/api/custom-orders/${params.id || '[unknown]'}`, request, status: 'failure', details: { reason: 'unexpected_error' } })
    return NextResponse.json({ error: 'Could not process admin action.' }, { status: 500 })
  }
}