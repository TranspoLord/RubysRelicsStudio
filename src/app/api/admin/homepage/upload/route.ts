import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'

import { requireAdminApiSession } from '@/lib/admin/auth'
import { getSupabaseAdmin } from '@/lib/supabase/client'

const BUCKET_NAME = 'product-media'
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
])

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'])

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
 * POST /api/admin/homepage/upload
 *
 * Accepts a single image file for homepage tile images. Stores it in the
 * public `product-media` Supabase Storage bucket. Returns the public URL.
 *
 * Security:
 *  - Admin session required
 *  - MIME type allowlist (images only)
 *  - Extension allowlist
 *  - 10 MB per-file cap
 *  - Filename sanitised; stored under a UUID sub-folder
 */
export async function POST(request: Request) {
  const auth = await requireAdminApiSession(request, {
    key: 'admin:homepage:upload',
    maxRequests: 30,
    windowMs: 60_000,
  })
  if (!auth.ok) return auth.response

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
      { error: 'Unsupported file type. Allowed: jpeg, png, webp, gif, svg.' },
      { status: 400 }
    )
  }

  // Extension check
  const dotExt = ('.' + (file.name.split('.').pop() ?? '')).toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(dotExt)) {
    return NextResponse.json({ error: 'Unsupported file extension.' }, { status: 400 })
  }

  // Size check
  if (file.size <= 0 || file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: 'File must be between 1 byte and 10 MB.' },
      { status: 400 }
    )
  }

  const sanitizedName = sanitizeFileName(file.name)
  const folder = `homepage-tiles/${randomUUID()}`
  const path = `${folder}/${sanitizedName}`

  const supabase = getSupabaseAdmin()
  const { error: uploadError } = await supabase.storage.from(BUCKET_NAME).upload(path, file, {
    contentType: file.type,
    upsert: false,
    cacheControl: '3600',
  })

  if (uploadError) {
    console.error('[admin:homepage:upload]', uploadError.message)
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }

  // Build the public URL — bucket is public
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}/${path}`

  return NextResponse.json(
    { url: publicUrl, path, name: file.name, size: file.size, type: file.type },
    { status: 201 }
  )
}