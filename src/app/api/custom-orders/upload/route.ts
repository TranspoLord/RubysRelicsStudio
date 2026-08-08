import { NextResponse } from 'next/server'
import { randomBytes, randomUUID } from 'node:crypto'

import { getSupabaseAdmin } from '@/lib/supabase/client'
import { rateLimit, rateLimitResponse, getClientIp } from '@/lib/rate-limit'
import { requireCsrfOriginOnly } from '@/lib/security/csrf'

const BUCKET_NAME = 'customer-artwork'
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024 // 15 MB

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
])

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf'])

function sanitizeFileName(input: string): string {
  const name = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120)
  return name.length > 0 ? name : 'upload'
}

/**
 * Verify file magic bytes so a client cannot spoof the MIME type.
 * Only the first 12 bytes are read — no need to buffer the full file.
 */
async function verifyMagicBytes(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  if (hex.startsWith('ffd8ff')) return true                              // JPEG
  if (hex.startsWith('89504e47')) return true                            // PNG
  if (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250')   // WebP (RIFF????WEBP)
    return true
  if (hex.startsWith('47494638')) return true                            // GIF (GIF8)
  if (hex.startsWith('25504446')) return true                            // PDF (%PDF)

  return false
}

/**
 * POST /api/custom-orders/upload
 *
 * Accepts a single artwork file from a customer before they submit the
 * custom order intake form. Stores it in the private `customer-artwork`
 * Supabase Storage bucket. The returned `path` is included in the
 * subsequent POST /api/custom-orders body so the admin can retrieve it
 * later via a signed URL.
 *
 * Security:
 *  - Rate-limited: 20 uploads per IP per hour
 *  - MIME type allowlist (no SVG — images + PDF only)
 *  - Extension allowlist (double-checks browser-reported MIME type)
 *  - Magic bytes verification (prevents MIME spoofing)
 *  - 15 MB per-file cap
 *  - Filename sanitised; stored under a UUID sub-folder (no guessable paths)
 *  - Bucket is private — no public read policy
 */
export async function POST(request: Request) {
  const csrfResponse = requireCsrfOriginOnly(request)
  if (csrfResponse) return csrfResponse

  const ip = getClientIp(request)
  const rl = await rateLimit(`artwork-upload:${ip}`, 20, 60 * 60 * 1000, { failClosed: true })
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter!)

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file field.' }, { status: 400 })
  }

  // MIME type check
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: 'Unsupported file type. Allowed: jpeg, png, webp, gif, pdf.' },
      { status: 400 }
    )
  }

  // Extension check (double guard against MIME spoofing in the Content-Type header)
  const dotExt = ('.' + (file.name.split('.').pop() ?? '')).toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(dotExt)) {
    return NextResponse.json({ error: 'Unsupported file extension.' }, { status: 400 })
  }

  // Size check
  if (file.size <= 0 || file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: 'File must be between 1 byte and 15 MB.' },
      { status: 400 }
    )
  }

  // Magic bytes verification — prevent MIME-spoofed uploads
  const validContent = await verifyMagicBytes(file)
  if (!validContent) {
    return NextResponse.json(
      { error: 'File content does not match its declared type.' },
      { status: 400 }
    )
  }

  const sanitizedName = sanitizeFileName(file.name)
  const folder = randomUUID()
  const path = `${folder}/${sanitizedName}`

  // SEC-018: Generate a per-session upload token and bind it to the file path
  const uploadToken = randomBytes(24).toString('hex')

  const supabase = getSupabaseAdmin()
  const { error: uploadError } = await supabase.storage.from(BUCKET_NAME).upload(path, file, {
    contentType: file.type,
    upsert: false,
    cacheControl: '3600',
  })

  if (uploadError) {
    console.error('[custom-orders:upload]', uploadError.message)
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }

  // SEC-018: Store the token↔path binding for verification at intake time
  const { error: tokenError } = await supabase
    .from('exp_artwork_uploads')
    .insert({
      upload_token: uploadToken,
      file_path: path,
    })

  if (tokenError) {
    // Non-fatal — log but don't fail the upload
    console.error('[custom-orders:upload:token]', tokenError.message)
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(path, 60 * 60)

  const previewUrl = signedError || !signed ? null : signed.signedUrl

  return NextResponse.json(
    { path, uploadToken, url: previewUrl, name: file.name, size: file.size, type: file.type },
    { status: 201 }
  )
}
