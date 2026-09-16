# September Implementation Plan

Consolidated list of open work, carried forward from the archived planning docs and the
September security review. Items are grouped by area, each noting its source so it can be
re-verified against current code (some may since have been completed).

> Note: promo/bundle `usage_count` accounting was implemented as part of this pass
> (migration `062` + checkout increment) and is intentionally **not** listed below.

## 1. Security & deployment follow-ups

1. Apply migrations `059`, `060`, `061`, `062` to the live database (and confirm any
   earlier pending migrations `047`/`048`/`057`/`058` that may not be applied). Verify the
   full `001→062` chain with `supabase db reset` / `db diff`.
2. Set and verify `SESSION_SIGNING_KEY_SEED`, `SESSION_HASH_KEY_SEED`,
   `MFA_CODE_HASH_KEY_SEED` in every environment — the Node and Edge values must match.
3. Add route-level regression tests for the Square checkout promo application and the new
   required-shipping validation (only pure helpers are unit-tested today).
4. Remove the dead legacy `ip`-column fallback in `src/lib/admin/mfa-store.ts` now that the
   live `admin_mfa_codes` table uses `challenge_token`.
5. Verify `npm audit --audit-level=high` passes locally (CI workflow exists).

## 2. Retention & notification gaps

_Source: `docs/archive/EXPANSION_NOTES.md` → "Remaining (Pending Implementation)"._

High priority:
1. Back-in-stock + capacity-reopen notifications (end-to-end opt-in, trigger, delivery).
2. Gift-ideas route and gift-message capture in checkout.
3. Abandoned-cart recovery (trigger + email templates + resume UX).
4. Abandoned custom-request recovery (trigger + email templates + resume UX).

Medium:
5. Production queue visualization + machine scheduling UI on `exp_machine_schedule_blocks`.
6. Art Guard restricted-artwork review workflow completion in admin.
7. Admin pricing-module consolidation decision (dedicated page vs catalog-embedded).

Compliance & quality:
8. WCAG 2.2 AA audit + remediation across customer-facing routes.
9. Cookie consent banner + consent persistence + policy wiring.
10. Structured data / SEO completion (Shop, category, PDP, Resources).
11. Mobile responsiveness regression + performance sweep.
12. Automated test baseline beyond the RLS script.

Operational:
13. Automated low-stock / capacity / status notification orchestration.
14. Tax-calculation strategy hardening + financial reconciliation checks.
15. Multi-carrier shipping adapter plan + phased implementation.

## 3. Future-products / homepage gaps

_Source: `docs/archive/IMPLEMENTATION_PLAN.md` → §14.0 / §14.3._

Critical:
1. Fix `status` → `status_id` column mismatch in `src/app/future-products/page.tsx` and
   `src/app/api/future-products/route.ts` (LEFT JOIN `exp_future_product_statuses`).
2. Fix `price_max=0` encoding bug in `HomepageProductGrid.tsx` `buildViewAllUrl()`.

High/medium:
3. Replace `console.error` with `safeLogError` in the future-products route.
4. Wire the Shop All Preview editor UI in the admin homepage page (state exists, no JSX).
5. Add `[id]` CRUD routes for future products / statuses / responses.
6. Build tabbed admin UI (Products | Statuses | Responses) with edit/delete/reorder.
7. Add `FutureProduct`/`FutureProductStatus` types, a dedicated query module, and a header nav link.
8. Make `FutureProductsNotifyCard` respect the `future_products_notify_form.enabled` setting.
9. Send `source` from the notify form + add email-based rate limiting (3/24h).
10. Decide/implement rich-text sanitization (Tiptap editor + server-side sanitize).
11. Add analytics events and wire into `HomepageProductGrid` + `FutureProductsNotifyCard`.
12. Extend `scripts/test-rls-lockdown.mjs` with `exp_future_products` / statuses checks.

## 4. Product designer / 3D debt

_Source: `docs/archive/IMPLEMENTATION_PLAN.md` → §14.2B._

1. Full per-product template governance (bleed / safe-area) enforcement.
2. Token rebind/refresh UX for expired upload tokens.
3. Remaining integration tests (close/reopen persistence, order snapshots, abuse matrix).
4. Interactive 3D (boundary contract only for now; version `2.x` schema when needed).

## 5. General hygiene

- Commit the newly-visible-but-important files that were previously gitignored:
  migrations `047`/`048`/`049`/`057`/`058`/`059`/`060`/`061`/`062` and
  `supabase/verification/schema_repair.sql`.
- Re-verify the stale findings above against current code; some may already be resolved.
