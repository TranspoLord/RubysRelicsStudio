import { NextResponse } from 'next/server'
import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getSupabaseAdmin } from '@/lib/supabase/client'

// Sections that have tile content editors — require full validation
const TILE_SECTION_KEYS = new Set(['quick_picks', 'process_picks'])

// Sections that have content editors beyond simple visibility
const CONTENT_SECTION_KEYS = new Set(['quick_picks', 'process_picks', 'hero_collage'])

// All sections that may be PATCH-ed through this route
const ALL_SECTION_KEYS = new Set([
  'hero',
  'hero_collage',
  'quick_picks',
  'process_picks',
  'order_paths',
  'category_grid',
  'featured_collections',
  'fresh_from_forge',
  'materials_teaser',
  'process_strip',
  'custom_order_pitch',
  'testimonials',
  'faq_preview',
  'newsletter',
  'resources_teaser',
])

interface ShortcutItem {
  key?: unknown
  label: unknown
  emoji?: unknown
  href: unknown
  image_url?: unknown
  gradient?: unknown
  glow_color?: unknown
  is_visible?: unknown
  sort_order?: unknown
}

interface SectionContentPayload {
  heading?: unknown
  subheading?: unknown
  is_visible?: unknown
  items?: unknown
}

function validatePayload(body: unknown): {
  valid: true
  heading: string
  subheading: string
  is_visible: boolean
  items: ShortcutItem[]
} | { valid: false; message: string } {
  if (typeof body !== 'object' || body === null) {
    return { valid: false, message: 'Request body must be a JSON object.' }
  }

  const b = body as SectionContentPayload

  if (typeof b.heading !== 'string' || b.heading.trim() === '') {
    return { valid: false, message: "'heading' must be a non-empty string." }
  }

  const subheading = typeof b.subheading === 'string' ? b.subheading : ''
  const is_visible = b.is_visible !== false

  if (!Array.isArray(b.items)) {
    return { valid: false, message: "'items' must be an array." }
  }

  for (let i = 0; i < b.items.length; i++) {
    const item = b.items[i] as ShortcutItem
    if (typeof item !== 'object' || item === null) {
      return { valid: false, message: `items[${i}] must be an object.` }
    }
    if (typeof item.label !== 'string' || item.label.trim() === '') {
      return { valid: false, message: `items[${i}].label must be a non-empty string.` }
    }
    // emoji is required unless image_url is provided
    if (typeof item.emoji !== 'string' && typeof item.image_url !== 'string') {
      return { valid: false, message: `items[${i}].emoji is required when image_url is not set.` }
    }
    if (typeof item.emoji === 'string' && item.emoji.trim() === '') {
      return { valid: false, message: `items[${i}].emoji must be a non-empty string.` }
    }
    if (typeof item.href !== 'string' || item.href.trim() === '') {
      return { valid: false, message: `items[${i}].href must be a non-empty string.` }
    }
    // href must be a relative path for security
    if (!/^\//.test(item.href as string)) {
      return { valid: false, message: `items[${i}].href must be a relative path starting with '/'.` }
    }
  }

  return {
    valid: true,
    heading: b.heading.trim(),
    subheading: subheading.trim(),
    is_visible,
    items: b.items as ShortcutItem[],
  }
}

interface RouteParams {
  params: Promise<{ key: string }>
}

/**
 * PATCH /api/admin/homepage/sections/[key]
 * Two modes:
 *  - Tile sections (quick_picks, process_picks): full content + item validation
 *  - Simple sections (all others): only is_visible is accepted
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await requireAdminApiSession(request, {
    key: 'admin:homepage:patch',
    maxRequests: 20,
    windowMs: 60_000,
  })
  if (!auth.ok) return auth.response

  const { key: sectionKey } = await params

  if (!ALL_SECTION_KEYS.has(sectionKey)) {
    return NextResponse.json({ error: 'Unknown section key.' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  // ── Hero Collage — stores full content payload ─────────────────────────────
  if (sectionKey === 'hero_collage') {
    const content =
      typeof body === 'object' && body !== null
        ? (body as Record<string, unknown>)
        : {}

    const is_visible =
      typeof body === 'object' && body !== null && 'is_visible' in body
        ? (body as Record<string, unknown>).is_visible !== false
        : true

    const supabase = getSupabaseAdmin()
    const { error } = await supabase
      .from('exp_homepage_sections')
      .update({ content, is_visible, updated_at: new Date().toISOString() })
      .eq('section_key', sectionKey)

    if (error) {
      console.error(`[admin:homepage:sections:patch:${sectionKey}]`, error.message)
      return NextResponse.json({ error: 'Could not save hero collage settings.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'homepage_section_update',
      entityType: 'homepage_section',
      entityId: sectionKey,
      route: `/api/admin/homepage/sections/${sectionKey}`,
      request,
      status: 'success',
      details: { sectionKey, is_visible },
    })

    return NextResponse.json({ ok: true })
  }

  // ── Simple sections — only is_visible accepted ─────────────────────────────
  if (!TILE_SECTION_KEYS.has(sectionKey)) {
    const is_visible =
      typeof body === 'object' && body !== null && 'is_visible' in body
        ? (body as Record<string, unknown>).is_visible !== false
        : true

    const supabase = getSupabaseAdmin()
    const { error } = await supabase
      .from('exp_homepage_sections')
      .update({ is_visible, updated_at: new Date().toISOString() })
      .eq('section_key', sectionKey)

    if (error) {
      console.error(`[admin:homepage:sections:patch:${sectionKey}]`, error.message)
      return NextResponse.json({ error: 'Could not save section.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'homepage_section_update',
      entityType: 'homepage_section',
      entityId: sectionKey,
      route: `/api/admin/homepage/sections/${sectionKey}`,
      request,
      status: 'success',
      details: { sectionKey, is_visible },
    })

    return NextResponse.json({ ok: true })
  }

  // ── Tile sections — full content validation ────────────────────────────────
  const validation = validatePayload(body)
  if (!validation.valid) {
    return NextResponse.json({ error: validation.message }, { status: 400 })
  }

  const { heading, subheading, is_visible, items } = validation

  // Sanitise items — strip any fields beyond the allowed set
  const sanitisedItems = items.map((item, i) => ({
    key: typeof item.key === 'string' ? item.key : String(i),
    label: (item.label as string).trim(),
    emoji: typeof item.emoji === 'string' ? item.emoji.trim() : '',
    image_url: typeof item.image_url === 'string' ? item.image_url : undefined,
    href: (item.href as string).trim(),
    gradient: typeof item.gradient === 'string' ? item.gradient : undefined,
    glow_color: typeof item.glow_color === 'string' ? item.glow_color : undefined,
    is_visible: item.is_visible !== false,
    sort_order: typeof item.sort_order === 'number' ? item.sort_order : i,
  }))

  const content = { heading, subheading, items: sanitisedItems }

  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('exp_homepage_sections')
    .update({ content, is_visible, updated_at: new Date().toISOString() })
    .eq('section_key', sectionKey)

  if (error) {
    console.error(`[admin:homepage:sections:patch:${sectionKey}]`, error.message)
    await writeAdminAuditLog({
      action: 'homepage_section_update',
      entityType: 'homepage_section',
      entityId: sectionKey,
      route: `/api/admin/homepage/sections/${sectionKey}`,
      request,
      status: 'failure',
      details: { error: error.message },
    })
    return NextResponse.json({ error: 'Could not save section.' }, { status: 500 })
  }

  await writeAdminAuditLog({
    action: 'homepage_section_update',
    entityType: 'homepage_section',
    entityId: sectionKey,
    route: `/api/admin/homepage/sections/${sectionKey}`,
    request,
    status: 'success',
    details: { sectionKey, itemCount: sanitisedItems.length },
  })

  return NextResponse.json({ ok: true })
}
