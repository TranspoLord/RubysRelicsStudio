// ─── Homepage data query functions ────────────────────────────────────────────
// All server-only. Import only in server components or route handlers.
// Each function returns typed data or a safe empty/null fallback —
// the page renders its placeholder state on any DB miss.

import { getSupabaseAdmin } from '@/lib/supabase/client'
import type {
  TaxonomyEntry,
  HomepageSection,
  FeaturedCollection,
  GalleryItem,
} from '@/types'

// ─── Derived types for tables that extend the base types ─────────────────────

export interface DbFeaturedCollection {
  id: string
  title: string
  tagline: string
  description: string
  slug: string
  image_url: string | null
  emoji: string | null
  tag_label: string | null
  gradient: string
  border_color: string
  is_visible: boolean
  sort_order: number
}

export interface DbGalleryItem {
  id: string
  title: string
  caption: string | null
  category_key: string | null
  media_url: string
  media_alt: string
  emoji: string | null
  gradient: string
  material_used: string | null
  turnaround_band: string | null
  moderation_status: string
  visible: boolean
  sort_order: number
  // category display_name joined from exp_taxonomy
  category_display_name: string | null
  category_slug: string | null
}

export interface DbTestimonial {
  id: string
  quote: string
  author: string
  location: string | null
  product_label: string | null
  stars: number
  emoji: string | null
  is_visible: boolean
  sort_order: number
}

export interface DbFaqItem {
  id: string
  question: string
  answer: string
  link_label: string | null
  link_href: string | null
  is_visible: boolean
  sort_order: number
}

export interface DbAnnouncement {
  id: string
  message: string
  cta_label: string | null
  cta_href: string | null
  is_active: boolean
  dismiss_key: string
}

export interface HomepageSectionMap {
  [sectionKey: string]: Pick<HomepageSection, 'is_visible' | 'sort_order' | 'content'>
}

const supabase = getSupabaseAdmin()

// ─── Section visibility map ───────────────────────────────────────────────────
/**
 * Returns a map of section_key → { is_visible, sort_order, content }
 * Used by page.tsx to decide which sections to render and in what order.
 */
export async function getHomepageSections(): Promise<HomepageSectionMap> {
  const { data, error } = await supabase
    .from('exp_homepage_sections')
    .select('section_key, is_visible, sort_order, content')
    .order('sort_order', { ascending: true })

  if (error || !data) {
    console.error('[CMS] getHomepageSections failed:', error?.message)
    return {}
  }

  return Object.fromEntries(
    data.map((row) => [
      row.section_key,
      { is_visible: row.is_visible, sort_order: row.sort_order, content: row.content },
    ])
  )
}

// ─── Announcement banner ──────────────────────────────────────────────────────
export async function getActiveAnnouncement(): Promise<DbAnnouncement | null> {
  const { data, error } = await supabase
    .from('exp_announcement')
    .select('id, message, cta_label, cta_href, is_active, dismiss_key')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[CMS] getActiveAnnouncement failed:', error.message)
    return null
  }
  return data
}

// ─── Category grid ────────────────────────────────────────────────────────────
export async function getCategories(): Promise<TaxonomyEntry[]> {
  const { data, error } = await supabase
    .from('exp_taxonomy')
    .select('key, display_name, slug, type, visible, sort_order, emoji, gradient, glow_color, tagline, how_it_works_anchor, alias_keys, created_at, updated_at')
    .eq('type', 'category')
    .eq('visible', true)
    .order('sort_order', { ascending: true })

  if (error || !data) {
    console.error('[CMS] getCategories failed:', error?.message)
    return []
  }
  return data as unknown as TaxonomyEntry[]
}

// ─── Materials teaser ─────────────────────────────────────────────────────────
export async function getMaterials(): Promise<TaxonomyEntry[]> {
  const { data, error } = await supabase
    .from('exp_taxonomy')
    .select('key, display_name, slug, type, visible, sort_order, emoji, gradient, tagline, created_at, updated_at')
    .eq('type', 'material')
    .eq('visible', true)
    .order('sort_order', { ascending: true })

  if (error || !data) {
    console.error('[CMS] getMaterials failed:', error?.message)
    return []
  }
  return data as unknown as TaxonomyEntry[]
}

// ─── Featured collections ─────────────────────────────────────────────────────
export async function getFeaturedCollections(): Promise<DbFeaturedCollection[]> {
  const { data, error } = await supabase
    .from('exp_featured_collections')
    .select('id, title, tagline, description, slug, image_url, emoji, tag_label, gradient, border_color, is_visible, sort_order')
    .eq('is_visible', true)
    .order('sort_order', { ascending: true })

  if (error || !data) {
    console.error('[CMS] getFeaturedCollections failed:', error?.message)
    return []
  }
  return data
}

// ─── Gallery (Fresh From the Forge) ──────────────────────────────────────────
export async function getPublishedGallery(limit = 6): Promise<DbGalleryItem[]> {
  const { data, error } = await supabase
    .from('exp_gallery')
    .select(`
      id, title, caption, category_key, media_url, media_alt,
      emoji, gradient, material_used, turnaround_band,
      moderation_status, visible, sort_order,
      exp_taxonomy!category_key (display_name, slug)
    `)
    .eq('moderation_status', 'published')
    .eq('visible', true)
    .order('sort_order', { ascending: true })
    .limit(limit)

  if (error || !data) {
    console.error('[CMS] getPublishedGallery failed:', error?.message)
    return []
  }

  return data.map((row) => {
    const taxonomy = Array.isArray(row.exp_taxonomy)
      ? row.exp_taxonomy[0]
      : row.exp_taxonomy
    return {
      ...row,
      exp_taxonomy: undefined,
      category_display_name: taxonomy?.display_name ?? null,
      category_slug: taxonomy?.slug ?? null,
    }
  }) as DbGalleryItem[]
}

// ─── Testimonials ─────────────────────────────────────────────────────────────
export async function getVisibleTestimonials(limit = 6): Promise<DbTestimonial[]> {
  const { data, error } = await supabase
    .from('exp_testimonials')
    .select('id, quote, author, location, product_label, stars, emoji, is_visible, sort_order')
    .eq('is_visible', true)
    .order('sort_order', { ascending: true })
    .limit(limit)

  if (error || !data) {
    console.error('[CMS] getVisibleTestimonials failed:', error?.message)
    return []
  }
  return data
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────
export async function getHomepageFaq(): Promise<DbFaqItem[]> {
  const { data, error } = await supabase
    .from('exp_faq')
    .select('id, question, answer, link_label, link_href, is_visible, sort_order')
    .eq('section', 'homepage')
    .eq('is_visible', true)
    .order('sort_order', { ascending: true })

  if (error || !data) {
    console.error('[CMS] getHomepageFaq failed:', error?.message)
    return []
  }
  return data
}
