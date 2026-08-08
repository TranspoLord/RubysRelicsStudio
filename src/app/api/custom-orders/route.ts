import { NextResponse } from 'next/server'
import { branch, getSupabaseAdmin } from '@/lib/supabase/client'
import { getEmailSenderAddress, getResend } from '@/lib/resend/client'
import { randomBytes } from 'node:crypto'
import { rateLimit, rateLimitResponse, getClientIp } from '@/lib/rate-limit'
import { requireCsrfOriginOnly } from '@/lib/security/csrf'
import {
  getCustomOrderIntakeSettings,
  getOperationalNotificationSettings,
} from '@/lib/storefront-settings'
import { safeHtmlEscape, validateEmail } from '@/lib/validate'

interface FileMeta {
  name?: unknown
  size?: unknown
  type?: unknown
  path?: unknown
  uploadToken?: unknown
}

const MAX_SINGLE_FILE_BYTES = 15 * 1024 * 1024
const MAX_TOTAL_FILE_BYTES = 40 * 1024 * 1024
const ALLOWED_FILE_MIME_PREFIXES = ['image/', 'application/pdf']
const ALLOWED_FILE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf']

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

// Path must be {uuid}/{sanitized-filename} as produced by /api/custom-orders/upload
const UPLOAD_PATH_RE = /^[0-9a-f-]{36}\/[a-z0-9._-]{1,120}$/

function parseFiles(
  value: unknown,
  maxFiles: number
): { files: Array<{ name: string; size: number; type: string; path?: string; uploadToken?: string }>; error?: string } {
  if (!Array.isArray(value)) return { files: [] }

  if (value.length > maxFiles) {
    return {
      files: [],
      error: `You can upload up to ${maxFiles} files per request.`,
    }
  }

  const files = value
    .slice(0, maxFiles)
    .map((file: FileMeta) => {
      const name = asTrimmedString(file?.name, 180)
      const size = Number.isFinite(Number(file?.size)) ? Math.max(0, Number(file?.size)) : 0
      const type = asTrimmedString(file?.type, 120)
      const rawPath = asTrimmedString(file?.path, 160)
      const path = UPLOAD_PATH_RE.test(rawPath) ? rawPath : undefined
      const uploadToken = asTrimmedString(file?.uploadToken, 64) || undefined
      return { name, size, type, ...(path ? { path } : {}), ...(uploadToken ? { uploadToken } : {}) }
    })
    .filter((file) => file.name.length > 0)

  let totalBytes = 0
  for (const file of files) {
    if (file.size < 1) {
      return {
        files: [],
        error: `File "${file.name}" appears empty or missing a valid size.`,
      }
    }

    if (file.size > MAX_SINGLE_FILE_BYTES) {
      return {
        files: [],
        error: `File "${file.name}" exceeds the ${Math.floor(MAX_SINGLE_FILE_BYTES / (1024 * 1024))}MB limit.`,
      }
    }

    const mimeAllowed = ALLOWED_FILE_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix))
    const extensionAllowed = ALLOWED_FILE_EXTENSIONS.some((ext) =>
      file.name.toLowerCase().endsWith(ext)
    )

    if (!mimeAllowed && !extensionAllowed) {
      return {
        files: [],
        error: `File "${file.name}" has unsupported type "${file.type || 'unknown'}".`,
      }
    }

    totalBytes += file.size
    if (totalBytes > MAX_TOTAL_FILE_BYTES) {
      return {
        files: [],
        error: `Total upload size exceeds ${Math.floor(MAX_TOTAL_FILE_BYTES / (1024 * 1024))}MB.`,
      }
    }
  }

  return { files }
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
  const resendKey = process.env.RESEND_API_KEY

  if (!resendKey) return

  const notifications = await getOperationalNotificationSettings()
  const notifyTo = notifications.custom_request_notify_email
  const resend = getResend()
  const fromAddress = await getEmailSenderAddress()

  await resend.emails.send({
    from: fromAddress,
    to: [notifyTo],
    subject: `New custom request: ${input.itemType} (${input.requestId.slice(0, 8)})`,
    html: `
      <h2>New Custom Request</h2>
      <p><strong>ID:</strong> ${safeHtmlEscape(input.requestId)}</p>
      <p><strong>Name:</strong> ${safeHtmlEscape(input.customerName)}</p>
      <p><strong>Email:</strong> ${safeHtmlEscape(input.customerEmail)}</p>
      <p><strong>Item Type:</strong> ${safeHtmlEscape(input.itemType)}</p>
      <p><strong>Quantity:</strong> ${safeHtmlEscape(String(input.quantity))}</p>
      <p><strong>Description:</strong></p>
      <p>${safeHtmlEscape(input.description)}</p>
    `,
  })
}

/**
 * Send a confirmation email to the customer after they submit a custom request.
 * Includes a link to track their request status.
 */
async function sendCustomerConfirmationEmail(input: {
  customerEmail: string
  customerName: string
  requestId: string
  itemType: string
  quantity: number
  statusUrl: string
}) {
  if (!process.env.RESEND_API_KEY) return

  const resend = getResend()
  const fromAddress = await getEmailSenderAddress()

  await resend.emails.send({
    from: fromAddress,
    to: [input.customerEmail],
    subject: `We received your custom request (${input.requestId.slice(0, 8)})`,
    html: `
      <h2>Thank You for Your Request!</h2>
      <p>Hi ${safeHtmlEscape(input.customerName)},</p>
      <p>We've received your custom request and our team will review it shortly. Here's a summary:</p>
      <p><strong>Request ID:</strong> ${safeHtmlEscape(input.requestId)}</p>
      <p><strong>Item type:</strong> ${safeHtmlEscape(input.itemType)}</p>
      <p><strong>Quantity:</strong> ${safeHtmlEscape(String(input.quantity))}</p>
      <h3>What Happens Next?</h3>
      <ol>
        <li><strong>Review:</strong> We'll review your request and any artwork you uploaded (usually within 1–2 business days).</li>
        <li><strong>Quote:</strong> You'll receive an email with a quote including pricing and an estimated timeline.</li>
        <li><strong>Payment:</strong> If you approve the quote, you can pay securely via Square.</li>
        <li><strong>Production:</strong> Once paid, we'll begin production and keep you updated.</li>
      </ol>
      <p>You can track your request status anytime:</p>
      <p><a href="${safeHtmlEscape(input.statusUrl)}">${safeHtmlEscape(input.statusUrl)}</a></p>
      <p>Please bookmark this link — it's your private access to your request details.</p>
    `,
  })
}

export async function POST(request: Request) {
  try {
    const csrfResponse = requireCsrfOriginOnly(request)
    if (csrfResponse) return csrfResponse

    const ip = getClientIp(request)
    const rl = await rateLimit(`intake:${ip}`, 5, 60 * 60 * 1000, { failClosed: true })
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter!)

    const body = (await request.json()) as CustomOrderBody
    const intakeSettings = await getCustomOrderIntakeSettings()

    const customerName = asTrimmedString(body.customerName, 120)
    const customerEmail = asTrimmedString(body.customerEmail, 180).toLowerCase()
    const itemType = asTrimmedString(body.itemType, 120)
    const quantity = Math.min(asPositiveInt(body.quantity, 1), intakeSettings.max_quantity)
    const deadline = asNullableString(body.deadline, 40)
    const budgetRange = asNullableString(body.budgetRange, 80)
    const description = asTrimmedString(body.description, 6000)
    const designHelpNeeded = asBoolean(body.designHelpNeeded)
    const ipRightsConfirmed = asBoolean(body.ipRightsConfirmed)
    const ageConfirmed = asBoolean(body.ageConfirmed)
    const tosAccepted = asBoolean(body.tosAccepted)
    const parsedFiles = parseFiles(body.files, intakeSettings.max_files)
    if (parsedFiles.error) {
      return NextResponse.json({ error: parsedFiles.error }, { status: 400 })
    }
    const files = parsedFiles.files
    const customerAccessToken = createCustomerAccessToken()
    const customerAccessExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString()

    if (!customerName || !customerEmail || !itemType || !description) {
      return NextResponse.json(
        { error: 'Missing required fields. Please complete all required inputs.' },
        { status: 400 }
      )
    }

    // Validate email format — prevents invalid emails from entering the pipeline
    const validEmail = validateEmail(customerEmail)
    if (!validEmail) {
      return NextResponse.json(
        { error: 'Please provide a valid email address.' },
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

    // SEC-018: Verify artwork ownership — each file with a path must have a
    // valid uploadToken that matches a row in exp_artwork_uploads.
    for (const file of files) {
      if (file.path && file.uploadToken) {
        const { data: uploadRecord, error: uploadError } = await supabase
          .from('exp_artwork_uploads')
          .select('id, file_path')
          .eq('upload_token', file.uploadToken)
          .eq('file_path', file.path)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle()

        if (uploadError || !uploadRecord) {
          return NextResponse.json(
            { error: 'Artwork ownership verification failed. Please re-upload your files.' },
            { status: 403 }
          )
        }
      } else if (file.path && !file.uploadToken) {
        return NextResponse.json(
          { error: 'Missing upload token for artwork file.' },
          { status: 403 }
        )
      }
    }

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

    const origin = new URL(request.url).origin
    const statusUrl = `${origin}/custom-orders/${data.id}?access=${encodeURIComponent(data.customer_access_token)}`

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
      console.error('[custom-orders:email:admin]', mailError)
      // Email failure should not fail the request submission itself.
    }

    // Send confirmation email to the customer with their status tracking link
    try {
      await sendCustomerConfirmationEmail({
        customerEmail,
        customerName,
        requestId: data.id,
        itemType,
        quantity,
        statusUrl,
      })
    } catch (mailError) {
      console.error('[custom-orders:email:customer]', mailError)
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
