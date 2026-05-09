import { NextResponse } from 'next/server'
import { branch, getSupabaseAdmin } from '@/lib/supabase/client'
import { FROM_ADDRESS, getResend } from '@/lib/resend/client'
import { randomBytes } from 'node:crypto'

interface FileMeta {
  name?: unknown
  size?: unknown
  type?: unknown
}

interface CustomOrderBody {
  customerName?: unknown
  customerEmail?: unknown
  itemType?: unknown
  quantity?: unknown
  deadline?: unknown
  budgetRange?: unknown
  description?: unknown
  designHelpNeeded?: unknown
  files?: unknown
  ipRightsConfirmed?: unknown
  ageConfirmed?: unknown
  tosAccepted?: unknown
}

function asTrimmedString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

function asNullableString(value: unknown, maxLen: number): string | null {
  const normalized = asTrimmedString(value, maxLen)
  return normalized.length > 0 ? normalized : null
}

function asPositiveInt(value: unknown, fallback: number): number {
  const n = Number.parseInt(String(value), 10)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(n, 10000)
}

function asBoolean(value: unknown): boolean {
  return value === true
}

function parseFiles(value: unknown): Array<{ name: string; size: number; type: string }> {
  if (!Array.isArray(value)) return []

  return value
    .slice(0, 5)
    .map((file: FileMeta) => {
      const name = asTrimmedString(file?.name, 180)
      const size = Number.isFinite(Number(file?.size)) ? Math.max(0, Number(file?.size)) : 0
      const type = asTrimmedString(file?.type, 120)
      return { name, size, type }
    })
    .filter((file) => file.name.length > 0)
}

function createCustomerAccessToken(): string {
  return randomBytes(24).toString('base64url')
}

async function sendAdminNotificationEmail(input: {
  requestId: string
  customerName: string
  customerEmail: string
  itemType: string
  quantity: number
  description: string
}) {
  const notifyTo = process.env.CUSTOM_REQUEST_NOTIFY_EMAIL
  const resendKey = process.env.RESEND_API_KEY

  if (!notifyTo || !resendKey) return

  const resend = getResend()

  await resend.emails.send({
    from: FROM_ADDRESS,
    to: [notifyTo],
    subject: `New custom request: ${input.itemType} (${input.requestId.slice(0, 8)})`,
    html: `
      <h2>New Custom Request</h2>
      <p><strong>ID:</strong> ${input.requestId}</p>
      <p><strong>Name:</strong> ${input.customerName}</p>
      <p><strong>Email:</strong> ${input.customerEmail}</p>
      <p><strong>Item Type:</strong> ${input.itemType}</p>
      <p><strong>Quantity:</strong> ${input.quantity}</p>
      <p><strong>Description:</strong></p>
      <p>${input.description.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
    `,
  })
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CustomOrderBody

    const customerName = asTrimmedString(body.customerName, 120)
    const customerEmail = asTrimmedString(body.customerEmail, 180).toLowerCase()
    const itemType = asTrimmedString(body.itemType, 120)
    const quantity = asPositiveInt(body.quantity, 1)
    const deadline = asNullableString(body.deadline, 40)
    const budgetRange = asNullableString(body.budgetRange, 80)
    const description = asTrimmedString(body.description, 6000)
    const designHelpNeeded = asBoolean(body.designHelpNeeded)
    const ipRightsConfirmed = asBoolean(body.ipRightsConfirmed)
    const ageConfirmed = asBoolean(body.ageConfirmed)
    const tosAccepted = asBoolean(body.tosAccepted)
    const files = parseFiles(body.files)
    const customerAccessToken = createCustomerAccessToken()
    const customerAccessExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString()

    if (!customerName || !customerEmail || !itemType || !description) {
      return NextResponse.json(
        { error: 'Missing required fields. Please complete all required inputs.' },
        { status: 400 }
      )
    }

    if (!ipRightsConfirmed || !ageConfirmed || !tosAccepted) {
      return NextResponse.json(
        { error: 'Required confirmations must be accepted before submitting.' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('exp_custom_requests')
      .insert({
        status: 'awaiting_quote',
        customer_name: customerName,
        customer_email: customerEmail,
        item_type: itemType,
        quantity,
        deadline: deadline || null,
        budget_range: budgetRange || null,
        description,
        files,
        design_help_needed: designHelpNeeded,
        ip_rights_confirmed: ipRightsConfirmed,
        age_confirmed: ageConfirmed,
        tos_accepted: tosAccepted,
        customer_access_token: customerAccessToken,
        customer_access_expires_at: customerAccessExpiresAt,
        branch,
      })
      .select('id, status, created_at, customer_access_token, customer_access_expires_at')
      .single()

    if (error || !data) {
      console.error('[custom-orders:insert]', error?.message)
      return NextResponse.json(
        { error: 'Could not save request. Please try again.' },
        { status: 500 }
      )
    }

    try {
      await sendAdminNotificationEmail({
        requestId: data.id,
        customerName,
        customerEmail,
        itemType,
        quantity,
        description,
      })
    } catch (mailError) {
      console.error('[custom-orders:email]', mailError)
      // Email failure should not fail the request submission itself.
    }

    return NextResponse.json(
      {
        request: data,
        customerAccessToken: data.customer_access_token,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[custom-orders:post]', error)
    return NextResponse.json(
      { error: 'Invalid request payload.' },
      { status: 400 }
    )
  }
}
