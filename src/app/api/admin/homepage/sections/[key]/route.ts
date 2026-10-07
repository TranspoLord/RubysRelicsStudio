import { NextResponse } from 'next/server'
import { requireAdminApiSession } from '@/lib/admin/auth'
import { writeAdminAuditLog } from '@/lib/admin/audit'
import { saveHomepageSection } from '@/lib/homepage/section-write'
import { isHomepageSectionKey } from '@/lib/homepage/sections'
import { brandTokens } from '@/theme/theme'

// Sections that have tile content editors — require full validation
const TILE_SECTION_KEYS = new Set(['quick_picks', 'process_picks'])

// Sections that have content editors beyond simple visibility
const CONTENT_SECTION_KEYS = new Set(['quick_picks', 'process_picks', 'hero_collage', 'shop_all_preview', 'future_products_notify'])

/**
 * §7.7: tile accents were free-form hex, so `glow_color`/`gradient` had drifted to
 * violet `#C084FC`, green `#6B9E6B`, indigo `#6A7AC4`, cyan `#2ABCD4` and purple
 * `#8B4FBE` — a purple "Shop now →" link beside a gold button.
 *
 * Rather than reject the request (which would break saving a section whose stored
 * values are still off-brand, before the data migration runs), a non-brand colour
 * is **normalised to the brand accent** and reported back in `normalised`. The
 * result is the same guarantee — the stored data can never contain an off-brand
 * colour again — without a hard failure. `brandTokens` is the allow-list.
 */
const BRAND_HEXES = new Set(
  [
    brandTokens.forgeGold,
    brandTokens.forgeGoldLight,
    brandTokens.forgeGoldDark,
    brandTokens.rubyRed,
    brandTokens.copper,
    brandTokens.parchment,
    brandTokens.parchmentMuted,
  ].map((hex) => hex.toLowerCase())
)

function hexesIn(value: string): string[] {
  return (value.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((hex) => hex.toLowerCase())
}

/** Returns the brand accent when `value` is missing or off-brand. */
function normaliseBrandHex(value: string | undefined, field: string, normalised: string[]): string | undefined {
  if (!value) return value
  const trimmed = value.trim()
  if (BRAND_HEXES.has(trimmed.toLowerCase())) return trimmed
  normalised.push(`${field}: ${trimmed} → ${brandTokens.forgeGold}`)
  return brandTokens.forgeGold
}

/** Drops a gradient built from off-brand colours, so the component's brand default applies. */
function normaliseBrandGradient(value: string | undefined, field: string, normalised: string[]): string | undefined {
  if (!value) return value
  const offBrand = hexesIn(value).filter((hex) => !BRAND_HEXES.has(hex))
  if (offBrand.length === 0) return value
  normalised.push(`${field}: dropped (off-brand ${offBrand.join(', ')})`)
  return undefined
}

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
  eyebrow?: unknown
  is_visible?: unknown
  items?: unknown
  product_count?: unknown
  show_filters?: unknown
  cta_label?: unknown
}

function validateShopAllPreviewPayload(body: unknown): {
  valid: true
  product_count: number
  show_filters: boolean
  heading: string
  subheading: string
  eyebrow: string
  is_visible: boolean
} | { valid: false; message: string } {
  if (typeof body !== 'object' || body === null) {
    return { valid: false, message: 'Request body must be a JSON object.' }
  }

  const b = body as SectionContentPayload
  const productCount = typeof b.product_count === 'number' ? b.product_count : 6
  const showFilters = b.show_filters !== false
  const heading = typeof b.heading === 'string' && b.heading.trim() ? b.heading.trim() : 'Shop All Products'
  const subheading = typeof b.subheading === 'string' ? b.subheading.trim() : ''
  const eyebrow = typeof b.eyebrow === 'string' ? b.eyebrow.trim() : ''
  const is_visible = b.is_visible !== false

  if (!Number.isInteger(productCount) || productCount < 1 || productCount > 50) {
    return { valid: false, message: "'product_count' must be an integer between 1 and 50." }
  }

  return { valid: true, product_count: productCount, show_filters: showFilters, heading, subheading, eyebrow, is_visible }
}

function validateFutureProductsNotifyPayload(body: unknown): {
  valid: true
  heading: string
  subheading: string
  cta_label: string
  is_visible: boolean
} | { valid: false; message: string } {
  if (typeof body !== 'object' || body === null) {
    return { valid: false, message: 'Request body must be a JSON object.' }
  }

  const b = body as SectionContentPayload
  const heading = typeof b.heading === 'string' && b.heading.trim() ? b.heading.trim() : 'Want early access?'
  const subheading = typeof b.subheading === 'string' ? b.subheading.trim() : 'Share your email and idea so we can keep you posted on future drops.'
  const ctaLabel = typeof b.cta_label === 'string' && b.cta_label.trim() ? b.cta_label.trim() : 'Notify me'
  const is_visible = b.is_visible !== false

  return { valid: true, heading, subheading, cta_label: ctaLabel, is_visible }
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

  if (!isHomepageSectionKey(sectionKey)) {
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

    const saved = await saveHomepageSection({
      sectionKey,
      isVisible: is_visible,
      content,
    })

    if (!saved.ok) {
      console.error(`[admin:homepage:sections:patch:${sectionKey}]`, saved.error)
      await writeAdminAuditLog({
        action: 'homepage_section_update',
        entityType: 'homepage_section',
        entityId: sectionKey,
        route: `/api/admin/homepage/sections/${sectionKey}`,
        request,
        status: 'failure',
        details: { error: saved.error },
      })
      return NextResponse.json({ error: 'Could not save hero collage settings.' }, { status: 500 })
    }

    await writeAdminAuditLog({
      action: 'homepage_section_update',
      entityType: 'homepage_section',
      entityId: sectionKey,
      route: `/api/admin/homepage/sections/${sectionKey}`,
      request,
      status: 'success',
      details: { sectionKey, is_visible, created: saved.created },
    })

    return NextResponse.json({ ok: true, created: saved.created })
  }

  if (sectionKey === 'shop_all_preview') {
    const validation = validateShopAllPreviewPayload(body)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.message }, { status: 400 })
    }

    const content = {
      product_count: validation.product_count,
      show_filters: validation.show_filters,
      heading: validation.heading,
      subheading: validation.subheading,
      eyebrow: validation.eyebrow,
    }

    const saved = await saveHomepageSection({
      sectionKey,
      isVisible: validation.is_visible,
      content,
    })

    if (!saved.ok) {
      console.error(`[admin:homepage:sections:patch:${sectionKey}]`, saved.error)
      await writeAdminAuditLog({
        action: 'homepage_section_update',
        entityType: 'homepage_section',
        entityId: sectionKey,
        route: `/api/admin/homepage/sections/${sectionKey}`,
        request,
        status: 'failure',
        details: { error: saved.error },
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
      details: { sectionKey, product_count: validation.product_count, show_filters: validation.show_filters, created: saved.created },
    })

    return NextResponse.json({ ok: true, created: saved.created })
  }

  if (sectionKey === 'future_products_notify') {
    const validation = validateFutureProductsNotifyPayload(body)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.message }, { status: 400 })
    }

    const content = {
      heading: validation.heading,
      subheading: validation.subheading,
      cta_label: validation.cta_label,
    }

    const saved = await saveHomepageSection({
      sectionKey,
      isVisible: validation.is_visible,
      content,
    })

    if (!saved.ok) {
      console.error(`[admin:homepage:sections:patch:${sectionKey}]`, saved.error)
      await writeAdminAuditLog({
        action: 'homepage_section_update',
        entityType: 'homepage_section',
        entityId: sectionKey,
        route: `/api/admin/homepage/sections/${sectionKey}`,
        request,
        status: 'failure',
        details: { error: saved.error },
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
      details: { sectionKey, cta_label: validation.cta_label, created: saved.created },
    })

    return NextResponse.json({ ok: true, created: saved.created })
  }

  // ── Simple sections — only is_visible accepted ─────────────────────────────
  if (!TILE_SECTION_KEYS.has(sectionKey)) {
    const is_visible =
      typeof body === 'object' && body !== null && 'is_visible' in body
        ? (body as Record<string, unknown>).is_visible !== false
        : true

    const saved = await saveHomepageSection({ sectionKey, isVisible: is_visible })

    if (!saved.ok) {
      console.error(`[admin:homepage:sections:patch:${sectionKey}]`, saved.error)
      await writeAdminAuditLog({
        action: 'homepage_section_update',
        entityType: 'homepage_section',
        entityId: sectionKey,
        route: `/api/admin/homepage/sections/${sectionKey}`,
        request,
        status: 'failure',
        details: { error: saved.error },
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
      details: { sectionKey, is_visible, created: saved.created },
    })

    return NextResponse.json({ ok: true, created: saved.created })
  }

  // ── Tile sections — full content validation ────────────────────────────────
  const validation = validatePayload(body)
  if (!validation.valid) {
    return NextResponse.json({ error: validation.message }, { status: 400 })
  }

  const { heading, subheading, is_visible, items } = validation

  // Sanitise items — strip any fields beyond the allowed set
  // §7.7: brand colours only; anything off-brand is normalised and reported.
  const normalised: string[] = []
  const sanitisedItems = items.map((item, i) => ({
    key: typeof item.key === 'string' ? item.key : String(i),
    label: (item.label as string).trim(),
    emoji: typeof item.emoji === 'string' ? item.emoji.trim() : '',
    image_url: typeof item.image_url === 'string' ? item.image_url : undefined,
    href: (item.href as string).trim(),
    gradient: normaliseBrandGradient(
      typeof item.gradient === 'string' ? item.gradient : undefined,
      `items[${i}].gradient`,
      normalised
    ),
    glow_color: normaliseBrandHex(
      typeof item.glow_color === 'string' ? item.glow_color : undefined,
      `items[${i}].glow_color`,
      normalised
    ),
    is_visible: item.is_visible !== false,
    sort_order: typeof item.sort_order === 'number' ? item.sort_order : i,
  }))

  const content = { heading, subheading, items: sanitisedItems }

  const saved = await saveHomepageSection({ sectionKey, isVisible: is_visible, content })

  if (!saved.ok) {
    console.error(`[admin:homepage:sections:patch:${sectionKey}]`, saved.error)
    await writeAdminAuditLog({
      action: 'homepage_section_update',
      entityType: 'homepage_section',
      entityId: sectionKey,
      route: `/api/admin/homepage/sections/${sectionKey}`,
      request,
      status: 'failure',
      details: { error: saved.error },
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
    details: { sectionKey, itemCount: sanitisedItems.length, created: saved.created, normalised },
  })

  return NextResponse.json({ ok: true, created: saved.created, normalised })
}
