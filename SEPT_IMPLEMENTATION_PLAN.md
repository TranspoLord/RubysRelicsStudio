# September Implementation Plan

Consolidated list of open work, carried forward from the archived planning docs and the
September security review. Items are grouped by area, each noting its source.

**Every item below was re-verified against the working tree and the live database on
2026-09-16.** Each carries a status marker with the file/DB evidence used:

- ✅ **DONE** — verified present in code/DB
- 🟡 **PARTIAL** — some of the work is present, some remains
- ❌ **NOT DONE** — no evidence of the work
- ❓ **UNVERIFIED** — could not be confirmed from the repo alone

> Note: promo/bundle `usage_count` accounting was implemented as part of this pass
> (migration `062` + checkout increment) and is intentionally **not** listed below.

## Summary (2026-09-16 audit)

| Section | ✅ Done | 🟡 Partial | ❌ Not done | Other |
|---|---|---|---|---|
| 1. Security & deployment | 0 | 1 | 4 | — |
| 2. Retention & notification | 6 | 1 | 7 | 1 unverified |
| 3. Future-products / homepage | 5 | 1 | 6 | — |
| 4. Product designer / 3D | 0 | 2 | 2 | — |
| 5. General hygiene | 2 | 0 | 0 | — |
| 6. Live DB follow-ups | 0 | 0 | 3 | 1 corrected, 2 informational |
| **Total** | **13** | **5** | **22** | **4** |

Highest-value open items: `npm audit` high CVE (§1.5), the migration-history baseline
(§1.1/§6.1 — blocks any future `db push`), the dead `ip` fallback removal (§1.4/§6.3), and
the unwired Shop All Preview editor JSX (§3.4).

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
    ❌ **NOT DONE.** `src/app/admin/(panel)/homepage/page.tsx` is 967 lines with `return (` at
   line 414; **every** `shopAllPreview` / `futureProductsNotify` reference sits at lines
   110–375 (state + `handleSave*` handlers only). No editor fields are rendered — same for the
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
   ❌ **NOT DONE.** `src/components/home/FutureProductsNotifyCard.tsx` has no `enabled` /
   `notify_form` reference at all — the card renders unconditionally. (The `/future-products`
   page does gate its form on `notifySettings.enabled`.)
9. Send `source` from the notify form + add email-based rate limiting (3/24h). ✅ **DONE.**
   `FutureProductsNotifyCard.tsx:48` sends `source: 'homepage_notify_card'`; the route enforces
   `future-products-email:<email>` at 3 per 24h (`api/future-products/route.ts:82-88`).
10. Decide/implement rich-text sanitization (Tiptap editor + server-side sanitize). ❌ **NOT
    DONE.** No Tiptap dependency or sanitize path found.
11. Add analytics events and wire into `HomepageProductGrid` + `FutureProductsNotifyCard`.
    ❌ **NOT DONE.** Zero analytics matches in either component.
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
