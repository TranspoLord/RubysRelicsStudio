import { NextResponse } from 'next/server'
import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { saveHomepageSection, saveHomepageSectionOrder } from '@/lib/homepage/section-write'
import { isHomepageSectionKey, HOMEPAGE_SECTION_KEYS, type HomepageSectionKey } from '@/lib/homepage/sections'
import { RENDERABLE_HOMEPAGE_SECTIONS } from '@/lib/homepage/section-order'
import { getSupabaseAdmin } from '@/lib/supabase/client'

// §7.3: the key list lives in src/lib/homepage/sections.ts so this route, the
// [key] route and the write helper can no longer disagree about what a valid
// section is. (announcement is still excluded — its visibility is controlled by
// exp_announcement.is_active, not this table.)
type SectionKey = HomepageSectionKey

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
    .in('section_key', [...HOMEPAGE_SECTION_KEYS])
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

  if (raw.length === 0 || raw.length > HOMEPAGE_SECTION_KEYS.length) {
    return NextResponse.json(
      { error: `sections must have between 1 and ${HOMEPAGE_SECTION_KEYS.length} entries.` },
      { status: 400 }
    )
  }

  const updates: Array<{ key: SectionKey; is_visible: boolean }> = []
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i] as VisibilityEntry
    if (typeof entry?.key !== 'string' || !isHomepageSectionKey(entry.key)) {
      return NextResponse.json(
        { error: `sections[${i}].key is not a recognised section key.` },
        { status: 400 }
      )
    }
    updates.push({ key: entry.key, is_visible: entry.is_visible !== false })
  }

  const errors: string[] = []
  const created: SectionKey[] = []

  // §7.3: each key goes through saveHomepageSection(), which verifies a row was
  // actually written and creates the row when the key has none. A 0-row update is
  // not an error in PostgREST, so the old code reported success for keys such as
  // shop_all_preview that have no row yet.
  await Promise.all(
    updates.map(async ({ key, is_visible }) => {
      const saved = await saveHomepageSection({ sectionKey: key, isVisible: is_visible })

      if (!saved.ok) {
        errors.push(key)
        return
      }

      if (saved.created) created.push(key)
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
    details: {
      updated: updates.map((u) => ({ key: u.key, is_visible: u.is_visible })),
      created,
    },
  })

  return NextResponse.json({ ok: true, created })
}

/**
 * PUT /api/admin/homepage/sections
 * Reorders the renderable sections. Body: { orderedKeys: string[] } — a
 * permutation of the renderable keys (hero is pinned first by
 * `orderHomepageSections()` regardless of what order arrives here). Each key is
 * written with `sort_order = index` through `saveHomepageSectionOrder()`, which
 * creates the row when the key has none (§7.3), so ordering a row-less key such
 * as `shop_all_preview` cannot silently no-op.
 */
export async function PUT(request: Request) {
  const auth = await requireAdminApiSession(request, {
    key: 'admin:homepage:sections:reorder',
    maxRequests: 20,
    windowMs: 60_000,
  })
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (typeof body !== 'object' || body === null || !Array.isArray((body as Record<string, unknown>).orderedKeys)) {
    return NextResponse.json({ error: 'Body must have an orderedKeys array.' }, { status: 400 })
  }

  const orderedKeys = (body as { orderedKeys: unknown[] }).orderedKeys
  const renderable = RENDERABLE_HOMEPAGE_SECTIONS as readonly string[]

  if (orderedKeys.length !== renderable.length) {
    return NextResponse.json(
      { error: `orderedKeys must contain exactly ${renderable.length} renderable sections.` },
      { status: 400 }
    )
  }

  const seen = new Set<string>()
  for (let i = 0; i < orderedKeys.length; i++) {
    const key = orderedKeys[i]
    if (typeof key !== 'string' || !renderable.includes(key) || seen.has(key)) {
      return NextResponse.json(
        { error: 'orderedKeys must be a permutation of the renderable section keys.' },
        { status: 400 }
      )
    }
    seen.add(key)
  }

  const errors: string[] = []
  await Promise.all(
    orderedKeys.map(async (key, index) => {
      const saved = await saveHomepageSectionOrder(key as HomepageSectionKey, index)
      if (!saved.ok) errors.push(key as string)
    })
  )

  if (errors.length > 0) {
    console.error('[admin:homepage:sections:reorder] db error for keys:', errors)
    return NextResponse.json(
      { error: `Failed to reorder section(s): ${errors.join(', ')}.` },
      { status: 500 }
    )
  }

  await writeAdminAuditLog({
    action: 'homepage.sections.reorder',
    entityType: 'homepage_section',
    route: '/api/admin/homepage/sections',
    request,
    status: 'success',
    details: { orderedKeys },
  })

  return NextResponse.json({ ok: true })
}
