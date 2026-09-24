# September Implementation Plan

Consolidated list of open work, carried forward from the archived planning docs and the
September security review. Items are grouped by area, each noting its source.

**Every item below was re-verified against the working tree and the live database on
2026-09-16.** Each carries a status marker with the file/DB evidence used:

- ✅ **DONE** — verified present in code/DB
- 🟡 **PARTIAL** — some of the work is present, some remains
- ❌ **NOT DONE** — no evidence of the work
- ❓ **UNVERIFIED** — could not be confirmed from the repo alone

**§7 was added 2026-09-19** from the storefront UI audit (`UI_AUDIT.md`); its items were
re-verified against the working tree and the live database on that date. Three existing items
were also re-classified or annotated: §3.8 → 🟡, and notes added to §3.4 and §3.11.

> Note: promo/bundle `usage_count` accounting was implemented as part of this pass
> (migration `062` + checkout increment) and is intentionally **not** listed below.

## Summary (2026-09-16 audit; §7 added 2026-09-19)

| Section | ✅ Done | 🟡 Partial | ❌ Not done | Other |
|---|---|---|---|---|
| 1. Security & deployment | 0 | 1 | 4 | — |
| 2. Retention & notification | 6 | 1 | 7 | 1 unverified |
| 3. Future-products / homepage | 5 | 2 | 5 | — |
| 4. Product designer / 3D | 0 | 2 | 2 | — |
| 5. General hygiene | 2 | 0 | 0 | — |
| 6. Live DB follow-ups | 0 | 0 | 3 | 1 corrected, 2 informational |
| 7. Storefront UI (added 2026-09-19) | 0 | 0 | 15 | 4 informational |
| **Total** | **13** | **6** | **36** | **8** |

§3.8 was re-classified ❌ → 🟡 on 2026-09-19 (§7 re-verification: the `enabled` gate exists at
`src/app/page.tsx:150`), which is the single-count difference in §3 and in the totals above.

Highest-value open items: the CSP block that disables **all** analytics (§7.1 — also blocks
§3.11 before any dashboard work is meaningful), the silent no-op section writes that will
discard the Shop All Preview editor's input (§7.3, a prerequisite for §3.4), the section-ordering
refactor that finally makes `sort_order` real (§7.2), `npm audit` high CVE (§1.5), the
migration-history baseline (§1.1/§6.1 — blocks any future `db push`), and the dead `ip` fallback
removal (§1.4/§6.3).

## 1. Security & deployment follow-ups

1. **Baseline the live migration history (blocking).** ❌ **NOT DONE.**
   Live inspection (2026-09-16, via `supabase db query --linked`) confirmed migrations
   `059`–`064` **are** applied to the schema, but `supabase_migrations.schema_migrations`
   **does not exist** — so the CLI has no record of any migration. Do **not** run `db push`
   until this is fixed (it would replay `001`→`064` against objects that already exist and
   fail mid-chain). Run `npx supabase migration repair --status applied 001 … 064`, then
   verify with `npx supabase migration list --linked` (the Remote column should populate).
   _Re-checked 2026-09-16: `information_schema.schemata where
   schema_name='supabase_migrations'` → `0`. Still absent._
2. Set and verify `SESSION_SIGNING_KEY_SEED`, `SESSION_HASH_KEY_SEED`,
   `MFA_CODE_HASH_KEY_SEED` in every environment — the Node and Edge values must match.
   🟡 **PARTIAL.** Local `.env` has all three set (64 hex chars each) ✓. `NEXT_PUBLIC_SITE_URL`
   is **missing** and `NEXT_PUBLIC_APP_URL` still holds the localhost fallback, so email /
   checkout redirect URLs resolve to localhost in local dev. Vercel values are not verifiable
   from the repo.
3. Add route-level regression tests for the Square checkout promo application and the new
   required-shipping validation (only pure helpers are unit-tested today). ❌ **NOT DONE.**
   `src/app/api/square/checkout/route.test.ts` does not exist, and there are **no** test files
   anywhere under `src/app/api/square/`.
4. Remove the dead legacy `ip`-column fallback in `src/lib/admin/mfa-store.ts` now that the
   live `admin_mfa_codes` table uses `challenge_token`. ❌ **NOT DONE.** Still present at
   `src/lib/admin/mfa-store.ts:137,140,178-180,203-207`.
5. Verify `npm audit --audit-level=high` passes locally (CI workflow exists). ❌ **FAILS.**
   One **high** severity advisory: `@xmldom/xmldom` 0.9.0-beta.1 – 0.9.11 (13 advisories:
   XML name/attribute/PI/DOCTYPE injection, ReDoS, quadratic parse/memory). `npm audit fix`
   offers a fix.

## 2. Retention & notification gaps

_Source: `docs/archive/EXPANSION_NOTES.md` → "Remaining (Pending Implementation)"._

High priority:
1. Back-in-stock + capacity-reopen notifications (end-to-end opt-in, trigger, delivery).
   ✅ **DONE.** `src/lib/back-in-stock.ts` + `src/lib/capacity-alerts.ts` (both send via
   Resend), public `api/back-in-stock/{subscribe,unsubscribe}` and
   `api/capacity-alerts/{subscribe,unsubscribe}`, admin processors at
   `api/admin/back-in-stock` and `api/admin/capacity-alerts`, wired into
   `api/admin/inventory`.
2. Gift-ideas route and gift-message capture in checkout. ❌ **NOT DONE.** No
   `gift-ideas` / `gift_message` / `giftMessage` matches anywhere in `src/` (docs only).
3. Abandoned-cart recovery (trigger + email templates + resume UX). ✅ **DONE.**
   `src/lib/abandoned-cart.ts` (Resend), `api/admin/abandoned-carts/route.ts` + admin page,
   migration `024_abandoned_cart_recovery.sql`.
4. Abandoned custom-request recovery (trigger + email templates + resume UX). ✅ **DONE.**
   `src/lib/custom-request-recovery.ts`, `api/admin/custom-requests/recovery/route.ts`,
   migration `025_custom_request_recovery.sql`.

Medium:
5. Production queue visualization + machine scheduling UI on `exp_machine_schedule_blocks`.
   ✅ **DONE.** `src/app/admin/(panel)/schedule/page.tsx` plus the
   `exp_machine_schedule_blocks` table (migration `021`).
6. Art Guard restricted-artwork review workflow completion in admin. ❌ **NOT DONE.** No
   `art-guard` / `restricted_artwork` matches in `src/` (only a false positive in
   `src/lib/resend/client.ts`).
7. Admin pricing-module consolidation decision (dedicated page vs catalog-embedded). ❌ **NOT
   DONE.** Both still exist: `src/app/admin/(panel)/pricing/page.tsx` **and**
   `src/app/admin/(panel)/catalog/pricing/page.tsx`.

Compliance & quality:
8. WCAG 2.2 AA audit + remediation across customer-facing routes. ❌ **NOT DONE.** No
   evidence in the repo.
9. Cookie consent banner + consent persistence + policy wiring. ✅ **DONE.**
   `src/components/common/CookieBanner.tsx` + `src/lib/cookie-consent.ts`, mounted in
   `src/app/layout.tsx:88-89`, policy copy in `src/app/resources/content.ts`.
10. Structured data / SEO completion (Shop, category, PDP, Resources). ❌ **NOT DONE.** No
    evidence in the repo.
11. Mobile responsiveness regression + performance sweep. ❌ **NOT DONE.** No evidence in the
    repo.
12. Automated test baseline beyond the RLS script. ✅ **DONE.** 32 test files / 200 tests,
    green under `npx vitest run` (includes route-level tests).

Operational:
13. Automated low-stock / capacity / status notification orchestration. 🟡 **PARTIAL.**
    Capacity + back-in-stock processors exist and are admin-invocable
    (`api/admin/inventory`); broader low-stock / status orchestration not demonstrated.
14. Tax-calculation strategy hardening + financial reconciliation checks. ❌ **NOT DONE.** No
    evidence in the repo.
15. Multi-carrier shipping adapter plan + phased implementation. ❓ **UNVERIFIED.** Shippo
    (already a multi-carrier aggregator) is wired via `src/lib/shippo/client.ts`, so a
    discrete "adapter layer" may be moot — needs a product decision.

## 3. Future-products / homepage gaps

_Source: `docs/archive/IMPLEMENTATION_PLAN.md` → §14.0 / §14.3._

Critical:
1. Fix `status` → `status_id` column mismatch in `src/app/future-products/page.tsx` and
   `src/app/api/future-products/route.ts` (LEFT JOIN `exp_future_product_statuses`).
   ✅ **DONE.** Both now select `status_id` and embed
   `exp_future_product_statuses(label, color)` (`api/future-products/route.ts:13`,
   `future-products/page.tsx:45`).
2. Fix `price_max=0` encoding bug in `HomepageProductGrid.tsx` `buildViewAllUrl()`.
   ✅ **DONE.** Guarded at `src/components/home/HomepageProductGrid.tsx:75` →
   `if (priceMax > 0 && priceMax < maxPrice)`.

High/medium:
3. Replace `console.error` with `safeLogError` in the future-products route. ✅ **DONE.**
   `src/app/api/future-products/route.ts` imports it (line 6) and uses it at lines 18, 56,
   116, 122.
4. Wire the Shop All Preview editor UI in the admin homepage page (state exists, no JSX).
    ❌ **NOT DONE.** `src/app/admin/(panel)/homepage/page.tsx` is 903 lines (967 at the 2026-09-16 audit) with `return (` at
   line 414; **every** `shopAllPreview` / `futureProductsNotify` reference sits at lines
   110–375 (state + `handleSave*` handlers only). **Dependency (2026-09-19, §7.3):** this item must
    ship together with the upsert fix — the `[key]` PATCH route only `.update()`s and never
    inserts or verifies a matched row, so with no DB row for `shop_all_preview` a save returns
    `{ok:true}` and stores nothing. Completing the UI alone yields an editor that looks like it
    saves and silently discards input. No editor fields are rendered — same for the
   Future Products Notify card.
5. Add `[id]` CRUD routes for future products / statuses / responses. ❌ **NOT DONE.**
   `api/admin/catalog/future-products/` and `future-product-statuses/` each contain only
   `route.ts` + `route.test.ts` — no `[id]/` directories.
6. Build tabbed admin UI (Products | Statuses | Responses) with edit/delete/reorder. ❌ **NOT
   DONE.** Two separate pages exist (`catalog/future-products`, `catalog/future-product-statuses`),
   no tabbed shell, no responses surface.
7. Add `FutureProduct`/`FutureProductStatus` types, a dedicated query module, and a header nav
   link. 🟡 **PARTIAL.** Types exist (`src/types/index.ts:73,84`) ✅ and the nav link exists
   (`src/components/layout/Header.tsx:31`) ✅, but there is **no** dedicated query module —
   `src/lib/supabase/queries/` contains only `homepage.ts` and `products.ts`.
8. Make `FutureProductsNotifyCard` respect the `future_products_notify_form.enabled` setting.
   🟡 **PARTIAL.** Re-checked 2026-09-19 (§7): the gate exists one level up, at
    `src/app/page.tsx:150` (`sections['future_products_notify']?.is_visible !== false &&
    notifySettings?.enabled !== false`), so the requirement is satisfied in practice. The
    component itself still has no `enabled` /
   `notify_form` reference at all — the card renders unconditionally. (The `/future-products`
   page does gate its form on `notifySettings.enabled`.)
9. Send `source` from the notify form + add email-based rate limiting (3/24h). ✅ **DONE.**
   `FutureProductsNotifyCard.tsx:48` sends `source: 'homepage_notify_card'`; the route enforces
   `future-products-email:<email>` at 3 per 24h (`api/future-products/route.ts:82-88`).
10. Decide/implement rich-text sanitization (Tiptap editor + server-side sanitize). ❌ **NOT
    DONE.** No Tiptap dependency or sanitize path found.
11. Add analytics events and wire into `HomepageProductGrid` + `FutureProductsNotifyCard`.
    ❌ **NOT DONE.** Zero analytics matches in either component. **Re-checked 2026-09-19 (§7):**
    the grid's helpers already exist in `src/lib/analytics/events.ts`
    (`homepageProductFilterApplied`, `homepageProductViewAllClicked`,
    `homepageFutureProductsLinkClicked`) but are never called — and no event can be recorded at
    all until §7.1 is fixed, so sequence this after §7.1.
12. Extend `scripts/test-rls-lockdown.mjs` with `exp_future_products` / statuses checks.
    ✅ **DONE.** `scripts/test-rls-lockdown.mjs:23-24` lists both tables.

## 4. Product designer / 3D debt

_Source: `docs/archive/IMPLEMENTATION_PLAN.md` → §14.2B._

1. Full per-product template governance (bleed / safe-area) enforcement. 🟡 **PARTIAL.**
   `src/lib/design/schema.ts` carries the bleed/safe-area model (5 refs) with tests, and
   `src/components/shop/ProductConfigurator.tsx` references it — schema-level only; no
   per-product governance/enforcement layer.
2. Token rebind/refresh UX for expired upload tokens. ❌ **NOT DONE.**
   `src/lib/design/persistence.ts` stores `upload_token` / `expires_at` and **filters expired
   rows out** (line 75 `.gt('expires_at', nowIso)`) — i.e. expiry is enforced, but there is no
   rebind/refresh flow to recover a user whose token lapsed.
3. Remaining integration tests (close/reopen persistence, order snapshots, abuse matrix).
   🟡 **PARTIAL.** `src/lib/design/{schema,persistence,export-renderer}.test.ts` exist;
   close/reopen + order-snapshot + abuse-matrix coverage not demonstrated.
4. Interactive 3D (boundary contract only for now; version `2.x` schema when needed). ❌ **NOT
   DONE.** No `three` / `@react-three` / `webgl` usage in `src/`.

## 5. General hygiene

- Commit the newly-visible-but-important files that were previously gitignored:
  migrations `047`/`048`/`049`/`057`/`058`/`059`/`060`/`061`/`062` and
  `supabase/verification/schema_repair.sql`. ✅ **DONE.** All are tracked in git
  (`048`, `049`, `057`, `058`, `059`–`064`, `supabase/verification/schema_repair.sql`).
  Note: **`047` does not exist** — the migration sequence jumps `046` → `048` (and `036` is
  also absent), so that reference is a typo.
- Re-verify the stale findings above against current code; some may already be resolved.
  ✅ **DONE** for §3.1/3.2/3.3 (§2 items 1/3/4/5/9/12 also verified resolved). Working tree is
  clean apart from `.gitignore`, this file, and untracked `skills-lock.json`.

## 6. Live database findings & follow-ups

_Verified 2026-09-16 against the hosted project (`cvkhrpejzsnzsjffrvnr`) using
`npx supabase db query --linked "select …"`. That command authenticates via the CLI login
token, so it needs **no DB password and no Docker** — it is the tool to use for live
inspection. (`db diff` / `db dump` require Docker Desktop to be running.)_

Confirmed correct live:

- All 8 `SECURITY DEFINER` functions carry `search_path=""` (verified in `pg_proc.proconfig`).
- RPC signatures match the app: `increment_rate_limit(p_expires_at, p_key)`,
  `exp_reserve_order_inventory(p_order_id)`, `exp_release_order_inventory(p_order_id, p_note?)`,
  `exp_increment_promo_code_usage(p_code_id)`, `exp_increment_bundle_deal_usage(p_deal_id)`.
- `exp_promo_codes` / `exp_bundle_deals` have **no** policies and `set role anon` returns 0 rows.
- `exp_storefront_settings` anon policy is narrowed to
  `setting_key = ANY(ARRAY['guest_order_tracking','contact','recommendations'])` (3 rows).
- `exp_rate_limit_windows` has `PRIMARY KEY (key)` — migration `064` is applied.
- RLS enabled on `exp_orders`, `exp_custom_requests`, `exp_promo_codes`, `exp_bundle_deals`,
  `exp_storefront_settings`, `exp_product_designs`, `exp_admin_sessions`, `exp_artwork_uploads`.
- `admin_mfa_codes.id` is `BIGINT`, confirming the MFA verify type bug that was fixed.
- `.temp/pooler-url` contains no password; `supabase/.temp` and `.env` are gitignored.

Action items:

1. **Baseline the migration history** — see §1 item 1 (blocking for any future `db push`).
   ❌ **NOT DONE.**
2. Add `065_cleanup_dead_objects.sql`: ❌ **NOT DONE.** No `065_*` file exists — migrations stop
   at `064_fix_rate_limit_pk.sql`. `exp_stripe_webhook_events` is still declared in `016`,
   `049`, and `supabase/verification/schema_repair.sql`.
   - `drop table if exists public.exp_stripe_webhook_events;` — dead Stripe-era table, nothing
     in the codebase reads it.
   - `alter table public.admin_mfa_codes drop column if exists ip;` — dead column targeted
     only by the legacy `tryVerifyWithColumn(…, 'ip')` fallback.
3. Remove the dead legacy `ip`-column fallback in `src/lib/admin/mfa-store.ts` (also listed in
   §1 item 4) once the column is dropped. ❌ **NOT DONE.**
4. ~~**Fix the local `.env` Supabase key.**~~ ✅ **CORRECTED — NOT A REAL ISSUE.** The original
   finding (key "returns 401") was an artifact of probing `/rest/v1/` at the root and using
   `select=*`. Re-tested 2026-09-16 with real queries, the `sb_publishable_…` key (len 46)
   authenticates correctly:
   - `exp_products?select=slug&limit=1` → `200 [{"slug":"sippy-cup"}]`
   - `exp_storefront_settings?select=setting_key&limit=5` → `200`, **exactly 3 rows**
     (`guest_order_tracking`, `contact`, `recommendations`)
   - `exp_promo_codes?select=code&limit=1` → `200 []` (RLS deny — no rows)
   This also independently re-confirms **DB-2** and **DB-4** at the anon-key/REST layer. No
   change needed.
5. Tooling note: `supabase gen types typescript --linked` did **not** list
   `exp_mark_custom_request_paid` even though it exists in `pg_proc` (PostgREST schema-cache
   lag). Treat `gen types` as a schema source, not a function-completeness check — use
   `pg_proc` via `db query` for that. ℹ️ Informational, no action.
6. Optional: start Docker Desktop when full `db diff` drift detection is wanted. ℹ️ Docker
   Desktop is installed but does not reach "engine ready" from a headless start; `db query`
   covers most inspection needs without it.

## 7. Storefront UI audit & follow-ups

_Source: `UI_AUDIT.md` (method + evidence locations). Added 2026-09-19 from a full homepage
capture at 1440 / 834 / 390 via headless Edge over CDP; the evidence lives outside the repo in
`%TEMP%\rrs-shots3\` (16 tiles + `audit.json`). Re-run the harness in `UI_AUDIT.md` §14 to
re-verify. Items that extend an existing section are cross-referenced rather than duplicated._

Critical:

1. **The CSP blocks the Vercel Analytics script — all analytics are currently dark.** ❌ **NOT
   DONE.** `src/middleware.ts:131-133` builds `script-src 'self' 'nonce-…' https://vercel.live`,
   but the script is served from `https://va.vercel-scripts.com`, and that console violation
   fires on every page load. `connect-src` already lists `vitals.vercel-insights.com` (line 140),
   so **only** the script origin is missing. `@vercel/analytics` exposes **no** `nonce` prop
   (checked in the installed types), so allowlisting the origin is the fix — add it to **both**
   the production and dev branches to keep dev/prod parity. The impact is not just pageviews:
   `src/lib/analytics/events.ts` wraps `track()` and is imported by 12 files (~35 events,
   including `checkout_started`, `checkout_completed`, `custom_request_submitted`). **Blocks
   §3.11.**
2. **Homepage section order is code-driven; `sort_order` is never read.** ❌ **NOT DONE.**
   `src/app/page.tsx:78-158` renders a fixed JSX sequence; `getHomepageSections()` returns
   `sort_order` but only `is_visible` / `content` are consumed, so admin ordering is decorative.
   Refactor to a shared key registry + pure ordering function + key→element render loop, with
   four safety rules: (a) a key with **no DB row** stays **visible** at a default order
   (`shop_all_preview` 45, `future_products_notify` 105 — their current JSX slots), (b) equal
   `sort_order` breaks deterministically by default-order then key (Postgres tie order is
   arbitrary), (c) `hero` is pinned first, (d) an empty/failed section map falls back to the full
   default order, so a Supabase outage cannot blank the page. The live `sort_order` values
   already mirror the current JSX order for every row-bearing key, so the refactor should render
   identically — diffing `audit.json` before/after is the acceptance test.
3. **Homepage-section writes silently no-op for keys without a DB row.** ❌ **NOT DONE.** Every
   writer uses `.update().eq('section_key', …)` and never inserts, nor verifies that a row was
   matched (`src/app/api/admin/homepage/sections/[key]/route.ts:204,241,277,308,355`; the batch
   equivalent at `sections/route.ts:113-116`). Supabase returns no error on a 0-row match, so
   saves for `shop_all_preview` / `future_products_notify` return `{ok:true}` and write a
   **success** audit entry while storing nothing. `section_key` is `UNIQUE`
   (`supabase/migrations/001_homepage_cms.sql:35`, re-confirmed in `049` and
   `supabase/verification/schema_repair.sql`), so `upsert(…, { onConflict: 'section_key' })` is
   available with **no schema change and no migration** (and therefore no `db push` — see §1.1).
   Also make the audit log record a real failure when 0 rows match. **Prerequisite for §3.4 and
   for items 9 and 15 below.**
4. **The announcement banner cannot be turned off.** ❌ **NOT DONE.** Three independent layers:
   `src/app/page.tsx:65` renders it unconditionally; `AnnouncementBanner.tsx:33` does
   `data ?? STATIC_FALLBACK`, so clearing `exp_announcement.is_active` **still renders a
   hard-coded banner**; and the admin homepage page has no announcement panel at all
   (`ALL_SECTION_KEYS` in `sections/route.ts:8-26` deliberately excludes `announcement` — the
   intended switch is `exp_announcement.is_active`). Separately, the live table holds **two
   identical active rows**, and the newest-wins `limit(1)` query hides that landmine.

High:

5. **The banner and footer CTA point at a non-existent category (404).** ❌ **NOT DONE.**
   `exp_announcement.cta_href` is `/shop/categories/engraved-drinkware`, which is **not** a key
   in `exp_taxonomy` (the drinkware keys are `drinkware` and `powder_coated_tumbler`), and
   `src/app/shop/categories/[slug]/page.tsx:52` calls `notFound()` for an unknown slug. The same
   href appears in `src/components/layout/Footer.tsx:16` ("Engraved Drinkware") and in
   `AnnouncementBanner.tsx:28` (`STATIC_FALLBACK`). Repoint all three at a real category.
6. **Migrate `middleware.ts` → `proxy.ts` (Next 16 deprecation).** ❌ **NOT DONE.** Dev log,
   verbatim: `⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.` →
   `npx @next/codemod@canary middleware-to-proxy .`. `src/middleware.ts` is the only such file
   (`src/proxy.ts` does not exist). Preserve the nonce contract — the `x-nonce` response header
   **and** the `rrs_csp_nonce` cookie, both read at `src/app/layout.tsx:73-75` — plus
   `config.matcher` (line 277) and the `CSP_NONCE_COOKIE` export. Verify afterwards: CSP header
   still set, page still hydrates (a broken nonce presents *exactly* like an unhydrated page),
   admin still redirects to `/admin/login`, `npm run type-check` clean. Do this together with
   item 1 — same file, same header.
7. **Brand-palette drift in section accents.** ❌ **NOT DONE.** `quick_picks.items[].glow_color`
   holds `#C084FC` (violet), `#6B9E6B` (green) and `#6A7AC4` (indigo) with matching purple /
   green / navy gradients; the hidden `process_picks` adds `#2ABCD4` (cyan) and `#8B4FBE`
   (purple). `ShortcutSection.tsx:132,201` makes the "Shop now →" link inherit `glow_color`, so
   a purple CTA renders beside a gold button. Also a green eyebrow (`#5A9A3A`) at
   `src/app/shop/ready-made/page.tsx:48`, and `secondary.light` + `letterSpacing: 0.1em` at
   `CustomOrderPitch.tsx:76-78`. Best fix: recolor the CMS values now (no deploy), then change
   the CMS validator from free-form hex to a brand-hue enum so it cannot drift back.
8. **Hero CTA redundancy and a mislabeled analytics event.** ❌ **NOT DONE.**
   `src/components/home/HeroSection.tsx:150-172` renders "Shop the Hoard" (filled) **and**
   "Browse Shop" (outlined), both pointing at `/shop`, while the copy directly above promises
   "Upload your artwork or choose from our ready-made designs" — neither intent is offered. The
   first button also fires `Analytics.categoryClicked('all', 'shop')`, mislabelling a hero click
   as a category click. Separately, `HeroSection.tsx:15` still carries the `TODO` to move hero
   copy into admin-managed content (the `hero` row already exists in `exp_homepage_sections`).
9. **Shop All filter defaults and a missing empty state.** ❌ **NOT DONE.** No
   `shop_all_preview` row exists, so the component defaults win at
   `HomepageProductGrid.tsx:27-28` (`product_count: 6`, `show_filters: true`). All 9 live
   `exp_products` rows are `is_ready_made=false` / `is_customizable=true`, which makes
   "Show ready-made" a **no-op** and "Show customizable" OFF remove every product **with no
   empty state** — the `if (!products.length) return null` guard at line 83 only covers the
   pre-filter list. Depends on item 3 (the row cannot be created until writes can insert).
10. **No favicon and no OG image.** ❌ **NOT DONE.** `public/` does not exist and there is no
    `src/app/icon.*`, so `/favicon.ico` 404s on every page load (`middleware.ts:277` even
    excludes it from the matcher). There is no `sitemap.ts` either — that part belongs to §2.10.
    A programmatic `src/app/icon.tsx` using `ImageResponse` avoids waiting on artwork.

Medium:

11. **Hero collage renders 4 invisible placeholder tiles and absolute production URLs.** ❌
    **NOT DONE.** The `hero_collage` content has `image_count: 6` with 4 entries at `url: ""`;
    those fall into the placeholder branch (`HeroCollage.tsx:192-207`) at
    `alpha(parchment, 0.3)`, which reads as empty space rather than intentional art. The 2 real
    tiles link to absolute `https://rubysrelicsstudio.vercel.app/...` URLs, so in local dev
    those clicks leave the dev server — make them relative. The collage is also `lg`-only
    (`display: { xs: 'none', lg: 'block' }`, line 117), so tablet and mobile get no imagery.
    Real photos are the eventual fix; sizing the container to the real image count, and giving
    the placeholder branch a label plus stronger contrast, are the interim options.
12. **Eyebrow labels are hard-coded and `overline` sits below the 12px floor.** ❌ **NOT DONE.**
    Roughly 30 `variant="overline"` sites across the app (most of them in
    `src/components/home/`); `ShortcutSection.tsx:80-88` reuses the `ariaLabel` prop as the
    visible eyebrow, so one string does accessibility and editorial duty and cannot be changed
    independently. `theme.ts:111-116` sets `0.7rem` (11.2px) — a single theme edit fixes every
    site at once. The CMS follow-up is a shared `SectionHeading` plus a `content.eyebrow` field
    (validator + admin editor). Note the theme's `textTransform: 'uppercase'` already hides
    source-case differences, so the real issues are hard-coding, colour drift, and tone
    ("Shop preview" reads like internal jargon). See §2.8.
13. **Mobile hero wastes ~200px of vertical space.** ❌ **NOT DONE.** `HeroSection.tsx:28` sets
    `minHeight: { xs: '88vh' }` = 743px at 390×844 with `py: 10` and vertically centred content;
    the banner (73px) and header (64px) add ~137px of chrome above it, and the scroll cue is
    20×32px at `opacity: 0.4` (lines 215-257). Reclaim it with
    `minHeight: { xs: 'auto', sm: '72vh', md: '90vh' }`, a smaller `py` on xs, a tighter trust
    row, and a higher-contrast cue. See §2.11.
14. **Homepage section queries under-fetch their own content.** ❌ **NOT DONE.**
    `src/app/page.tsx:54-55` calls `getVisibleTestimonials(3)` while 6 testimonial rows exist,
    and `getPublishedGallery(6)` while 12 gallery rows exist — both sections would render
    half-empty on the day they are re-enabled.

Content/data-only decisions (no deploy required):

15. **Homepage content toggles, pending items 2/3 for anything order-related.** ❌ **NOT DONE.**
    Hide `quick_picks`; enable `faq_preview` (it already sits above "The Forge's Codex" in the
    JSX order and 8 `exp_faq` rows exist for `section='homepage'`); set the `order_paths` /
    `shop_all_preview` `sort_order` values so "Three Ways to Claim Your Treasure" precedes the
    product grid; repoint the banner CTA (item 5); delete the duplicate active `exp_announcement`
    row; fill the null `exp_taxonomy.emoji` values (`wood_goods`, `pet_products`) and give
    `signs_and_decor` its own glyph (🪵 is currently shared with `wood_basswood`, which is why a
    slate product reads as a wood one); recolor the shortcut accents (item 7).

Informational (no action yet):

- The NSFW line at `HeroSection.tsx:127-138` (`alpha(forgeGold, 0.65)` + italic) is deliberate
  brand positioning — suggestive work is welcome — but it is styled like a compliance
  disclaimer, sitting directly under the value proposition at every breakpoint. It should read
  as confidence rather than fine print (higher contrast, no italic, or a chip in the trust row)
  and link to the existing `faq-nsfw` entry / `/resources`. Refinement is pending a wording
  decision.
- `/gallery` exists but is not linked from the header nav, while the homepage gallery teaser
  (`fresh_from_forge`) is hidden.
- The cookie banner does not gate analytics, and `@vercel/analytics` is cookieless — confirm the
  privacy copy matches actual behaviour before relying on the data.
- `src/app/page.tsx` comment numbering duplicates ("7a", then "7." and "8." twice) — cosmetic,
  but confusing when editing the exact section order that item 2 changes.

Re-classifications from this pass (2026-09-19):

- **§3.4** — claim confirmed (903 lines now, not 967; `return (` still at 414; the rendered
  panels are Section Visibility at 432, Hero Collage at 534 and the tile editors at 673+, with
  **no** Shop All / Future Products editor), but it now carries a **dependency on item 3**:
  completing the UI without the upsert fix produces an editor that appears to save and silently
  discards input.
- **§3.8** — ❌ → 🟡: the `enabled` gate exists at `src/app/page.tsx:150`.
- **§3.11** — the helpers already exist in `src/lib/analytics/events.ts` but are never called,
  and the whole analytics surface is dead until item 1 is fixed.
