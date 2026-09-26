# September Implementation Plan

Consolidated list of open work, carried forward from the archived planning docs and the
September security review. Items are grouped by area, each noting its source.

**Every item below was re-verified against the working tree and the live database on
2026-09-16.** Each carries a status marker with the file/DB evidence used:

- ✅ **DONE** — verified present in code/DB
- 🟡 **PARTIAL** — some of the work is present, some remains
- ❌ **NOT DONE** — no evidence of the work
- ❓ **UNVERIFIED** — could not be confirmed from the repo alone

Three passes have been added since, each re-verified against the working tree on its date:

- **§7 — added 2026-09-19** from the first storefront UI audit (`UI_AUDIT.md`; evidence in
  `%TEMP%\rrs-shots3\`). Three existing items were re-classified or annotated: §3.8 → 🟡, plus
  notes on §3.4 and §3.11.
- **§8 — added 2026-09-24** from the second storefront pass (`UI_AUDIT_FINDINGS.md`; evidence in
  `%TEMP%\rrs-shots4|5|6\` — 8 routes × 3 viewports). It also re-classified §2.8 and §2.11 to 🟡.
- **§10 — added 2026-09-24** from a direct request made while shipping Google OAuth. Unlike §7–§9 this is a
  **planned removal + replacement** (admin key + emailed MFA → Google OAuth with an admin allow-list), so every
  item carries ❌/❓ and nothing was marked DONE **(updated 2026-09-26: §10.1–§10.7 verified DONE against the
  hosted project and a running build; §10.15 partial; §10.8–§10.14 remain ❌)**. Its original evidence was the working tree only, because the
  Supabase CLI was unauthenticated in the environment that wrote it; that half is available again, and
  §10.1/§10.2 were re-verified against the live database on 2026-09-26.

Statuses live inline on each item, and resolved findings are struck through in place — there is
no separate changelog to keep in sync.

**This file is the single source of truth for open work.** `UI_AUDIT.md` is the *method* (how the captures and
probes were taken, incl. §15.10's key trap); `UI_AUDIT_FINDINGS.md` is the *evidence* (per-finding detail, the
two measured route×viewport matrices in App. A / App. C, and the artifacts deliberately excluded in
App. B / App. D). Both are mirrored into §7–§9 here, so nothing actionable lives only in the findings doc —
where the two documents differ, **this file wins** (two counts were corrected here first, on 2026-09-24: §9.4
and §9.7).

## Summary (2026-09-16 audit; §7 added 2026-09-19; §8, §9 and §10 added 2026-09-24)

| Section | ✅ Done | 🟡 Partial | ❌ Not done | Other |
|---|---|---|---|---|
| 1. Security & deployment | 0 | 1 | 5 | — |
| 2. Retention & notification | 6 | 3 | 5 | 1 unverified |
| 3. Future-products / homepage | 5 | 2 | 5 | — |
| 4. Product designer / 3D | 0 | 2 | 2 | — |
| 5. General hygiene | 2 | 0 | 0 | — |
| 6. Live DB follow-ups | 0 | 0 | 3 | 1 corrected, 2 informational |
| 7. Storefront UI (added 2026-09-19) | 0 | 0 | 15 | 4 informational |
| 8. Storefront UI, 2nd pass (added 2026-09-24) | 0 | 0 | 9 | — |
| 9. Admin panel UI (added 2026-09-24) | 1 | 0 | 16 | 1 unverified area (interactions) |
| 10. Admin auth switch: MFA → Google OAuth (added 2026-09-24) | 7 | 1 | 7 | 2 deferred decisions |
| **Total** | **21** | **9** | **67** | **11** |

Highest-value open items: **the admin panel's blocking redirect is fixed** — the Edge verifier had been
deriving a different session-signing key than the signer, so *no* login could reach `/admin` (§9.1) — which
leaves the following as the top work: the storefront cookie banner rendering inside the panel and burying two
modules plus the `Accept` button at 1.67:1 (§9.2, same defect as §8.2), the panel's missing `main`
landmark/skip-link target (§9.3 + §9.6), the `/admin/homepage` editor scrolling sideways at every viewport
(§9.4), the muted-text contrast floor on both surfaces (§9.5 + §8.3), the panel's nameless switches/selects
(§9.7), the two conversion-blocking storefront contrast defects — the unreadable disabled state on
`Add to Cart` / `Pay with Square` (§8.1, and the same mechanism in the panel at §9.12) and the cookie
`Accept` button (§8.2) — plus the CSP block that disables **all** analytics (§7.1 — also blocks §3.11 before
any dashboard work is meaningful), the silent no-op section writes that will discard the Shop All Preview
editor's input (§7.3, a prerequisite for §3.4), the section-ordering refactor that finally makes `sort_order`
real (§7.2), `npm audit` high CVE (§1.5), the migration-history baseline (§1.1/§6.1 — blocks any future
`db push`), and the dead `ip` fallback removal (§1.4/§6.3). One further item outranks that list on **risk**
rather than user impact: **§10** retires the whole bespoke admin-auth stack — shared key, emailed MFA, custom
HMAC session cookie, plus §1.2's seeds, §1.4 and §1.6 — in favour of Google OAuth with an admin allow-list.
Until it lands, the panel keeps a shared secret, an audit log that cannot name the actor, and a "Sign out" that
does not revoke. **Updated 2026-09-26: the cutover has landed** (§10.1–§10.7 ✅) — the panel authenticates
with Supabase Auth, every panel action is attributed to a named admin, and the shared key plus emailed MFA are
off the request path entirely (their endpoints are deleted in §10.8–§10.12). What remains of §10 is removal
and hygiene, not exposure.

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
   from the repo. **→ Superseded in part by §10.13:** the three seed variables go away with the MFA switch;
   only the `NEXT_PUBLIC_SITE_URL` gap survives — and it is needed for the Google OAuth `redirectTo` anyway.
3. Add route-level regression tests for the Square checkout promo application and the new
   required-shipping validation (only pure helpers are unit-tested today). ❌ **NOT DONE.**
   `src/app/api/square/checkout/route.test.ts` does not exist, and there are **no** test files
   anywhere under `src/app/api/square/`.
4. Remove the dead legacy `ip`-column fallback in `src/lib/admin/mfa-store.ts` now that the
   live `admin_mfa_codes` table uses `challenge_token`. ❌ **NOT DONE.** Still present at
   `src/lib/admin/mfa-store.ts:137,140,178-180,203-207`. **→ Superseded by §10.8:** the file is deleted
   whole (the MFA code path it belongs to is removed), so repairing the dead fallback is no longer the plan.
5. Verify `npm audit --audit-level=high` passes locally (CI workflow exists). ❌ **FAILS.**
   One **high** severity advisory: `@xmldom/xmldom` 0.9.0-beta.1 – 0.9.11 (13 advisories:
   XML name/attribute/PI/DOCTYPE injection, ReDoS, quadratic parse/memory). `npm audit fix`
   offers a fix.
6. **Sign out clears the cookie but never revokes the session row, so a copied token survives
   logout.** ❌ **NOT DONE.** `AdminShell.tsx:154-157` signs out with
   `fetch('/api/admin/session', { method: 'DELETE' })`, and that handler
   (`src/app/api/admin/session/route.ts:122-140`) only overwrites the cookie with an empty value at
   `maxAge: 0` — it never calls `revokeAdminSession(jti)`. Revocation is reachable **only** via
   `POST /api/admin/sessions` (`revoke_one` / `revoke_others`,
   `src/app/api/admin/sessions/route.ts:32-73`), which is itself behind a full MFA session. Because
   `middleware.ts` cannot query the DB and `verifyAdminSessionToken`
   (`src/lib/admin/session.ts:150-173`) checks only `revoked_at` + `expires_at`, a copied
   `rr_admin_session` cookie keeps working on **every** panel page and admin API for the full
   remaining TTL (`DEFAULT_SESSION_TTL_SECONDS`, `session.ts:11` — 12 h unless storefront settings
   shorten it). So "Sign out" reads as revocation but is not one. The MFA hand-off compounds it:
   each `verify-mfa` mints a *second* row and leaves the pre-MFA row live (`session.ts:93-102`), so
   the table accumulates un-revoked rows that no logout can clear. Fix: in the DELETE handler,
   `extractJtiFromToken` the cookie and `await revokeAdminSession(jti)` before clearing it.
   Secondary: `session/route.ts` writes **no** audit entry for login or logout, while
   `sessions/route.ts:44-51,63-70` audits both revoke actions — a logout audit entry belongs there
   too. **→ Superseded by §10.10:** the custom session token (and this bug with it) is retired in favour of
   Supabase session cookies, where `signOut()` revokes the refresh token. The item stays open until §10.10
   lands — until then the fix above is still the correct stop-gap.

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
8. WCAG 2.2 AA audit + remediation across customer-facing routes. 🟡 **PARTIAL**
   (re-classified ❌ → 🟡 on 2026-09-24). The **audit** pass is now done for the storefront —
   8 routes × 3 viewports, with the findings and file-level fixes in `UI_AUDIT_FINDINGS.md`
   (evidence `%TEMP%\rrs-shots4|5|6\`). **Remediation** is open and itemised as §8.1–§8.3
   (contrast), §8.4 (target size) and §8.7 (outline/structure). Still uncovered: `/admin`, the
   product designer, Square's hosted checkout, and real-device rendering.
9. Cookie consent banner + consent persistence + policy wiring. ✅ **DONE.**
   `src/components/common/CookieBanner.tsx` + `src/lib/cookie-consent.ts`, mounted in
   `src/app/layout.tsx:88-89`, policy copy in `src/app/resources/content.ts`. **Defect found
   2026-09-24 (§8.2):** the Accept button is white on gold (2.81:1) and the fixed banner covers
   the checkout form below `sm`.
10. Structured data / SEO completion (Shop, category, PDP, Resources). ❌ **NOT DONE.** No
    evidence in the repo.
11. Mobile responsiveness regression + performance sweep. 🟡 **PARTIAL** (re-classified ❌ → 🟡 on
    2026-09-24). Responsiveness is now measured at 390 / 834 / 1440 across 8 routes with **zero
    horizontal overflow anywhere** and every target/label counted (`UI_AUDIT_FINDINGS.md` App. A),
    but that is capture-based only — no real-device pass, and no performance metrics (LCP / CLS)
    exist at all.
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
    saves and silently discards input. The rendered panels are Section Visibility, Hero Collage and the tile editors — but **none**
    for Shop All / Future Products (re-confirmed 2026-09-24). No editor fields are rendered — same for the
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
  ✅ **DONE** for §3.1/3.2/3.3 (§2 items 1/3/4/5/9/12 also verified resolved), and repeated for
  the storefront items on 2026-09-19 and 2026-09-24.

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
- `exp_admin_users` (migration `066`, applied 2026-09-26) is RLS-enabled with **0** policies and only
  `postgres` / `service_role` grantees; `set role anon` cannot read it (`42501`). It holds exactly one active
  row — the owner's Google account — and exactly one `auth.users` row carries
  `raw_app_meta_data->>'role' = 'admin'`.
- `exp_admin_audit_log` gained `actor_user_id` / `actor_email` (migration `067`, applied 2026-09-26); the table
  held **201** rows, none of them attributable.

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
4. ~~**Fix the local `.env` Supabase key.**~~ ✅ **CORRECTED — NOT A REAL ISSUE.** The finding
   was an artifact of probing `/rest/v1/` at the root with `select=*`; re-tested 2026-09-16 with
   real queries the `sb_publishable_…` key authenticates correctly (`exp_products` → `200` with
   the expected row, `exp_storefront_settings` → `200` with exactly the 3 allowed rows,
   `exp_promo_codes` → `200 []`), which also re-confirms DB-2/DB-4 at the anon-key/REST layer.
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
`%TEMP%\rrs-shots3\` (16 tiles + `audit.json`). The 2026-09-24 second pass (§8) widened this to
8 routes — including `/cart`, the PDP and `/checkout` — with a fresh tile set in
`%TEMP%\rrs-shots4|5|6\` and its findings in `UI_AUDIT_FINDINGS.md`. Re-run the harness in
`UI_AUDIT.md` §14 to re-verify. Items that extend an existing section are cross-referenced rather
than duplicated._

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
   §3.11.** The violation also fires on every dev/preview load (observed in all 24 captures of
   the second pass), so the dev console stays noisy and real errors hide behind it — allowlisting
   the origin in both branches fixes dev/prod parity in the same change.
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
   the CMS validator from free-form hex to a brand-hue enum so it cannot drift back. Second pass (2026-09-24): of the drifted accents only the violet fails contrast in place —
   the `Unique Pieces` chip (`ShopOrderPaths.tsx:47-50`) measures **3.34:1** while the gold and
   green chips in the same row pass (green 4.90:1) — so the chip pattern is sound and only its
   colour token needs lightening. See §8.3.
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
    those clicks leave the dev server — make them relative. Second pass: the URLs are still absolute, and both real tiles are `<a>` whose only child
    is an `<img alt="">`, so each link has **no accessible name** (WCAG 2.4.4 / 4.1.2) — see §8.6. The collage is also `lg`-only
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
    ("Shop preview" reads like internal jargon). See §2.8. Second pass: the sub-12px tier is wider than the eyebrows — 8 files use `0.65rem`
    (10.4px) for badges and counters, and the homepage alone renders 16 sub-12px nodes (see §8.5).
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

## 8. Storefront UI, second pass (added 2026-09-24)

_Source: `UI_AUDIT_FINDINGS.md` (findings + fix recipes) and `UI_AUDIT.md` (method). Evidence:
`%TEMP%\rrs-shots4\` (homepage), `%TEMP%\rrs-shots5\` (`/shop`, `/shop/all`, `/future-products`,
`/custom-orders`, `/cart`), `%TEMP%\rrs-shots6\` (sippy-cup PDP, `/checkout`) — 8 routes ×
3 viewports = 24 full-page captures + `audit.json`. Values below were read back from the live DOM
and the capture pixels, not only from the automated sweep: `UI_AUDIT_FINDINGS.md` §0 records the
three harness artifacts that had to be excluded first (gradient fills report a transparent
`background-color`, icon-bearing buttons are skipped by the text sampler, and the target counter
ignores the SC 2.5.8 spacing exception)._

**§9 (admin panel) shares three of these defects** — the cookie banner (§8.2), the muted-text tier (§8.3)
and the disabled-button gradient (§8.1) — so those three are best fixed once, across both surfaces.

**Verified good before this pass (the baseline to protect).** Part 1 of the findings doc opens with it, and it
is why the list below is short: **zero horizontal overflow** across all 24 captures (`hOverflow = 0` at
1440 / 834 / 390, including the 9,073 px mobile homepage and the 3,997 px mobile configurator); **zero** images
missing `alt`, **zero** broken images, **zero** unnamed buttons and **zero** unlabelled inputs; exactly one
`header` / `main` / `footer` landmark per route; a unique descriptive `<title>` per route; `lang="en"`; one
tokenised brand ramp declared once (`theme.ts:3-16`, consumed through `brandTokens`) with a global
`:focus-visible` ring and `prefers-reduced-motion` guards; and a homepage with a deliberate conversion
hierarchy (one CTA per section, only the hero and custom-request CTAs saturated above the fold). The measured
matrix behind those numbers is **App. A** of `UI_AUDIT_FINDINGS.md` and is *not* duplicated here.

**Not filed (verified pass — Part 1 App. B).** `Notify me` 1.06:1 and `Browse Shop` 1.03:1 (gradient-shorthand
artifact, §0.1 — really gold with dark labels, ≈7:1); the 23–26 "undersized" targets per route (the footer
column's 17 px rows sit on a **35 px pitch**, so they pass SC 2.5.8's spacing exception — `py: 0.5` on
`Footer.tsx:68` removes that reliance, see §8.4); the two text-less desktop anchors (real — filed as §8.6);
and the `2 → 6` / `3 → 6` footer-region heading skips (the same MUI `subtitle` mapping as §8.7). The
`Ruby's Relics` wordmark's 2.10:1 "failure" is *also* an artifact (`WebkitTextFillColor: 'transparent'` — it is
never painted), but it is still worth fixing for forced-colours users, so it is filed below as §8.9.

Critical:

1. **The disabled state of the primary CTAs is illegible *and* looks enabled.** ❌ **NOT DONE.**
   On the PDP (`ProductConfigurator.tsx:447-451`) the submit button is
   `MuiButton-containedPrimary` + `disabled` with `opacity: 1`; the theme's gradient keeps
   painting (`background-image`, `theme.ts:161`) while MUI's disabled rule only sets
   `background-color: rgba(255,255,255,0.12)`, and the label drops to `rgba(255,255,255,0.3)`.
   Composited over the gradient that is **≈1.4:1 (light end) to 1.8:1 (dark end)** — "Add to Cart"
   is effectively invisible on a button that still reads as the live gold action. The same
   combination governs `Pay with Square` (`CheckoutPageView.tsx:402`), `Checkout with Square`
   (`SquareCheckoutButton.tsx:56`), `Submit Request`, `Clear Cart` and `Calculate Shipping`, and
   the only explanation offered is a 12px caption at 3.16:1 (`ProductConfigurator.tsx:456`).
   Fix: stop the **gradient**, not the label, in the disabled branch; codify one `&.Mui-disabled`
   token in `MuiButton.styleOverrides.root` (`theme.ts:151`); link the caption to the button with
   `aria-describedby`. Snippet in `UI_AUDIT_FINDINGS.md` §C1.
2. **The cookie `Accept` button is white on gold (2.81:1) on every page — and the banner covers
   the checkout form.** ❌ **NOT DONE.** `CookieBanner.tsx:130-131` hard-codes `color: '#fff'` on
   `background: brandTokens.forgeGold`; the theme already defines the correct
   `primary.contrastText` (`#0C0A07`, **7.03:1**). It is the lowest-contrast visible text on the
   site and it appears in **24/24** captures, because the banner only dismisses permanently once a
   choice is stored. The three buttons also measure 31px tall, and the `position: fixed; bottom: 0`
   bar (`CookieBanner.tsx:74-79`) overlaps the Street / City / ZIP fields on `/checkout`.
3. **The muted-text floor is systemic (2.72–4.36:1), and it is the instruction text.** ❌ **NOT
   DONE.** `alpha(parchment, 0.35…0.5)` is the de-facto helper-text tier: `0.35` = **2.72:1**
   (configurator art-slot help), `0.40` = **3.16:1** (`ProductConfigurator.tsx:456`,
   `shop/categories/[slug]/page.tsx:340`, file-input "No file chosen"), `0.45` = **3.72:1**
   (`app/shop/page.tsx:235`), `0.46–0.50` = **4.35–4.36:1** (`ProductConfigurator.tsx:371`,
   `app/shop/page.tsx:307`, cart-empty copy, the four `/shop` trust captions) — all at 10.4–12px,
   so no large-text allowance applies. Fix: adopt one floor, `alpha(parchment, 0.62)` (≈5.9:1) or
   the existing `parchmentMuted` token `#9E8A6A` (5.93:1), and lighten the two tinted chip labels
   (red `#E0706F`, violet `#B98BE0`) rather than raising the tints. Cross-refs: §7.7 and the NSFW
   line in §7's informational block (3.53:1).

High:

4. **Two inline links sit below the 24px minimum target.** ❌ **NOT DONE.** Measured at 390×844,
   the only non-footer targets under 24px are the banner's `Cookie policy` link (84×17,
   `CookieBanner.tsx:97-102`) and — desktop/tablet only — the announcement CTA `Shop Drinkware`
   (107×16, `AnnouncementBanner.tsx:78-90`). The 23–26 "undersized" flags per route are almost all
   the footer column (17px rows on a **35px pitch**), which passes SC 2.5.8 through the spacing
   exception — `py: 0.5` on `Footer.tsx:68` removes that reliance.
5. **The sub-12px type tier is wider than the eyebrows.** ❌ **NOT DONE.** Extends §7.12: besides
   the `overline` (0.7rem), 8 files use `0.65rem` (10.4px) for badges and counters
   (`ShopOrderPaths.tsx:100`, `app/shop/page.tsx:235`, `FreshFromTheForge.tsx:122,137`,
   `MaterialsTeaser.tsx:156`, `ProcessStrip.tsx:145`, `shop/categories/[slug]/page.tsx:340`,
   `Header.tsx:231`), and the homepage alone renders 16 sub-12px nodes. The same single theme edit
   fixes both.

Medium:

6. **The hero-collage tiles have no accessible name.** ❌ **NOT DONE.** Extends §7.11: both real
   tiles are `<a>` whose only child is an `<img alt="">` (`HeroCollage.tsx:157-178`), so the link
   announces as just "link" (WCAG 2.4.4 / 4.1.2). Give each an explicit
   `aria-label={image.alt || 'View product'}` — and make those `href`s relative, which is the same
   item.

Low:

7. **Stray `h6` headings and level skips from MUI's `subtitle` mapping.** ❌ **NOT DONE.**
   `<Typography variant="subtitle1">` renders `<h6>` unless `component` is set, so the homepage
   product grid emits a **price** as `h6` directly under the card's `h3` (a level skip), and six
   footer-region link labels are headings too. **All 13 `subtitle1|2` usages in `src/` omit
   `component`** — `HomepageProductGrid.tsx:191`, `ResourcesTeaser.tsx`, `FaqPreview.tsx`,
   `FreshFromTheForge.tsx`, `CartPageView.tsx`, `SearchModal.tsx` (×2), `ProductDesigner.tsx`
   (×2), `admin/…/catalog/products/[id]/builder/page.tsx` (×4). Add `component="span"` (or `"p"`).
8. **Mobile funnel length.** ❌ **NOT DONE.** At 390×844 the homepage is **9,073px** (≈10.7
   screens, 9 sections, 65 focusables) with the "Want early access?" notify form as the **ninth**
   section — roughly nine swipes to the highest-intent action on the page, which has a working API
   behind it. The PDP is 3,997px with `Add to Cart` far below the fold. Consider moving the notify
   card above the "browse by craft" grid on `<md`, trimming the 3-up starter row on small screens,
   and a sticky `Add to cart — $13.00` bar on `<md`.

9. **The `Ruby's Relics` wordmark declares no `color`, so forced-colours mode drops the gold fill.** ❌ **NOT
   DONE.** `Header.tsx:133-149` and `Footer.tsx:112-124` paint the wordmark with `background-clip: text` +
   `WebkitTextFillColor: 'transparent'`, so its computed `color` falls back to the UA default link blue
   (**2.10:1**, flagged in all 24 captures) — harmless in normal mode because it is never painted, but in
   Windows High Contrast / forced-colours the fill is dropped and the wordmark renders as default blue. Fix:
   add `color: brandTokens.forgeGold` to both wordmarks. Carried up from Part 1 App. B, which listed it as
   "still worth fixing" rather than a filed defect.

Severity at a glance (Part 1 `UI_AUDIT_FINDINGS.md` §4, mapped to the items above):

| # | Finding | Severity | Reach | Effort | Here |
|---|---|---|---|---|---|
| C1 | Disabled primary CTAs at 1.4–1.8:1 **and** they look enabled | High | every PDP, cart, checkout | S | §8.1 |
| C2 | Cookie `Accept` 2.81:1; banner overlays the checkout form | High | 100% of first-time visitors | XS | §8.2 |
| C3 | Muted-text floor 2.72–4.36:1; violet chip 3.34:1 | Medium-High | PDP, `/shop`, `/cart` | S (sweep) | §8.3 |
| P1 | Collage tiles: nameless links + absolute production hrefs | Medium | homepage (desktop) | S | §8.6 |
| P2 | Inline-link hit targets (2 elements) | Low | homepage / global | XS | §8.4 |
| P3 | Sub-12px type tier (10.4px badges, 11.2px overlines) | Low | site-wide | S | §8.5 |
| P4 | Prices and footer labels emitted as `h6` + level skips | Low | homepage + 8 files | S | §8.7 |
| P5 | Mobile page length **+** CSP/console noise | Low | mobile, dev console | M / XS | §8.8 **+** §7.1 |
| App. B | Wordmark declares no `color` (forced-colours only) | Low | header + footer | XS | §8.9 |

## 9. Admin panel UI, first pass (added 2026-09-24)

_Source: `UI_AUDIT_FINDINGS.md` **Part 2** (findings + fix recipes) and `UI_AUDIT.md` **§15** (method, incl.
the new §15.10 key trap). Evidence: `%TEMP%\rrs-admin\` — 23 `/admin` routes × desktop 1440 / tablet 834 /
mobile 390 = **69 full-page captures** + `audit.json` + `summary.txt` (matrix + aggregates) +
`probe-*.json` / `a11y-*.json` (live-DOM probes). The panel was audited **authenticated** with the dev-token
method; one blocker had to be fixed before a single page could be captured (§9.1). Numbers below were read
back from the live DOM and the capture pixels, not only the automated sweep. Two counts below were corrected
on re-read (2026-09-24 — see §9.4, §9.7); in §9.7 the sweep undercounts bare switches, so the live-DOM probe
wins those ties. Route coverage:
`ADMIN_MODULES` in `src/app/admin/(panel)/layout.tsx` plus the nested catalog pages._

**Method notes that changed the answer (mirrored from Part 2 §0).** (1) The gradient-shorthand artifact applied
again: panel CTAs reported **1:1–1.37:1** because `background-color` is transparent (`Add Product`,
`Save Product`, `Create Category`, `Run Recovery Reminders`, `Save Visibility`, …) — verified gold fill with a
`#0C0A07` label, ≈**7:1**, not filed. (2) The cards use the same shorthand, so the contrast walker fell through
to the page void `#0C0A07` and **missed** the sub-12px muted text (it scored 5.7:1); pixel-sampling the sidebar
card gives the real backdrop **(27,21,15)** → **4.06:1**, which is the filed value in §9.5. (3) MUI internals are
not defects: `MuiSelect-nativeInput` is `aria-hidden` + `tabindex="-1"` and the autosize textarea is
`visibility: hidden` — what matters is the *visible* `role="combobox"`, which is unnamed (§9.7). (4) A minted dev
token only works once **both** gates agree — see §9.1. (5) `Page.captureScreenshot {captureBeyondViewport:true}`
paints sticky/fixed elements at their *viewport* offsets, so the admin bar can look "inside" a tall page (a
capture artifact, Part 2 §0.5); §9.2's banner occlusion was proven separately with `elementFromPoint`.

**Verified good (69/69 captures).** Every capture authenticated with no redirect and the 12-item module nav
present (`sessionLost = 0`); every `/api/admin/*` request answered `200` (0–14 per page, **192 of 192**, no
`401`, no `5xx`) with **zero runtime exceptions**; **zero broken images and zero images without `alt`**: one
`header` + one `aside` + one content `section` per page with no storefront chrome leaking in (`footer: 0`
everywhere), and the panel's only table (`/admin/abandoned-carts`) carries `scope` on all four `<th>`; the brand
system carries into the panel intact (gold gradient CTAs with `#0C0A07` labels ≈7:1, Cinzel page titles, the
focus ring inherited from the global rules rather than re-declared — `globals.css:40`, `theme.ts:141,155`); and
the empty states that do exist are honest, with the dashboard's four zero tiles checked against the database
rather than assumed (`exp_custom_requests` holds 2 rows, both `cancelled`; `exp_orders` is empty). Part 2's §1.3
is the source; the one exception found on re-read is §9.15.

**Behaviours never exercised — unverified, not verified-good.** This pass was read-only: no clicks, dialogs,
drag-reorder or save round-trips. So it remains **unverified** that each editor's `Save` writes what the form
shows, that `Delete` / `Archive` confirm before acting, that the homepage reorder buttons work from the
keyboard, and what the panel renders when an admin API call fails. An interaction pass needs a disposable test
row plus the CSRF header `AdminCsrfFetchBridge` supplies (`UI_AUDIT.md` §15.6).

**Fixed during the pass:**

1. **The Edge verifier derived a different session-signing key than the signer, so the panel was
   unreachable.** ✅ **DONE.** `verifyTokenEdge` (`src/middleware.ts`) used
   `crypto.subtle.deriveKey(… HMAC-SHA-256 …)`; for HKDF→HMAC that defaults to the hash **block** size
   (**64 bytes**) while `session.ts:27-29` signs with a **32-byte** `hkdfSync` output. A prefix is not the
   same key, so every token minted by `createAdminSessionToken` — i.e. **every real login** — was rejected:
   `/admin/*` returned `307 → /admin/login` while the auth-exempt `GET /api/admin/session` still answered
   `{"authenticated":true}`. The documented dev-token method failed identically, which is how it surfaced.
   Now `deriveBits(…, 256)` + `importKey('raw', …)`; verified `200` on `/admin`, `/admin/orders`,
   `/admin/catalog/products` with the module nav rendered, and `npm run type-check` clean. Protocol detail in
   `UI_AUDIT.md` §15.10 — **any** change to session signing must keep both derivations byte-identical.

Critical:

2. **The storefront cookie banner renders inside the panel and covers the module rail.** ❌ **NOT DONE.**
   `CookieBanner` lives in the root layout (`app/layout.tsx:89`), so it is `position: fixed; bottom: 0;
   zIndex: 2000` (`CookieBanner.tsx:74-79`) over *every* admin page: at 1440×900 its rect is
   `top 813 / height 87` and `elementFromPoint` on the "Abandoned Carts" and "Homepage" module links returns
   the banner's own paragraph — two of twelve modules are unclickable until a *storefront* consent bar is
   dismissed. (On `/admin/login` the same fixed bar does **not** overlap the form — measured — so the damage
   is specific to the panel shell.) Its `Accept` button measures
   **1.67:1** (white on solid `#C4921A`) and all three buttons are 31 px tall. Same defect as §8.2 with a
   second blast radius — fix both in one change (skip the banner under `/admin`, `color:
   'primary.contrastText'`, ≥44 px on touch).
3. **"Skip to main content" has no target on any panel page.** ❌ **NOT DONE.** The root layout's
   `SkipToMain` points at `#main-content` (`SkipToMain.tsx:10`), which exists on every storefront page and on
   **none** of the 23 panel pages (`AdminShell` renders `aside` + `section`, no `main`, no id). It is the
   first focusable element on every admin page and does nothing (WCAG 2.4.1). Fix: make the shell's content
   column `component="main" id="main-content"` — one attribute, which also supplies the missing landmark
   (§9.6).
4. **Four routes scroll the whole document sideways.** ❌ **NOT DONE.** `scrollWidth − clientWidth`:
   `/admin/homepage` **140 px desktop, 443 px tablet, 308 px mobile**; product detail **123 px** and builder
   **129 px** at 390 px; `/admin/abandoned-carts` **104 px** at 390 px; the other 19 routes are 0. Cause
   (hide-and-measure): flex/grid children keep the default `min-width: auto`, so a 536 px description +
   switch row (and 469 px media/filename rows on the product pages) sets a floor wider than the viewport.
   Fix: `minWidth: 0` on the shell grid children (`AdminShell.tsx:326`) and the editor rows, plus
   `overflowWrap: 'anywhere'` on descriptions/filenames/URLs. The CMS editor is unusable at 834 px until this
   lands. Count corrected (2026-09-24): the heading read **Five**; the six non-zero rows above cover **four**
   routes — `/admin/homepage` (all three viewports), product detail, builder and `/admin/abandoned-carts` —
   which is what `summary.txt`'s overflow tally, `UI_AUDIT_FINDINGS.md` App. C and this item's own "other 19
   routes" arithmetic all give.

High:

5. **The panel's whole muted-text tier fails contrast, plus the status chips and destructive buttons.**
   ❌ **NOT DONE.** Module descriptions at **11.2px** / `alpha(parchment, 0.52)` = **4.06:1** (pixel-verified
   against the sampled card backdrop `(27,21,15)`; the sweep's 5.7:1 was the gradient artifact);
   `parchmentMuted` stat labels (`/admin/catalog`) **3.46:1**; `Pending` chips **1.84:1**; `Delete` **2.5:1**
   (white on `#CF4040`) and **3.41:1** (red on card); banner labels 4.15–4.28:1. Same systemic pattern as
   §8.3 — one theme/token change covers both surfaces. Raise the description tier to ≥12px too.
6. **No `main`, no `nav`, no announced current page.** ❌ **NOT DONE.** Landmarks measure
   `header 1 / aside 1 / section 1 / main 0 / nav 0 / footer 0` on all 69 captures; the 12 module links are
   plain anchors in an unnamed `aside` with **no `aria-current`**; the active state is colour-only
   (`borderColor rgba(196,146,26,0.45)`, `backgroundColor rgba(196,146,26,0.12)`) and it **vanishes** on the
   nested catalog routes because the check is `pathname === mod.href` (`AdminShell.tsx:338`). Fix:
   `component="nav" aria-label="Admin modules"`, `aria-current="page"`, and
   `pathname === href || pathname.startsWith(href + '/')`.
7. **Nameless controls everywhere.** ❌ **NOT DONE.** **17** `MuiSwitch-input` toggles on `/admin/homepage` with
   no `aria-label`, no `aria-labelledby` and no wrapping label (their only name is adjacent, unassociated
   text); every MUI filter `Select` (orders, catalog, inventory, finance, catalog-pricing) has
   `aria-labelledby: null` on its visible `role="combobox"`; the header search input is placeholder-only on
   all 23 routes; four 26×26 reorder icon buttons have no name at all. Fix: `FormControlLabel` per switch,
   `InputLabel`/`labelId` per select, `aria-label` on the search field and the icon buttons. Count corrected
   (2026-09-24): this read **15**. The visibility grid renders one **bare** `<Switch>` per `SECTION_ORDER` key,
   and that array holds **17** keys (`src/app/admin/(panel)/homepage/page.tsx:30-48` → `:456-515`, the
   `<Switch>` at `:507`), so the count is structural, not data-dependent; `a11y-homepage.json` agrees —
   **17** nameless controls, all `MuiSwitch-input`, all `72x24` — while `summary.txt`'s per-route sweep says
   **15** and so missed two. The two `FormControlLabel`-wrapped switches on the same page (`:553` Hero Collage,
   `:742` tile editor) *are* named; copy that pattern.
8. **No regression test for the §9.1 key contract.** ❌ **NOT DONE.** Sign a payload the way `session.ts`
   does and assert the Edge verifier accepts it — Node can reproduce the Edge derivation with
   `crypto.subtle.deriveBits(…, 256)`, which is exactly the cross-check that found the bug. Without it the
   next refactor of either side silently locks the owner out of the panel again.

Medium:

9. **On a phone the panel spends 906 px on chrome before content.** ❌ **NOT DONE.** At 390×844 the sticky
   `header` is 118 px and the module rail is 788 px, so the content `section` starts at **y = 943** — all 12
   modules stack above the page below `md` (`AdminShell.tsx:326`). Fix: collapse the rail into a disclosure
   or Drawer below `md` and show the current module in the trigger.
10. **One `<title>` for 23 routes, and a hard-coded header label.** ❌ **NOT DONE.** Every capture reports
    `title = "Ruby's Relics Studio"` (the root-layout default; the storefront pass had a unique title per
    route), so tabs/history/bookmarks are indistinguishable, and the sticky bar always reads "Admin
    Dashboard" (`AdminShell.tsx:176`) even on `/admin/homepage`. Fix: per-route metadata plus the active
    module label in the header (`pathname` is already available in the shell).
11. **Heading structure is absent or inconsistent on 23/23 routes.** ❌ **NOT DONE.** No `h1` on
    `/admin/schedule`, `/admin/abandoned-carts`, product detail, product pricing or `/admin/shipping/debug`;
    `/admin/homepage` goes `h1` → `h6` for its five section titles; product detail starts at `h6`; the `h1`
    renders at 30 / 24 / 20 px across routes. Root cause of the `h6`s is §8's item 8
    (`Typography variant="subtitle1|2"` without `component` — the file list already includes
    `admin/…/catalog/products/[id]/builder/page.tsx` ×4), so the admin editor pages need the same pass.
12. **Disabled actions still look like the live gold action.** ❌ **NOT DONE.** `Apply to 0 selected`
    (`/admin/inventory`, 1039×45) keeps the gold `background-image` with `color: rgba(255,255,255,0.3)` and
    `opacity: 1` (≈2:1); `Add Media` / `Upload file` are 30 %-white on card. Same fix as §8.1's
    `&.Mui-disabled` token (extend it to `MuiIconButton`), plus a label that states the precondition
    ("0 selected — select rows to apply").

Low:

13. **Empty states and notices are emitted as duplicated `role="alert"`.** ❌ **NOT DONE.** Each string
    renders twice (`No orders matched the current filters.`, both inventory messages, the Shippo test-mode
    notice, the shipping-debug warning), so an assertive live region interrupts twice for static content —
    render once, as plain text or `role="status"`.

Follow-ups filed on the 2026-09-24 re-read (same evidence set, source-verified):

14. **(High, a11y) Nine catalog routes ship a nameless icon-only back link — and on six of them it is a
    full-width target.** ❌ **NOT DONE.** `catalog/{products,categories,processes,future-products,`
    `future-product-statuses}/page.tsx` and `catalog/products/new/page.tsx` all render
    `<IconButton component={Link} href="/admin/catalog"><ArrowBack /></IconButton>` with **no** `aria-label`,
    **no** visible text and no tooltip, so the accessible name is empty (WCAG 4.1.2 / 2.4.4). The same bare
    glyph also means two different destinations — five sites go to `/admin/catalog`, two to
    `/admin/catalog/products`. Further, in those six files the button is a **direct child of a `display: grid`
    `Box`**, so `justify-self: stretch` widens it to the whole content column while MUI's
    `inline-flex; justify-content: center` centres the 24 px arrow inside it: the entire row becomes clickable
    and the arrow floats mid-page above a left-aligned title (visible in
    `04-catalog-products-00-desktop-tile-01.png`). `catalog/products/[id]/layout.tsx:17-22` wraps the same
    control in an extra `<Box>`, so product detail / builder / pricing keep a normal left-aligned 32×32 target —
    same component, two behaviours. Fix: `aria-label="Back to catalog"` (or a labelled text button) **and**
    `justifySelf: 'start'` so the hit area matches the glyph. §9.7 covers the four 26×26 reorder buttons on
    `/admin/homepage`; this adds nine routes.
15. **(Low) `/admin/finance`'s "Labor Stage Breakdown" card has no empty state.** ❌ **NOT DONE.**
    `finance/page.tsx:400-420` renders the card heading and then an unconditional `finance.laborByStage.map(...)`
    — no `length === 0` branch, unlike its two siblings (`:370` guards `itemContributions` with "No contribution
    rows for this range.", and the recent-labor card is guarded as well). With zero labor rows the card is a
    silent blank box: in the 2026-09-24 capture it collapses to its title (~70 px) while `Item Contribution View`
    beside it shows title + column headers + empty-state line (~115 px). This is the single exception to
    Part 2 §1.3's honest empty states. Fix: a `laborByStage.length === 0` branch in the muted tier
    (`alpha(parchment, 0.55)`, ≥12px per §9.5's floor).
16. **(Low) `/admin/custom-requests`: the primary toolbar CTA wraps to three lines.** ❌ **NOT DONE.** The
    toolbar is a 4-control `Stack` (`custom-requests/page.tsx:426`) and the "Run Recovery Reminders" button
    (`:454-460`) sets no `whiteSpace: 'nowrap'` / `minWidth`, so at 1440 px it renders as "Run / Recovery /
    Reminders" on three lines, ≈93 px tall beside 53 px siblings
    (`01-custom-requests-00-desktop-tile-01.png`). Its label also swaps to "Sending reminders..." while
    running, so the toolbar's height changes mid-action. Fix: `whiteSpace: 'nowrap'` + a `minWidth`, or shorten
    the label and carry the count elsewhere.
17. **(Low) `/admin/custom-requests`: request cards are titled with a raw UUID.** ❌ **NOT DONE.**
    `custom-requests/page.tsx:499-501` makes `{row.id}` the card's bold title, so the most prominent text on
    each card is a 36-character UUID while the customer's identity sits in the dimmer second line. The
    codebase's own convention is better: `abandoned-carts/page.tsx:219` renders `{row.id.slice(0, 8)}…`. Fix:
    lead with the customer name/email and demote a truncated id to a monospace caption.

Ideas (not defects — `UI_AUDIT_FINDINGS.md` Part 2 §5): link the four dashboard tiles to their filtered
lists; add `Ctrl/⌘-K` + an `aria-label` to global search; sticky save bars for the 5,353 px `/admin/homepage`
editor; one shared, labelled filter-bar component across the list pages; and say *why* a control is disabled
rather than only restyling it (§9.12).

Severity at a glance (Part 2 `UI_AUDIT_FINDINGS.md` → "Severity (admin pass)", mapped to the items above):

| ID | Finding | Severity | Blast radius | Effort | Here |
|---|---|---|---|---|---|
| A1 | Edge verifier vs signer key mismatch → **panel unreachable** | Critical | 100 % of admin logins | S | ✅ **fixed** — §9.1 |
| A2 | Storefront cookie banner inside the panel: covers 2 modules, `Accept` 1.67:1, 31 px buttons | High | all 23 routes | S | §9.2 |
| A3 | "Skip to main content" has no target (no `main` on 23 routes) | High (a11y) | all 23 routes | XS | §9.3 |
| A4 | Document scrolls sideways (homepage editor at **all** viewports; 3 pages at 390 px) | High | **4 routes** | S | §9.4 |
| A10 | Muted tier 3.46–4.06:1, `Pending` 1.84:1, `Delete` 2.5:1 | High | all 23 routes | S (theme) | §9.5 |
| A8 | No `main`/`nav` landmark, unnamed `aside`, no `aria-current`, marker lost on nested routes | Medium-High | all 23 routes | XS | §9.6 |
| A9 | Nameless controls: **17** switches, all filter `Select`s, search field, icon buttons | Medium-High | 17 switches + selects/search/icons, over 9 routes | S | §9.7 |
| A5 | 906 px of chrome before content on a phone (118 header + 788 rail) | Medium | ≤`md` | M | §9.9 |
| A6 | One `<title>` for 23 routes; header label always "Admin Dashboard" | Medium | all 23 routes | XS | §9.10 |
| A7 | No `h1` on 5 routes, `h1→h6` skip, three different `h1` sizes | Medium | all 23 routes | S | §9.11 |
| A11 | Disabled actions keep the gold gradient with a 30 %-white label | Medium | 4 routes | XS (same as §8.1) | §9.12 |
| A12 | Empty states emitted as duplicated `role="alert"` | Low | 4 routes | XS | §9.13 |

Two groups have no counterpart ID in the findings doc because they were filed here rather than there: **§9.8**
(the §9.1 key-contract regression test, written up during the pass) and **§9.14–§9.17** (the 2026-09-24
re-read). The "Effort" column is a reuse hint, not an estimate — §9.12 is the panel half of §8.1 and must ship
with it.

**Not filed (Part 2 App. D, mirrored).** The 1:1 / 1.37:1 gradient flags (§0.1 — they pass at ≈7:1); the
12 (16 / 30) sub-12px entries on every page, which are the *same* 11.2 px module description counted once per
capture and are therefore filed **once**, as §9.5; `MuiSelect-nativeInput` (`aria-hidden`, `tabindex="-1"`) and
the `visibility: hidden` autosize textarea (MUI plumbing, §0.3); the 0×0 `input[type=file]` with no accessible
name (the visible control is the labelled button, and the homepage's six file inputs sit inside `<label>`s); the
26×26 icon buttons (26 px clears SC 2.5.8 and disabled controls are exempt — only their *names* are filed,
§9.7); the `/favicon.ico` 404 and the CSP-blocked `va.vercel-scripts.com/v1/script.debug.js` (expected in this
environment, documented in `UI_AUDIT.md` §15.6); the sticky admin bar "appearing" mid-page in tall mobile tiles
(a `captureBeyondViewport` artifact, §0.5); `Add Media` measuring 469 px in a 390 px viewport (that is one of
§9.4's *causes*, so §9.4 fixes it rather than filing a separate sizing defect); the dashboard's four `0` tiles
(checked against the database — honest numbers); and `3 pre-checkout pending` reading like a sentence fragment
(copy nit, no source-level defect).

---

## 10. Admin authentication switch: key + email MFA → Google OAuth (added 2026-09-24)

_Source: direct request — "remove everything related to MFA logging into the admin panel and replace it
with Google OAuth; only allowed accounts pass; customers do not sign up, only admins." This section is the
plan of record for that work; `docs/GOOGLE_AUTH_SUPABASE.md` §1/§8 describe the behaviour **today** (admin
key + MFA retained) and must be rewritten as part of §10.15._

**Scope.** Replace the bespoke admin login (`ADMIN_LOGIN_KEY` → emailed 6-digit code → HMAC
`rr_admin_session` cookie) with Google sign-in through the Supabase Auth stack built for the storefront. A
Google account only reaches `/admin` when it is on an explicit allow-list. Customer accounts are **not** in
scope: nothing in the storefront changes.

**Status: 🟡 IN PROGRESS — the cutover has landed.** §10.1–§10.7 are **✅ DONE**, verified against the hosted
project and (for the fail-closed half) against a running production build on 2026-09-26; §10.15 is 🟡 (its
additions landed, its deletions belong with the code they cover); §10.8–§10.14 remain ❌ and are pure
removals, plus the two open decisions (§10.16/§10.17). The panel now authenticates with Supabase Auth: the
bespoke HMAC cookie, the shared key and the emailed-MFA step are **no longer on any request path** — the
files still compile and ship until §10.8–§10.12 delete them, so the remaining risk is clutter, not exposure.
The Supabase CLI **is** authenticated in this environment (`supabase --version` 2.118.0; `db query --linked`
works), so the live-database half of this plan's convention is checkable and was used throughout. §10.7's
columns were applied early (migration `067`). Both tables §10.12 will drop still exist and held
**1** `admin_mfa_codes` row and **28** `exp_admin_sessions` rows on 2026-09-26 — re-check immediately before
dropping.

### 10.0 Decision record — what is removed, what replaces it

| Concern | Today | After the switch |
|---|---|---|
| Credential | `ADMIN_LOGIN_KEY` shared secret (`lib/admin/auth.ts:34`) | Google account sign-in (`signInWithOAuth`) |
| Second factor | emailed 6-digit code (`lib/admin/mfa-store.ts:107`) | **none** — the admin's Google account security is the only factor (see §10.16) |
| Session | custom HMAC token `v2.exp.jti.mfaFlag.sig` in `rr_admin_session` (`lib/admin/session.ts:6,10`) | Supabase Auth cookie (`@supabase/ssr`), PKCE, JWT expiry + refresh rotation |
| Who may enter | anyone holding the key | allow-listed `auth.users.id` rows in `exp_admin_users` (§10.1), mirrored into `app_metadata.role` for the edge gate |
| Revocation | `exp_admin_sessions.revoked_at` per JTI (`lib/admin/session.ts:188`) | `exp_admin_users.is_active` / `revoked_at` re-checked per request (§10.3) + Supabase global sign-out (§10.17) |
| Edge gate | HMAC re-verification + `mfaFlag='1'` (`middleware.ts:202,233`) | `getClaims()` + `app_metadata.role === 'admin'` (§10.5) |
| Audit trail | actor is **unknown** — every admin shares one key (`lib/admin/audit.ts:16`) | per-admin `actor_user_id` + `actor_email` (§10.7) |

**Trust model (two gates, deliberately).** The edge gate reads a JWT claim (no DB access, so it stays
Edge-safe, mirroring today's `mfaFlag` check). The route/server gate re-checks `exp_admin_users` in Postgres
and stays the **revocation authority** — a JWT is valid until it expires, so a claim-only check would let a
revoked admin keep working for up to the access-token lifetime. This is the same split the current code
documents (`middleware.ts:229-232`), so the architecture does not regress.

**Why `app_metadata`, never `user_metadata`.** `raw_user_meta_data` is user-writable and therefore unsafe for
authorization. The role claim is written with the service role into `raw_app_meta_data`
(`auth.admin.updateUserById(id, { app_metadata: { role: 'admin' } })` — confirmed present in the installed
`@supabase/auth-js`), per the Supabase security checklist.

**Keying is by `user_id`, not email.** Email is stored for display and audit only. Auto-granting on an email
match would be an account-takeover path, so a second Google account for the same human is an explicit,
audited action (§10.2). An email change on the admin's Google account therefore neither grants nor revokes
access.

**Unchanged on purpose.** `requireCsrf` / `requireCsrfLenient`, the double-submit token and
`AdminCsrfFetchBridge` stay exactly as they are: the auth mechanism changes, the CSRF model does not. The
`/admin/*` + `/api/admin/*` route-pattern regression test (`lib/admin/auth-route-pattern.test.ts`) must stay
green throughout — it is the safety net for §10.3.

### 10.1–10.7 — Build

1. **§10.1 Admin allow-list table `exp_admin_users`.** ✅ **DONE** — verified against the hosted project
   2026-09-26. **Artifact:** `supabase/migrations/066_admin_users.sql`, which is this item's
   proposed schema verbatim — `user_id uuid primary key references auth.users(id) on delete cascade`,
   `email text not null`, `role text not null default 'admin'`, `is_active boolean not null default true`,
   `created_at`, `created_by text`, `last_login_at`, `revoked_at timestamptz` — plus `ENABLE ROW LEVEL
   SECURITY`, `REVOKE ALL … FROM anon, authenticated`, `GRANT ALL … TO service_role` and no policies: the same
   lockdown shape as `exp_admin_sessions` (`045_admin_sessions.sql:22-26`) and the archived verification docs
   (`docs/archive/verification/00_TABLES.md`). Numbered **066, not 065**, because §6.2 already claims `065`.
   **Apply path:** `db push` remains blocked by §1.1, so apply it with `npx supabase login` and then run the
   file's contents through `npx supabase db query --linked` (or paste it into the dashboard SQL editor); until
   §1.1 is repaired the migration stays untracked in `supabase_migrations.schema_migrations`, exactly like
   059–064. `docs/Database.md` gained the table reference.
   **Live verification (`db query --linked`, 2026-09-26):** 8 columns; `relrowsecurity = true`; `policies = 0`;
   the only grantees are `postgres` and `service_role` (no `anon` / `authenticated` rows at all); the FK is
   `exp_admin_users_user_id_fkey → auth.users` with `confdeltype = c` (on delete cascade); and
   `set role anon; select count(*) from exp_admin_users` returns
   `42501: permission denied for table exp_admin_users` — the public key cannot read the allow-list.
2. **§10.2 Grant / revoke tooling (incl. the bootstrap).** ✅ **DONE** — shipped and run 2026-09-26. Before this,
   nothing created an admin identity — `ADMIN_LOGIN_KEY` *is* the identity. The tooling finds the `auth.users`
   row by email, upserts `exp_admin_users`, then sets `app_metadata.role='admin'` via
   `auth.admin.updateUserById` so the edge claim gate (§10.5) agrees with the DB gate (§10.3); the matching
   `revoke-admin.mjs` sets `is_active=false` / `revoked_at=now()` **and** clears the claim. The bootstrap case
   (no admin exists yet) is service-role only — never a web form, or the first admin becomes an
   unauthenticated write. **Artifacts:** `scripts/lib/admin-allowlist.mjs` (env loading + service-role client
   mirroring `scripts/test-rls-lockdown.mjs`, `findAuthUserByEmail()` paging `auth.admin.listUsers()` since
   there is no get-user-by-email, `grantAdmin()`, `revokeAdmin()`), the thin CLIs `scripts/grant-admin.mjs` /
   `scripts/revoke-admin.mjs`, npm scripts `admin:grant` / `admin:revoke`, and the README and `docs/Database.md`
   entries. `grantAdmin()` spreads the existing `app_metadata` before adding the role so `provider` /
   `providers` survive, and `revokeAdmin()` writes `role: null` rather than deleting the key, which holds
   whether the Auth server merges or replaces `app_metadata`. **Practical bootstrap caveat:** the account must
   already exist in `auth.users`, which only a completed Google sign-in creates — so §10's sequencing step 2
   (one storefront round trip) has to happen *before* the first `admin:grant` run.
   **Live verification (2026-09-26):** `exp_admin_users` holds exactly one row — the owner's Google account
   (id `443fb9f7-…`, email withheld here), `is_active = true`, `revoked_at null`,
   `created_by scripts/grant-admin.mjs` — and exactly one `auth.users` row carries
   `raw_app_meta_data->>'role' = 'admin'`. Both gates agree, so the DB half of §10.3/§10.5 has a live subject
   to test against. `revoke-admin.mjs` has not been exercised against the live project yet.
   **Operational gotcha, observed live 2026-09-26:** granting access does **not** change a token already in
   flight — `app_metadata` is baked into the JWT at issue time. The owner's only sign-in (15:48:42) preceded
   the grant (15:50:32) by two minutes, so `/admin` correctly reported "not authorised" until the token was
   renewed, and `exp_admin_users.last_login_at` stayed `never` throughout. Remedy: sign in again, or use
   **Refresh access** on the login page (§10.6), which calls `auth.refreshSession()`. **Runbook for every new
   admin: grant first, then have them sign in (or refresh).**
3. **§10.3 Rewrite the route-level authority (`requireAdminApiSession`).** ✅ **DONE** — landed 2026-09-26. Before:
   `src/lib/admin/auth.ts:48-107` compares a cookie to `ADMIN_LOGIN_KEY` and returns
   `{ adminKey, clientIp, sessionToken }`. New: read the Supabase session (`createServerSupabaseClient()`),
   `await supabase.auth.getClaims()`, require `claims.sub` + `claims.app_metadata.role === 'admin'`, then
   **re-check `exp_admin_users`** for `is_active = true` and `revoked_at is null` (fail **closed** — the
   `ALLOW_LEGACY_ADMIN_SESSION_FALLBACK` escape hatch at `session.ts:149-180` disappears with it). Return
   `{ actorUserId, actorEmail, clientIp, accessToken }`; every `auth.context.adminKey` / `sessionToken`
   consumer must move to the new shape (`grep` shows only `sessions/route.ts:34` and the admin routes that
   merely check `auth.ok`). Keep `requireCsrf` + the `rateLimitOptions` branch byte-for-byte so
   `auth-route-pattern.test.ts` and the CSRF playbook (`docs/archive/PENTEST_CSRF_PLAYBOOK.md`) stay valid.
   **Verification (`src/lib/admin/auth.test.ts`, 16 cases):** absent session, unverifiable JWT, non-admin
   claim, missing allow-list row, `is_active = false` and `revoked_at` set all return `401`; a database error
   returns `500`; and CSRF still short-circuits *before* any Supabase call. **Deviations, recorded:** (a) the
   context is `{ actorUserId, actorEmail, clientIp }` — `accessToken` was dropped because nothing consumes
   it (add it in §10.17 when it has a caller); (b) the legacy `getExpectedAdminKey` / `hasValidAdminKey` /
   `extractAdminSessionToken` helpers remain in the file behind `@deprecated`, because
   `/api/admin/{session,send-mfa,verify-mfa}` still import them until the §10.8/§10.10 deletion commit —
   nothing in the new gates uses them.
4. **§10.4 Page gate + a real "not authorised" outcome.** ✅ **DONE** — landed 2026-09-26. Before:
   `requireAdminPageSessionOrRedirect` (`auth.ts:109-135`) currently redirects to `/admin/mfa-challenge`
   when MFA is pending. New split, so a signed-in non-admin can never bounce between `/admin` and
   `/admin/login`: no session → `redirect('/admin/login?next=…')`; session without the admin claim or
   without an active allow-list row → a new `/admin/not-authorized` page that names the signed-in Google
   account and offers "use a different account" (sign out + retry) and "back to the shop". Sanitize `next`
   to **`/admin/**` only** — an admin-login `next` must never point at the storefront (reuse
   `sanitizeAuthNextPath` from `lib/auth/redirect.ts` with an admin-prefix guard).
   **Delivered:** `/admin/not-authorized` (`src/app/admin/not-authorized/page.tsx` +
   `src/components/admin/NotAuthorizedView.tsx`) names the signed-in account and offers switch-account and
   "back to the shop"; `sanitizeAdminNextPath()` sits on top of the generic sanitizer and confines `next` to
   `/admin/**` (`redirect.admin.test.ts`, 5 cases); an allow-list read failure fails **closed** to
   `/admin/not-authorized`. **Proven live** (production server, no session): `GET /admin` →
   `307 /admin/login`, and `GET /admin/not-authorized` → `200`, i.e. the landing page is actually reachable
   while unauthenticated — which is what stops the §10.4/§10.5 redirect loop.
5. **§10.5 Swap the edge/proxy gate in `src/middleware.ts`.** ✅ **DONE** — landed 2026-09-26. Delete `verifyTokenEdge()`
   (`middleware.ts:47-125` — 80 lines of Web-Crypto HKDF + HMAC that only exist to validate the custom
   cookie) and the `mfaFlag` branch (`:233-257`). Replace with: build a `createServerClient` on
   `request.cookies`, `getClaims()`, allow when `claims.app_metadata?.role === 'admin'`; otherwise `401`
   JSON for `/api/admin/*` and `redirect('/admin/login')` for pages. Update the exemption list
   (`:177-183`) to `/admin/login`, `/auth/callback`, and keep `/api/admin/session` only if §10.10 keeps that
   route; `/admin/mfa-challenge`, `/api/admin/send-mfa`, `/api/admin/verify-mfa` go away (§10.8/§10.9). Keep the
   CSP-nonce cookie/header behaviour on every branch — §7.1's analytics work depends on it. Note this also
   retires the §9.1 class of bug outright: there is no longer a second signing implementation to keep in
   sync with `lib/admin/session.ts`.
   **Delivered:** `verifyTokenEdge()` and the `mfaFlag` branch are deleted (their HMAC/HKDF code is gone, not
   merely bypassed); the gate is `refreshSupabaseSession()` plus `decideAdminEdgeAccess()`
   (`src/lib/admin/edge-gate.ts`) — a pure function precisely so its matrix is unit-tested
   (`edge-gate.test.ts`, 9 cases). **Two review corrections were applied here:** (1) the exemption list is
   `/admin/login`, **`/admin/not-authorized`** and `/api/admin/session` — the draft listed `/auth/callback`
   instead, which can never reach this branch (it is not under `/admin`), and omitting
   `/admin/not-authorized` would have made §10.4's landing page unreachable (§ G1 of the review);
   (2) the admin branch now also **rotates the Supabase session cookies**, which it previously could not —
   it returned before the storefront's `updateSupabaseSession()` call, so a panel-only session could never
   refresh its access token and every admin would have been signed out after an hour (§ G2). **Proven live**
   (production server, no session): `/admin` and `/admin/homepage` → `307 /admin/login`;
   `/api/admin/orders` → `401 {"error":"Unauthorized"}`; and every one of those responses *plus* the exempt
   `/admin/login` and `/admin/not-authorized` (`200`) carries the CSP header, the `rrs_csp_nonce` cookie and
   the `rrs_csrf` cookie — the SEC-047 nonce contract now holds on allow, deny and exempt branches alike,
   through one `decorateAdminResponse()`.
6. **§10.6 `/admin/login` becomes Google sign-in.** ✅ **DONE** — landed 2026-09-26. `src/app/admin/login/page.tsx` was a
   key-entry form hitting `POST /api/admin/session` then `router.replace('/admin/mfa-challenge')`
   (`:57-71`). Replace the body with the shared `SignIn` component (`src/components/auth/SignIn.tsx`) using
   `next=/admin`, keeping the panel's card styling, the `AdminCsrfFetchBridge`, and the autofill-hardening
   comments that no longer apply. Add the pre-flight state: if `useAuth().user` exists but the account is not
   an admin, show "this Google account is not authorised" with a **switch account** action
   (`signOut()` then `signInWithOAuth`) instead of silently sending them back through Google. Surface
   `?error=not_authorized` from §10.4. Keep a fail-closed rate limit on OAuth initiation.
   **Delivered:** the page is now a server component that sanitizes `next` and renders
   `src/components/admin/AdminLoginView.tsx`, which reuses the shared `SignIn` (Google PKCE + the
   `AdminCsrfFetchBridge`) with an admin-toned heading — `SignIn` gained optional `eyebrow` / `title` props so
   the page keeps exactly one `h1` (§9.11). When a signed-in account lacks the admin role, the pre-flight
   names it and offers a switch-account button that calls `signOut()` and then starts OAuth again with
   `prompt: 'select_account'`; `?error=not_authorized` surfaces the same warning. **Not implemented as
   drafted:** the "fail-closed rate limit on OAuth initiation" is Supabase's own Authentication → Rate Limits
   plus the existing origin/CSRF model — no bespoke limiter was added, so that control lives in the dashboard
   and must not be assumed to be in code.
   The surface also gained a **Refresh access** action (`auth.refreshSession()` + `router.refresh()`) plus
   copy naming the stale-token case, so a just-granted account is one click away from working instead of
   needing a full sign-out/sign-in — see the §10.2 note for the live case that motivated it.
7. **§10.7 Put a real actor on the audit trail.** ✅ **DONE** — schema applied 2026-09-26, code wired the same day.
   `writeAdminAuditLog`
   (`lib/admin/audit.ts:13-34`) records action/entity/route/ip/user-agent/branch but **no identity**, because
   under a shared key there was none to record. `actor_user_id uuid` + `actor_email text` now exist on
   `exp_admin_audit_log` (migration `067_admin_audit_actor.sql`, applied live and verified — 13 columns;
   `docs/Database.md` updated), but nothing writes them yet, so pass them from the §10.3 context as part of the
   cutover. Until then the panel audit log (**201** rows) still cannot name an actor, so do not treat it as
   attributable.
   **Deviation, recorded and justified:** the plan said "pass them from the §10.3 context", but
   `writeAdminAuditLog` has **178 call sites across 37 files**. The actor is therefore derived *inside* the
   helper (`resolveAuditActor()` → `getClaims()` → `readAuthClaims()`), which means a new route cannot forget
   to attribute its writes, an unauthenticated write (a webhook) correctly records no actor, and no call site
   changed. Attribution stays best-effort: a missing actor never fails the audit write, and an audit failure
   never fails the request. This is the one place a caller-supplied actor would be *less* trustworthy than
   the session-derived one.

### 10.8–10.11 — Remove

8. **§10.8 Delete the MFA code store and its endpoints.** ❌ **NOT DONE.** `src/lib/admin/mfa-store.ts`
   (66 matching lines: `createMFACode:107`, `verifyMFACode:80`, stored-code hashing keyed off
   `MFA_CODE_HASH_KEY_SEED:33`), `src/app/api/admin/send-mfa/route.ts` (Resend email delivery + a
   `verifyAdminSessionToken(sessionToken, adminKey, false)` pre-check at `:30`),
   `src/app/api/admin/verify-mfa/route.ts` (re-mints a second session token with `mfaFlag='1'`),
   `src/app/api/admin/mfa-debug/route.ts` (a production-reachable endpoint that probes the MFA table and
   reports env presence), and `src/app/api/admin/verify-mfa/route.test.ts` (13 MFA references). Also delete
   `src/lib/fingerprint.ts` — its header states it exists "for MFA verification" (`:2`) and its only consumer
   is the MFA page. §1.4 (dead `ip` fallback) is closed by deletion rather than by repair.
9. **§10.9 Delete `/admin/mfa-challenge`.** ❌ **NOT DONE.** `src/app/admin/mfa-challenge/page.tsx`
   (197 lines: `send-mfa` at `:57`, `verify-mfa` at `:85`, fingerprint collection at `:28`, countdown,
   `router.push('/admin')` at `:105`), its middleware exemption (`middleware.ts:180`) and the
   `redirect('/admin/mfa-challenge?next=…')` target in `auth.ts:124`. Nothing else links to it once §10.4 and
   §10.6 land.
10. **§10.10 Delete the custom admin session system.** ❌ **NOT DONE.** `src/lib/admin/session.ts` in full:
    `ADMIN_COOKIE_NAME:6`, `SESSION_VERSION='v2':10`, `createAdminSessionToken`, `verifyAdminSessionToken:117`,
    `revokeAdminSession`/`revokeOtherAdminSessions`/`listAdminSessions:188-246`, `extractJtiFromToken:251`,
    `extractMfaFlagFromToken:263`, `getAdminSessionMaxAgeSeconds:270`, and the HKDF seeding from
    `SESSION_SIGNING_KEY_SEED` / `SESSION_HASH_KEY_SEED`; plus `src/lib/admin/session.test.ts`. Then
    `/api/admin/session`: preferably delete the route and point `AdminShell.tsx:155` at the Supabase client's
    `signOut()`, because that is what finally makes the panel's "Sign out" a real revocation (§1.6); keeping
    it as a thin wrapper is the alternative. Delete `/api/admin/sessions` outright — it lists and revokes
    `exp_admin_sessions` rows and has **no UI caller** (only its own file matches: `sessions/route.ts:47,66`),
    so it is dead authenticated surface.
11. **§10.11 Delete the deprecated client guard.** ❌ **NOT DONE.** `src/components/admin/AALGuard.tsx`
    (16 matching lines) is self-declared `@deprecated` and imported nowhere (`:1-9`) yet still ships a
    client-side `fetch('/api/admin/session')` guard and a `/admin/mfa-challenge` push (`:39,47,89`). Any
    client-side guard that survives should read `useAuth()` for display only and never make an auth decision.

### 10.12–10.15 — Database, config & docs

12. **§10.12 Drop the MFA and custom-session tables.** ❌ **NOT DONE.** One migration dropping
    `admin_mfa_codes` (created `040_admin_mfa_codes.sql:5`, extended by `041_admin_mfa_challenge_token.sql:11-23`)
    together with its `cleanup_expired_mfa_codes()` function (`040:29-38`), and `exp_admin_sessions`
    (`045_admin_sessions.sql:10`, defensively re-created in `048_missing_schema_fixes.sql:103` and
    `049_Migration_1.sql:1250`). Live row counts measured 2026-09-26, before anything is dropped:
    **`admin_mfa_codes` = 1 row, `exp_admin_sessions` = 28 rows** (re-check immediately before the `DROP`; the
    session count grows on every login until §10.10 lands). Then update `docs/Database.md`, which is the
    canonical schema reference and still documents both tables.
13. **§10.13 Environment and test-seed cleanup.** ❌ **NOT DONE.** Remove `ADMIN_LOGIN_KEY`,
    `ADMIN_MFA_EMAIL`, `MFA_CODE_HASH_KEY_SEED`, `SESSION_SIGNING_KEY_SEED`, `SESSION_HASH_KEY_SEED` and
    `ALLOW_LEGACY_ADMIN_SESSION_FALLBACK` from `.env`, `.env.example`, the Vercel environments (all three) and
    the `src/test-setup.ts` seeds. `ADMIN_TOTP_SECRET` is *already* stale: it is set in `.env` but nothing
    reads it (there is no `debug-totp` route — only `mfa-debug`), so delete it too. This closes the seed half
    of §1.2, leaving only that item's `NEXT_PUBLIC_SITE_URL` gap — which the Google OAuth `redirectTo` needs
    anyway, so fix both together.
14. **§10.14 Dependency sweep.** ❌ **NOT DONE.** `bcryptjs` (`package.json:29`) has **zero** usages in `src/`
    or `scripts/` (verified by grep) — it was the password hasher for the customer accounts removed in
    `042_remove_customer_accounts.sql`, so this switch is the moment to drop it. Re-run
    `npm audit --audit-level=high` afterwards; §1.5's `@xmldom/xmldom` high advisory is separate and remains.
15. **§10.15 Test-suite rework (ships with §10.3–§10.5, not after).** 🟡 **PARTIAL** — additions landed
    2026-09-26; the deletions are deliberately deferred to the §10.8/§10.10 commit.
    `src/lib/admin/session.test.ts` (26 matching lines), `verify-mfa/route.test.ts`, and the
    key-specific cases in `session/route.test.ts`. Add: (a) an edge-claim gate test — missing claim, wrong
    role, expired token → 401 for APIs and redirect for pages, plus an explicit `app_metadata` vs
    `user_metadata` regression case; (b) a **fail-closed** route-gate test — DB error, missing allow-list row,
    `is_active = false`, `revoked_at` set; (c) a `next`-sanitizer test for the `/admin/**` restriction
    (§10.4). `src/lib/admin/auth-route-pattern.test.ts` must keep passing: it asserts every route using
    `requireAdminApiSession` checks `!auth.ok`, which is the main guard against a bad §10.3 refactor.
    **Added:** `edge-gate.test.ts` (9 cases — admin claim, absent session, no usable `sub`, non-admin shapes,
    API-vs-page outcome, exemption list including the `/admin/not-authorized` loop guard and the *removal* of
    the MFA exemptions), `claims.test.ts` (9 cases, incl. the explicit `app_metadata` vs `user_metadata`
    regression), `auth.test.ts` (16 cases — the fail-closed route gate, CSRF-before-Supabase, and the page
    gate's three redirect outcomes + the once-per-sign-in `last_login_at` stamp) and `redirect.admin.test.ts`
    (5 cases for the `/admin/**` confinement). Suite: **33 files / 216 tests → 37 files / 255 tests, green**,
    with `auth-route-pattern.test.ts` untouched and still passing.
    **Deferred on purpose:** deleting `session.test.ts`, `verify-mfa/route.test.ts` and the key-specific cases
    in `session/route.test.ts` now would remove the only coverage of code that *still ships* until §10.8/§10.10
    delete it. Tests are deleted with the code they cover, not before it.

### 10.16–10.17 — Deferred decisions

16. **§10.16 Do we want a second factor at all?** ❓ **UNVERIFIED — decision, not work.** The switch removes
    the only second factor, so security rests entirely on the admin's Google account (2FA / passkeys there
    *are* the control). If a true second factor is wanted later, Supabase Auth supports TOTP MFA
    (`supabase.auth.mfa.enroll / challenge / verify`) which would re-add an AAL check at the gate — but
    per-account enrollment rather than emailed codes. Decide explicitly; "MFA was removed" must not be read as
    "MFA is unnecessary".
17. **§10.17 Is per-session management needed?** ❓ **UNVERIFIED — decision, not work.** The
    `exp_admin_sessions` UI never actually existed (see §10.10). Supabase's admin API exposes
    `auth.admin.signOut(jwt, scope)` — so "sign out everywhere" is available — but `supabase-js` has no
    per-user session *listing*, so "show my other sessions" is dashboard/Management-API territory. If it
    matters, it is a Supabase task, not a panel task.

### Sequencing, rollback & verification

Order matters, because the cutover is the one step that can lock the only admin out of the panel:

1. **§10.1–§10.2** (allow-list + grant tooling) — purely additive; nothing existing breaks.
2. Grant the admin's own Google account, then confirm locally that `getClaims()` actually returns
   `app_metadata.role`, and that the storefront round trip from `docs/GOOGLE_AUTH_SUPABASE.md` §9 completes.
   This is the step that de-risks everything after it.
   *(2026-09-26: the grant half is **done and verified in the database** — §10.1/§10.2 are ✅. The
   `getClaims()` + storefront round-trip half is still outstanding, and it is the gate for step 3: sign in
   once on `/sign-in` so the access token is minted *after* the grant carries `app_metadata.role`.)*
3. **§10.3–§10.7 + §10.15** in one change (gates, login page, audit actor, tests), verified on a preview
   deployment with **both** a granted and a non-granted Google account.
4. **Only then §10.8–§10.14** as a *separate* commit (deletions, table drops, env/dependency cleanup), so the
   key + MFA path stays revertable if step 3 misbehaves in production.
5. Delete rows from `exp_admin_sessions` / `admin_mfa_codes` only **after** the code that reads them is gone.

**Rollback.** Steps 1 and 4 revert independently. Reverting step 3 restores key + MFA login — which is why the
env vars must not be deleted until step 4. §10.12's `DROP TABLE` is the only irreversible action: snapshot the
schema first (use `supabase db dump`, not `db push` — §1.1's migration-history baseline is still open).

**Break-glass.** If the claim and the DB ever disagree, fix it by SQL with the service role
(`update exp_admin_users set is_active = …`). The edge claim is only an optimisation; the DB check is the
authority, so a stale JWT cannot keep a revoked admin in.

**Verification checklist for step 3.** Non-admin Google account → `/admin` lands on `/admin/not-authorized`,
`/api/admin/*` answers `401`, and there is no redirect loop. Admin account → the panel loads, `AdminShell`
sign-out ends the session on the panel **and** the storefront, and `exp_admin_audit_log.actor_email` is
populated. Then: `grep -ril "mfa" src/` names nothing but the unrelated `failClosed` comment at
`lib/rate-limit.ts:87`, and `npm run type-check`, `npm test`, `npm run build`,
`npm run lint` (no new errors) and `npm run test:security:rls` all pass.

### Traceability

| ID | What | Risk if skipped | Effort | Supersedes |
|---|---|---|---|---|
| §10.1 | `exp_admin_users` allow-list + RLS lockdown | any Google account could become admin | S | — |
| §10.2 | grant/revoke tooling + bootstrap path | cannot onboard or remove an admin | S | — |
| §10.3 | claims + DB route gate, fail-closed | revoked admin keeps access; fail-open returns | M | §1.2 (part), §1.6 |
| §10.4 | page gate + `/admin/not-authorized` | redirect loop for signed-in non-admins | S | — |
| §10.5 | edge gate swap (delete `verifyTokenEdge`) | two auth systems live at once | M | §9.1 bug class |
| §10.6 | `/admin/login` → Google | no way to log in once the key is gone | S | — |
| §10.7 | audit actor identity | panel audit log stays unattributable | S | — |
| §10.8 | delete MFA store + 3 endpoints + fingerprint | emailed-code path stays reachable in prod | S | §1.4 |
| §10.9 | delete `/admin/mfa-challenge` | dead route + stale middleware exemption | XS | — |
| §10.10 | delete custom session system + 2 routes | two session models; §1.6 stays open | M | §1.6 |
| §10.11 | delete deprecated `AALGuard` | unused client guard inviting misuse | XS | — |
| §10.12 | drop 2 tables + `cleanup_expired_mfa_codes()` | two unused tables holding prod data | S | — |
| §10.13 | env + test-seed cleanup | stale secrets in every environment | XS | §1.2 (seeds) |
| §10.14 | drop unused `bcryptjs` | dead dependency surface | XS | — |
| §10.15 | test rework | the new gate ships untested | M | — |
| §10.16 | second-factor decision | "no MFA" read as "no MFA needed" | XS | — |
| §10.17 | session-management decision | revocation expectations left implicit | XS | — |

**Net security delta.** *Improvements:* no shared secret to leak or rotate; every action attributable to a
named admin (§10.7); no fail-open legacy fallback; instant revocation through the DB gate; and one auth
implementation instead of two — §10.5 deletes the exact bug class that blocked every admin login on
2026-09-17 (§9.1). *Accepted knowingly:* a single factor (the admin's Google account) instead of two, and a
revocation window bounded by the access-token lifetime (≤ 1 h by default) for callers that see only claims —
the DB gate closes that for anything that matters.


