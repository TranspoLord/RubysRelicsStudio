-- ─────────────────────────────────────────────────────────────────────────────
-- Homepage / CMS data fixes — from SEPT_IMPLEMENTATION_PLAN §7.4, §7.5, §7.7, §7.15
--
-- ⚠️ MANUAL, NOT AUTO-APPLIED. No batch in this project writes to the hosted
--    database (OCT_IMPLEMENTATION_PLAN.md → OCT-18). Read this file, run the
--    SELECTs first, then run the UPDATEs you agree with.
--
-- ⚠️ This is DATA, not schema — do not put it in supabase/migrations/. Schema
--    pushes are blocked anyway until §1.1 (migration-history baseline) is fixed.
--
-- Run with:  npx supabase db query --linked "<statement>"
--   (the CLI is authenticated in this environment; OCT-18 notes it can be slow)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── §7.5 FIRST: what category slugs actually exist? ──────────────────────────
-- The code-side instance of the bad CTA is already gone (§7.4 removed the static
-- fallback). Whether `/shop/categories/engraved-drinkware` is a real *slug* is a
-- data question, and the repo's seed says it is (key `engraved_drinkware`, slug
-- `engraved-drinkware`). Confirm before changing anything:
--
--   select key, slug, display_name
--   from exp_taxonomy
--   where type = 'category'
--   order by sort_order;
--
-- Only if `engraved-drinkware` is absent does the update below apply — and it
-- then repoints the banner at a drinkware category that does exist:

update exp_announcement a
set cta_href = '/shop/categories/' || t.slug
from exp_taxonomy t
where t.type = 'category'
  and t.key in ('engraved_drinkware', 'drinkware', 'powder_coated_tumbler')
  and a.cta_href = '/shop/categories/engraved-drinkware'
  and not exists (
    select 1 from exp_taxonomy x where x.slug = 'engraved-drinkware'
  );

-- ── §7.4: the duplicate active announcement row ──────────────────────────────
-- The live table held TWO identical active rows; getActiveAnnouncement() hides
-- that with order(created_at).limit(1), so editing the "wrong" one appears to do
-- nothing. See which rows exist first:
--
--   select id, message, is_active, created_at from exp_announcement order by created_at desc;
--
-- Then keep the newest and deactivate the rest:

update exp_announcement
set is_active = false
where is_active
  and id <> (
    select id from exp_announcement where is_active order by created_at desc limit 1
  );

-- ── §7.7: recolour the drifted tile accents ──────────────────────────────────
-- Off-brand hexes found by the audit: #C084FC (violet), #6B9E6B (green),
-- #6A7AC4 (indigo), #2ABCD4 (cyan), #8B4FBE (purple). The API now normalises any
-- off-brand colour on write (route.ts), so this migration is about the *stored*
-- values the storefront still reads. Brand set: gold #C4921A / light #E8B84A /
-- dark #8A6510, ruby #9B1C1C, copper #B87333, parchment #EDE0CC / muted #9E8A6A.

-- Preview what would change:
select s.section_key,
       item->>'label'      as tile,
       item->>'glow_color' as glow_color,
       item->>'gradient'   as gradient
from exp_homepage_sections s,
     jsonb_array_elements(s.content->'items') item
where s.section_key in ('quick_picks', 'process_picks')
  and (
    (item->>'glow_color') ~* '^#(C084FC|6B9E6B|6A7AC4|2ABCD4|8B4FBE|5A9A3A)$'
    or (item->>'gradient') ~* '#(C084FC|6B9E6B|6A7AC4|2ABCD4|8B4FBE|5A9A3A)'
  );

-- Apply: off-brand glow_color → brand gold; off-brand gradient → dropped (the
-- component then paints its own brand gradient).
update exp_homepage_sections s
set content = jsonb_set(s.content, '{items}', (
  select jsonb_agg(
    (case
       when (item->>'glow_color') ~* '^#(C084FC|6B9E6B|6A7AC4|2ABCD4|8B4FBE|5A9A3A)$'
         then item || jsonb_build_object('glow_color', '#C4921A')
       else item
     end)
    - (case
         when (item->>'gradient') ~* '#(C084FC|6B9E6B|6A7AC4|2ABCD4|8B4FBE|5A9A3A)'
           then 'gradient'::text
         else '___noop___'::text
       end)
  )
  from jsonb_array_elements(s.content->'items') item
))
where s.section_key in ('quick_picks', 'process_picks')
  and s.content ? 'items';
-- ── §7.15: homepage content toggles ──────────────────────────────────────────
-- Preview the current state first:
--
--   select section_key, is_visible, sort_order from exp_homepage_sections order by sort_order;

-- Hide the quick-picks shortcut section (it folds into the Shop All preview):
update exp_homepage_sections set is_visible = false, updated_at = now()
where section_key = 'quick_picks';

-- Enable the FAQ preview: 8 `exp_faq` rows exist for section='homepage', and it
-- already sits above "The Forge's Codex" in the order:
update exp_homepage_sections set is_visible = true, updated_at = now()
where section_key = 'faq_preview';

-- Make "Three Ways to Claim Your Treasure" precede the product grid. order_paths
-- already sits at 20; the grid's row does not exist yet, so create it at the slot
-- the code uses for a first save (45), matching DEFAULT_HOMEPAGE_SECTION_ORDER.
insert into exp_homepage_sections (section_key, is_visible, sort_order, content)
values ('shop_all_preview', true, 45,
        '{"product_count": 6, "show_filters": true, "heading": "Shop All Products", "subheading": ""}'::jsonb)
on conflict (section_key) do update
  set sort_order = 45, is_visible = true, updated_at = now();

-- The notify card's row is also absent; create it at its documented slot (105):
insert into exp_homepage_sections (section_key, is_visible, sort_order, content)
values ('future_products_notify', true, 105,
        '{"heading": "Want early access?", "subheading": "Share your email and idea so we can keep you posted on future drops.", "cta_label": "Notify me"}'::jsonb)
on conflict (section_key) do update
  set sort_order = 105, is_visible = true, updated_at = now();

-- ── §7.15: taxonomy glyphs ───────────────────────────────────────────────────
-- `wood_goods` and `pet_products` had no emoji, and `signs_and_decor` shared 🪵
-- with `wood_basswood`, so a slate sign read as a wood product.
update exp_taxonomy set emoji = '🪑' where key = 'wood_goods'   and (emoji is null or emoji = '');
update exp_taxonomy set emoji = '🐾' where key = 'pet_products' and (emoji is null or emoji = '');
update exp_taxonomy set emoji = '🪧' where key = 'signs_and_decor';

-- ── No action needed ─────────────────────────────────────────────────────────
-- `exp_homepage_sections` after §7.3: the code creates missing rows on save, and
-- `orderHomepageSections()` treats a row-less key as *visible* at its default slot
-- (45 / 105 above), so the homepage renders correctly even before this file runs.