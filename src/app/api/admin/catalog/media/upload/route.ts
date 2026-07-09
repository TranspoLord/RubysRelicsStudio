import { NextResponse } from 'next/server'

import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getSupabaseAdmin } from '@/lib/supabase/client'

const BUCKET_NAME = 'product-media'
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
])

function sanitizeFileName(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120)
}

export async function POST(request: Request) {
  const auth = await requireAdminApiSession(request, {
    key: 'admin-catalog-media-upload',
    maxRequests: 30,
    windowMs: 15 * 60 * 1000,
  })

  if (!auth.ok) return auth.response

  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing media file.' }, { status: 400 })
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          error:
            'Unsupported file type. Allowed: jpeg, png, webp, gif, svg.',
        },
        { status: 400 }
      )
    }

    if (file.size <= 0 || file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'File must be between 1 byte and 10MB.' },
        { status: 400 }
      )
    }

    // SVG files must not contain embedded scripts (stored XSS via direct URL access)
    let uploadBody: File | Blob = file
    if (file.type === 'image/svg+xml') {
      const text = await file.text()
      if (/<script[\s>]/i.test(text) || /javascript\s*:/i.test(text)) {
        return NextResponse.json(
          { error: 'SVG file contains disallowed script content.' },
          { status: 400 }
        )
      }
      // Re-wrap the validated text so we control what is uploaded
      uploadBody = new Blob([text], { type: 'image/svg+xml' })
    }

    const originalName = sanitizeFileName(file.name || 'upload')
    const path = `products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${originalName}`

    const supabase = getSupabaseAdmin()
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(path, uploadBody, {
        contentType: file.type,
        upsert: false,
        cacheControl: '3600',
      })

    if (uploadError) {
      await writeAdminAuditLog({
        action: 'catalog.media.upload',
        entityType: 'product_media',
        route: '/api/admin/catalog/media/upload',
        request,
        status: 'failure',
        details: { reason: 'upload_failed', message: uploadError.message },
      })

      return NextResponse.json(
        {
          error:
            'Failed to upload file. Ensure storage bucket product-media exists and is configured.',
        },
        { status: 500 }
      )
    }

    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path)
    const publicUrl = data.publicUrl

    await writeAdminAuditLog({
      action: 'catalog.media.upload',
      entityType: 'product_media',
      route: '/api/admin/catalog/media/upload',
      request,
      status: 'success',
      details: { path, content_type: file.type, file_size: file.size },
    })

    return NextResponse.json(
      {
        url: publicUrl,
        path,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[admin:catalog:media:upload]', error)

    await writeAdminAuditLog({
      action: 'catalog.media.upload',
      entityType: 'product_media',
      route: '/api/admin/catalog/media/upload',
      request,
      status: 'failure',
      details: { reason: 'unexpected_error' },
    })

    return NextResponse.json({ error: 'Could not upload media file.' }, { status: 500 })
  }
}
