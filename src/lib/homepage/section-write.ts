/**
 * The single write path for `exp_homepage_sections` (SEPT_IMPLEMENTATION_PLAN §7.3).
 *
 * Before this, all five writers in `sections/[key]/route.ts` and the batch writer
 * in `sections/route.ts` did `.update({…}).eq('section_key', key)` and looked only
 * at `error`. PostgREST does **not** error when an update matches zero rows — it
 * returns an empty array — and no caller asked for the rows back, so a save for a
 * key with no row (`shop_all_preview`, `future_products_notify`, both confirmed
 * absent from the live table on 2026-09-30) returned `{ok:true}`, wrote a
 * **success** audit entry, and stored nothing.
 *
 * This helper makes that impossible in three ways:
 *   1. it asks for the written rows back (`.select()`), so "no row" is visible;
 *   2. when no row existed it creates one, so the write actually lands;
 *   3. it reports `created` so the caller can audit the difference between
 *      "updated" and "the row did not exist and was created".
 *
 * Deliberately not a one-call `upsert`: `sort_order` is written **only** on the
 * create path. Sending it on every save would overwrite whatever ordering the
 * admin set (§7.2), which is the same class of silent data loss this item is
 * about.
 */

import { defaultHomepageSectionOrder, type HomepageSectionKey } from '@/lib/homepage/sections'
import { getSupabaseAdmin } from '@/lib/supabase/client'

export interface HomepageSectionWrite {
  sectionKey: HomepageSectionKey
  isVisible: boolean
  /**
   * Content sections only. Omitted for visibility-only toggles so a toggle can
   * never replace an existing section's content with `{}`.
   */
  content?: Record<string, unknown>
}

export type HomepageSectionWriteResult =
  | { ok: true; created: boolean }
  | { ok: false; error: string }

const TABLE = 'exp_homepage_sections'

export async function saveHomepageSection(
  input: HomepageSectionWrite
): Promise<HomepageSectionWriteResult> {
  const supabase = getSupabaseAdmin()

  // `content` is spread conditionally: a visibility-only toggle must leave the
  // stored content untouched.
  const fields = {
    is_visible: input.isVisible,
    updated_at: new Date().toISOString(),
    ...(input.content ? { content: input.content } : {}),
  }

  // ── 1. Update the existing row (the steady-state path) ─────────────────────
  const updated = await supabase
    .from(TABLE)
    .update(fields)
    .eq('section_key', input.sectionKey)
    .select('section_key')

  if (updated.error) {
    return { ok: false, error: updated.error.message }
  }

  if ((updated.data ?? []).length > 0) {
    return { ok: true, created: false }
  }

  // ── 2. No row matched → create it with its default position ────────────────
  // `upsert` rather than `insert` so a concurrent first save cannot fail on the
  // `section_key` unique constraint; on this path the row is known to be absent,
  // so writing `sort_order` is safe.
  const created = await supabase
    .from(TABLE)
    .upsert(
      {
        section_key: input.sectionKey,
        sort_order: defaultHomepageSectionOrder(input.sectionKey),
        ...fields,
      },
      { onConflict: 'section_key' }
    )
    .select('section_key')

  if (created.error) {
    return { ok: false, error: created.error.message }
  }

  if ((created.data ?? []).length === 0) {
    // Neither the update nor the create returned a row: report a failure rather
    // than the old `{ok:true}` that discarded the admin's input.
    return { ok: false, error: `No row was written for section "${input.sectionKey}".` }
  }

  return { ok: true, created: true }
}
