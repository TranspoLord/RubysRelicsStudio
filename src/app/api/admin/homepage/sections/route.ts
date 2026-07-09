import { NextResponse } from 'next/server'
import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { getSupabaseAdmin } from '@/lib/supabase/client'

// All section keys tracked in exp_homepage_sections (announcement excluded —
// its visibility is controlled by exp_announcement.is_active, not this table)
const ALL_SECTION_KEYS = [
  'hero',
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
] as const

type SectionKey = (typeof ALL_SECTION_KEYS)[number]
const SECTION_KEY_SET = new Set<string>(ALL_SECTION_KEYS)

/**
 * GET /api/admin/homepage/sections
 * Returns visibility + content for ALL homepage sections.
 */
export async function GET(request: Request) {
  const auth = await requireAdminApiSession(request)
  if (!auth.ok) return auth.response

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('exp_homepage_sections')
    .select('section_key, is_visible, sort_order, content')
    .in('section_key', [...ALL_SECTION_KEYS])
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[admin:homepage:sections:get]', error.message)
    return NextResponse.json({ error: 'Could not load homepage sections.' }, { status: 500 })
  }

  const sections = Object.fromEntries((data ?? []).map((row) => [row.section_key, row]))
  return NextResponse.json({ sections })
}

interface VisibilityEntry {
  key?: unknown
  is_visible?: unknown
}

/**
 * PATCH /api/admin/homepage/sections
 * Batch-updates is_visible for any number of simple (non-tile) sections.
 * Body: { sections: Array<{ key: string, is_visible: boolean }> }
 *
 * Tile sections (quick_picks, process_picks) can be included here for
 * visibility-only toggles; their content is managed via PATCH /…/[key].
 */
export async function PATCH(request: Request) {
  const auth = await requireAdminApiSession(request, {
    key: 'admin:homepage:sections:patch',
    maxRequests: 30,
    windowMs: 60_000,
  })
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (typeof body !== 'object' || body === null || !Array.isArray((body as Record<string, unknown>).sections)) {
    return NextResponse.json({ error: 'Body must have a sections array.' }, { status: 400 })
  }

  const raw = (body as { sections: unknown[] }).sections

  if (raw.length === 0 || raw.length > ALL_SECTION_KEYS.length) {
    return NextResponse.json(
      { error: `sections must have between 1 and ${ALL_SECTION_KEYS.length} entries.` },
      { status: 400 }
    )
  }

  const updates: Array<{ key: SectionKey; is_visible: boolean }> = []
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i] as VisibilityEntry
    if (typeof entry?.key !== 'string' || !SECTION_KEY_SET.has(entry.key)) {
      return NextResponse.json(
        { error: `sections[${i}].key is not a recognised section key.` },
        { status: 400 }
      )
    }
    updates.push({ key: entry.key as SectionKey, is_visible: entry.is_visible !== false })
  }

  const supabase = getSupabaseAdmin()
  const errors: string[] = []

  await Promise.all(
    updates.map(async ({ key, is_visible }) => {
      const { error } = await supabase
        .from('exp_homepage_sections')
        .update({ is_visible, updated_at: new Date().toISOString() })
        .eq('section_key', key)

      if (error) errors.push(key)
    })
  )

  if (errors.length > 0) {
    console.error('[admin:homepage:sections:patch] db error for keys:', errors)
    return NextResponse.json(
      { error: `Failed to update section(s): ${errors.join(', ')}.` },
      { status: 500 }
    )
  }

  await writeAdminAuditLog({
    action: 'homepage.sections.visibility',
    entityType: 'homepage_section',
    route: '/api/admin/homepage/sections',
    request,
    status: 'success',
    details: { updated: updates.map((u) => ({ key: u.key, is_visible: u.is_visible })) },
  })

  return NextResponse.json({ ok: true })
}
