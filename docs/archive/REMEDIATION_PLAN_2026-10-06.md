# Multi-lens review — ranked remediation plan (2026-10-06)

**Repo:** `TranspoLord/RubysRelicsStudio` · **Branch:** `dev`. Reviewed at `4aeb56f` (2026-10-02), then **reconciled against `963e97f`** (2026-10-07, Batches 9–10; see §0.8). **Stack:** Next.js 16.3.8 (App Router) · React 19 · MUI 6 · Supabase (Postgres/RLS/Storage/Auth, TOTP MFA) · Square payment links · Shippo · Resend

**Lenses:** (1) security — authentication, authorization, sessions, request pipeline; (2) security — payments, webhooks, uploads, public endpoints, database; (3) UX — storefront customer journey; (4) UX — admin operator workflows; (5) reliability, data integrity, privacy and engineering health. Each lens was reviewed by an independent agent against the code. The coordinator then ran the project's own checks, re-verified every Critical and top-High claim against source, merged duplicate findings, and ranked the result.

**This document is written for an AI coding agent to pick up and execute.** It contains **76 ranked work items**. Every item has file:line locations, the failure scenario, numbered implementation steps, and tests/acceptance criteria.

---

## 0. Read this first (instructions for the implementing agent)

1. **Repo conventions you must follow.**
   - `SEPT_IMPLEMENTATION_PLAN.md` is the repo's single source of truth for open work, and `OCT_IMPLEMENTATION_PLAN.md` holds issues found during execution (`OCT-n`).
   - When you complete an item here, record it in the September plan's "Batch execution log". Record anything new you discover as an `OCT-n` entry, as the repo already does.
   - Cross-references like "§10.17" or "OCT-13" point into those two files.
2. **Database safety.**
   - Never run `supabase db push`. OCT-13: the live project has no migration history baseline, so a push would replay `001→NNN` and fail mid-chain.
   - Apply new migrations through the dashboard SQL editor or `npx supabase db query --linked`, **only with the owner's explicit go-ahead**.
   - Live reads are fine and encouraged (item #1).
   - Treat every finding marked *Likely* or *Needs-verification* as unproven until #1 has run.
3. **Migration numbering.** The highest existing migration is `067`, and `065` is reserved (OCT-13). Items below write `NNN_<name>.sql`; use the next free number **at implementation time** and keep one concern per migration. Write idempotent SQL (`if exists` / `if not exists`, `not valid` + `validate constraint`).
4. **Tests.**
   - Vitest runs with `environment: 'node'` and no DOM harness (OCT-5). Use the repo's three patterns:
     - pure-function unit tests;
     - route tests with mocked Supabase (copy `src/app/api/admin/orders/route.test.ts`);
     - source-contract tests using `readSourceFile`/`listSourceFiles`/`stripComments` from `src/lib/testing/source-contract.ts`. Give every contract test a planted-offence case so it can't pass vacuously (see #16).
   - Visual and browser checks use the headless-Edge harness in `UI_AUDIT.md`; the admin panel needs the dev sign-in helper. **Fix #10 before using that helper again.**
5. **Per-batch verification recipe:** `npm run type-check && npm run lint && npx vitest run && npm run build`, plus the item's own acceptance checks. OCT §3 has the longer recipe.
6. **Don't decide product or copy questions.** Items flagged "owner decision" or "owner to approve" need the shop owner: tax, analytics consent model, NFC pricing, SVG support, sign-up policy, session TTL. Implement the mechanism behind a clear default and surface the decision.
7. **Cross-references** use this document's item numbers (`#12`). Source finding IDs (`SA-`, `SD-`, `UXS-`, `UXA-`, `REL-`) map to items in **Appendix B**.
8. **Reconciliation with `963e97f`.** The review was done at `4aeb56f`. One commit then landed on `dev` (`963e97f`, 69 files: Batch 9 dependency bump and font-size floor, Batch 10 SEO, and mandatory admin TOTP MFA for §10.16 plus `signOutOthers` for §10.17). The coordinator diffed it against every item:
   - **#9:** largely resolved, since `npm audit fix` bumped `next`, `axios`, `@xmldom/xmldom` and `brace-expansion`. The item was rewritten to the remainder.
   - **#63:** sitemap, robots and JSON-LD shipped; the coordinator note lists what's left.
   - **#11:** mandatory MFA mitigates the redirect half. Severity lowered to Medium.
   - **#10:** **worse.** The dev helper now auto-completes MFA and stores a TOTP secret for the production admin in plaintext in `%TEMP%`.
   - **#34:** wording updated for MFA and `signOutOthers`.
   - **Everything else is unchanged.** The other touched files (`custom-requests`, `orders`, `finance`, `builder`, `checkout/success`, `CategoryGrid`, `ProductConfigurator`, …) received only font-size edits.
   - **Line numbers** are from `4aeb56f`. Files that `963e97f` grew can be offset by a few lines, so locate by the quoted code: `src/lib/admin/auth.ts`, `src/lib/auth/claims.ts`, `src/lib/dev/dev-signin.ts`, `src/app/admin/(panel)/homepage/page.tsx`, `src/components/admin/AdminShell.tsx`, `src/components/layout/Header.tsx`/`Footer.tsx`, the product page and `api/admin/homepage/sections/[key]/route.ts`.
   - The new MFA code (`/admin/mfa`, `AdminMfaView`, `src/lib/auth/totp.ts`, `scripts/reset-admin-mfa.mjs`) was reviewed only for its effect on these items, not audited in depth.

## 1. Baseline health (coordinator runs, Node 24.18, Windows)

| Check | `4aeb56f` (2026-10-06) | `963e97f` (2026-10-08, current `dev`) |
|---|---|---|
| `npx tsc --noEmit` | ✅ clean | ✅ clean |
| `npx vitest run` | ✅ 49 files / 370 tests | ✅ 57 files / 406 tests. *Caveat:* `auth-route-pattern.test.ts` passes vacuously on Windows (checks 0 of the route files; #16) |
| `npx eslint .` | ❌ 8 errors, 12 warnings | ❌ **same 8 errors, 12 warnings**. Includes a real Rules-of-Hooks bug (`CategoryGrid.tsx:44`, `useState` after an early return) and a use-before-declare in a dead component (#16, #3) |
| `npm audit` | ❌ 1 critical, 10 high | ❌ **7 high**, 2 of them prod (`sharp`, `source-map-js`). Batch 9 fixed the critical `next` advisory and `axios`/`xmldom`; the new prod advisories have non-breaking fixes; the rest is a dev-only `braces` chain (#9) |
| CI (`security-audit.yml`) | ❌ red | ❌ still red. Runs only `npm audit` and greps, and one grep is case-sensitive and can never match migration 059 (#16) |

## 2. How items are ranked

- **P0 — do now.** Verify live state; stop money and data loss; close exploitable holes. Mostly S effort.
- **P1 — core-flow correctness.** Commerce and admin flows that are broken or wrong, plus major UX blockers.
- **P2 — important.** Hardening, resilience, privacy, and significant UX debt.
- **P3 — polish.** Low-severity security hygiene and UX polish.

Within a tier, items are ordered by **impact × likelihood ÷ effort**.

**Severity scale:**

| Severity | Meaning |
|---|---|
| Critical | Silent money or data loss, or a working exploit with high impact |
| High | Core flow broken, or a realistic exploit |
| Medium | Degraded correctness, security or UX |
| Low | Hygiene |

**Confidence values:**

| Confidence | Meaning |
|---|---|
| **Confirmed** | Traced end to end in code |
| **Likely** | Code-confirmed; depends on live configuration |
| **Needs-verification** | Depends on dashboard or live state; #1 says how to check |

**✔︎ re-verified** marks items the coordinator independently checked against source after the agent reported them.

## 3. Recommended execution batches

These are small, reviewable PRs in dependency order. Batch A can start immediately; the operational notes need no code at all.

- **Operational, today (no code):**
  - Do **not** press "Run batch" on Admin → Abandoned Carts (#8).
  - Run #1 checks 1–3 and 9.
  - If #1 check 1 shows shop orders failing, reconcile Square transactions against `exp_orders` by hand and contact the affected customers.
- **Batch A — safety net (S):**
  - #9 remaining dependency cleanup: `npm audit fix` for `sharp`/`source-map-js`, uninstall `square` and `codegraph`, and make the audit gate prod-only (lockfile-only PR).
  - #16 CI workflow, lint fixes and the route-pattern test fix.

  Everything after this lands with CI enforcing type-check, lint, tests and build.
- **Batch B — DB lockdown (S, SQL):** #3 privileges, view and RPC clamp; then #65 to prove it.
- **Batch C — checkout integrity (M):**
  - #2 order-first sequence, CHECK fix and idempotency;
  - #12 inventory reservation;
  - #19 atomic promo claims;
  - #20 endpoint hardening;
  - #5 pricing parity and validation;
  - #35 cents/rounding if capacity allows.

  These touch the same route; do them in one branch, in that order.
- **Batch D — payment events (M):**
  - #4 Square webhook;
  - #13 post-payment page and confirmation email;
  - #14 `sendEmail` wrapper;
  - #21 Shippo webhook.
- **Batch E — admin unblock (S–M):**
  - #6 move custom-request mutations under `/api/admin`;
  - #15 quote-link deactivation;
  - #28 Send Quote confirm and note split;
  - #7 pricing-page clobber hotfix (step 1 can ship in Batch A);
  - #23 cancel/refund confirm.
- **Batch F — auth hardening (S):**
  - #10 dev sign-in token;
  - #11 Supabase dashboard settings plus grant checks (owner);
  - #34 session TTL decision;
  - #66–#69.
- **Batch G — storefront conversion (M):** #17 `/cart` CTA, #18 notify form, #30–#33 checkout and configurator UX, #29 artwork option.
- **Batch H — operations:**
  - #8 abandoned cart;
  - #38 scheduler (needs #8 first);
  - #37 resilience and env validation;
  - #39 time zones;
  - #40 privacy;
  - #36 public-endpoint abuse.
- **Then** P2/P3 UX items by area, admin (#41–#51, #72–#76) and storefront (#52–#63, #70–#71), plus #62 performance and #64 SVG.

## 4. Ranked index

Severity mix: **2 Critical** · **25 High** · **35 Medium** · **13 Low** · **1 Gate**. Tiers: P0 = #1–#11 · P1 = #12–#35 · P2 = #36–#65 · P3 = #66–#76.

| # | Tier | Item | Severity | Effort | Confidence | Lens | Source findings |
|---|---|---|---|---|---|---|---|
| [1](#item-1) | P0 | Run the live-state verification sweep (read-only) before touching code | Gate | S | n/a | Ops | SD-3/SA-2, SD-4/REL-1, SD-5/SA-4, SD-8, SD-9/REL-4, SA-3, REL-16 |
| [2](#item-2) | P0 | Shop orders can be paid but never recorded: link created before insert, insert errors swallowed, `payment_mode` violates the CHECK ✔︎ | Critical | M | Confirmed / Likely | Payments | SD-4, REL-1 (found independently by two reviewers) |
| [3](#item-3) | P0 | Lock down database privileges: anon can execute SECURITY DEFINER RPCs, and an RLS-bypassing view is exposed ✔︎ | High | S | Likely | Security | SA-2 + SD-3 (functions, found independently by both security reviewers), SA-4 + SD-5 (view), UXA-25 (dead `CommissionQueueTracker`); lint error in that component |
| [4](#item-4) | P0 | Square webhook: marks orders paid without checking payment status, loses events on failure, ignores updates/refunds, has no state guard ✔︎ | High | M | Confirmed / Likely | Payments | SD-2, REL-2, SD-11 (Square half) |
| [5](#item-5) | P0 | Pricing integrity and parity: the server accepts tampered option values, and ignores process add-ons, combo discounts and NFC that the storefront c… ✔︎ | High | M | Confirmed | Payments | SD-1, SD-9, UXS-4, REL-4 (three reviewers), plus the cart re-tier half of UXS-10 |
| [6](#item-6) | P0 | The whole custom-request pipeline is dead in the admin panel: every quote/reject/handoff/export action fails CSRF ✔︎ | High | S | Confirmed | Admin | UXA-2, SA-6 (found independently by two reviewers) |
| [7](#item-7) | P0 | "Save Base Price" on the product pricing page silently turns off the embedded designer and erases the mockup URL ✔︎ | Critical | M | Confirmed | Admin | UXA-1 |
| [8](#item-8) | P0 | Abandoned-cart "recovery" emails customers who already paid, shows prices 100× too small, and repeats attacker-supplied text ✔︎ | High | S–M | Confirmed | Reliability | REL-5, SD-10(2) |
| [9](#item-9) | P0 | Finish the dependency cleanup: two production advisories reappeared after Batch 9, the unused `square`/`codegraph` packages still ship, and an unfi… ✔︎ | Medium | S | Confirmed | Security | coordinator `npm audit` (both runs); OCT-12/OCT-30; SD-14 (`codegraph`); REL-15 (unused `square` SDK) |
| [10](#item-10) | P0 | The dev sign-in helper's loopback check is a no-op under `next dev`: anyone on the LAN can mint a production admin session (now with MFA completed)… ✔︎ | High | S | Confirmed | Security | SA-1, plus coordinator review of `963e97f` |
| [11](#item-11) | P0 | Supabase Auth configuration the admin model depends on is documented insecurely: wildcard redirect URLs on production, admin grants resolved by email | Medium | S | Needs-verif. | Security | SA-3 |
| [12](#item-12) | P1 | Inventory is never reserved, decremented or checked at checkout, so one-of-a-kind items can be oversold | High | M | Confirmed | Payments | SD-7, REL-3, UXS-13 (server half), UXA-6 (transition→cancelled skips release) |
| [13](#item-13) | P1 | After paying, shop customers see "Stripe redirected successfully…" and get no order number, confirmation email or tracking link ✔︎ | High | M | Confirmed | Storefront | UXS-5, REL-7 |
| [14](#item-14) | P1 | Email sends are fire-and-forget: Resend errors are ignored, alerts are marked "notified" after failed sends, nothing is idempotent ✔︎ | High | M | Confirmed / Likely | Reliability | REL-6, UXA-3 (part 5: quote email failures reported as success) |
| [15](#item-15) | P1 | Superseded and expired custom-quote payment links stay payable; a re-quote creates a duplicate order | High | M | Confirmed | Payments | SD-8, REL-10, UXA-3 (parts 3–4) |
| [16](#item-16) | P1 | CI only runs `npm audit` (and its schema greps are broken), lint fails with 8 errors, and the main admin-auth regression test passes vacuously on W… ✔︎ | Medium | M | Confirmed | Eng | REL-15, SD-14, SA-7, coordinator lint/audit run |
| [17](#item-17) | P1 | `/cart`'s only checkout button always fails, and would drop personalization if it didn't ✔︎ | High | S | Confirmed | Storefront | UXS-1 |
| [18](#item-18) | P1 | `/future-products` "Notify me" fails for every visitor and lands on raw JSON ✔︎ | High | S | Confirmed | Storefront | UXS-2 |
| [19](#item-19) | P1 | Promotions: automatic deals never apply, invalid codes are silently ignored, and usage limits are consumed at link creation and race | Medium | M | Confirmed | Payments | REL-8, SD-6 (promo half), UXS-6 (part 3) |
| [20](#item-20) | P1 | The public checkout endpoint has no rate limit, no item cap and no address/email validation | Medium | S–M | Confirmed | Security | SD-6 (non-promo half) |
| [21](#item-21) | P1 | Shippo webhook: the signature scheme is unverified, `TRANSIT` never maps to shipped, tracking events violate a CHECK, and delivered emails repeat | Medium | S | Confirmed / Likely | Reliability | SD-11 (Shippo half), REL-16 |
| [22](#item-22) | P1 | An order cannot be fulfilled from the panel: no customer or ship-to address, no artwork, no tracking entry, no label, no "shipped" email | High | L | Confirmed | Admin | UXA-7 |
| [23](#item-23) | P1 | Orders: Cancel and "Mark Refunded" fire with no confirmation, and "cancelled" via the Transition menu skips inventory release | High | M | Confirmed | Admin | UXA-6 |
| [24](#item-24) | P1 | Homepage editor: a section "Save" silently re-shows sections hidden in the visibility panel, and a failed load followed by Save overwrites live con… | High | M | Confirmed | Admin | UXA-4 |
| [25](#item-25) | P1 | Product detail editor throws away unsaved text edits whenever media or options are added or deleted | High | S | Confirmed | Admin | UXA-5 |
| [26](#item-26) | P1 | Product builder: deleting an option value always fails, "Add" buttons create duplicates on double-click, failed loads look like empty lists, and er… | High | M | Confirmed | Admin | UXA-9 |
| [27](#item-27) | P1 | The variant "Weight" field is really machine-hours, editing a variant in the builder zeroes it, and real shipping weight (`weight_lb`) cannot be ed… | High | M | Confirmed | Admin | UXA-8 |
| [28](#item-28) | P1 | "Send Quote" is a one-click, irreversible customer email with hidden side effects: the internal note is emailed, a re-quote leaves the old payment … | High | M | Confirmed | Admin | UXA-3, SA-11 |
| [29](#item-29) | P1 | The artwork/logo "file" product option never uploads the file | High | M | Confirmed | Storefront | UXS-3 |
| [30](#item-30) | P1 | Checkout gating and error feedback | High | M | Confirmed | Storefront | UXS-6 |
| [31](#item-31) | P1 | Checkout address form: no recipient name, no autofill hints, unlabeled selects | High | S | Confirmed | Storefront | UXS-7 |
| [32](#item-32) | P1 | Artwork upload rules contradict each other, and failures appear only at submit | High | S–M | Confirmed | Storefront | UXS-8 |
| [33](#item-33) | P1 | Configurator accessibility: unlabeled fields, vague required errors, silent price and cart updates | High | M | Confirmed / Needs-verif. | Storefront | UXS-9 |
| [34](#item-34) | P1 | Admin sessions never expire, and the Settings "Session TTL" control is dead | Medium | M | Confirmed | Security | SA-5, UXA-24 |
| [35](#item-35) | P1 | Money math: per-unit rounding makes the charge differ from the displayed price, stored totals don't reconcile, and no sales tax is computed | Medium | M | Confirmed | Payments | REL-9 |
| [36](#item-36) | P2 | Public signup endpoints can be abused to make the shop email arbitrary addresses; capacity alerts have no limits at all | Medium | M | Confirmed | Security | SD-10 (parts 1, 3, 4, 5) |
| [37](#item-37) | P2 | External calls have no timeouts or retry policy, and config silently falls back to wrong values (fake ship-from address, localhost redirect) | Medium | M | Confirmed | Reliability | REL-11 |
| [38](#item-38) | P2 | There is no scheduler: expiry, reconciliation, retention and notification jobs only run when someone clicks a button | Medium | M | Confirmed | Reliability | REL-12 |
| [39](#item-39) | P2 | Finance always leaves out today and buckets by the wrong timestamp; customer-facing times are shown in UTC | Medium | S–M | Confirmed / Likely | Reliability | REL-13, UXA-12 (found independently by two reviewers) |
| [40](#item-40) | P2 | Privacy and email compliance: analytics ignore the cookie choice, marketing emails lack unsubscribe and postal address, and there are no retention … | Medium | M | Confirmed | Privacy | REL-14, UXS-18, SD-10 (part 5, raw IPs → #36) |
| [41](#item-41) | P2 | Custom request lifecycle has dead ends and missing information at decision points | Medium | M | Confirmed | Admin | UXA-10 |
| [42](#item-42) | P2 | No unsaved-changes protection anywhere, and every sidebar click is a full page reload | Medium | M | Confirmed | Admin | UXA-11 |
| [43](#item-43) | P2 | Saving inventory settings overwrites stock with a stale count | Medium | S | Confirmed | Admin | UXA-13 |
| [44](#item-44) | P2 | Global search and notifications never take the owner to the record; order and request search is likely broken outright | Medium | M | Likely | Admin | UXA-14 |
| [45](#item-45) | P2 | Orders list: search only by id or status, capped at 120 rows; details open below the whole list; typed notes are lost on failure | Medium | M | Confirmed | Admin | UXA-15 |
| [46](#item-46) | P2 | Customer-facing bulk email runs fire on a single click with no preview of who will be emailed | Medium | S | Confirmed | Admin | UXA-16 |
| [47](#item-47) | P2 | Creating and publishing a product is a trial-and-error loop: the checklist appears only on Publish, uploads aren't "featured", and Preview 404s for… | Medium | M | Confirmed | Admin | UXA-17 |
| [48](#item-48) | P2 | Promotions: the "Pricing" nav item is a placeholder; promos can't be edited and their dates are hidden and stored in UTC; bundle deals need raw JSO… | Medium | M | Confirmed / Likely | Admin | UXA-18 |
| [49](#item-49) | P2 | Feedback is inconsistent and often invisible: page-top Alerts far from the action, stale success banners, no toasts | Medium | M | Confirmed | Admin | UXA-19 |
| [50](#item-50) | P2 | Number inputs: empty means $0, decimals are fragile, and percent tiers show a "$" prefix | Medium | S | Confirmed / Needs-verif. | Admin | UXA-20 |
| [51](#item-51) | P2 | The dashboard doesn't show what needs doing today | Medium | M | Confirmed | Admin | UXA-21 |
| [52](#item-52) | P2 | The product designer is unreachable on the storefront, and isn't touch/keyboard ready | High | L | Confirmed | Storefront | UXS-11 |
| [53](#item-53) | P2 | Quantity only moves ±1, and the cart doesn't re-apply bulk tiers | Medium | M | Confirmed | Storefront | UXS-10 |
| [54](#item-54) | P2 | Custom-order form: hidden validation, errors out of view, native confirm on load | Medium | M | Confirmed | Storefront | UXS-12 |
| [55](#item-55) | P2 | Sold out is a dead end | Medium | M | Confirmed | Storefront | UXS-13 |
| [56](#item-56) | P2 | No branded not-found/error/loading pages; a Supabase error looks like a 404 | Medium | M | Confirmed | Storefront | UXS-14 |
| [57](#item-57) | P2 | No search on phones; the search dialog is unlabeled and dead-ends | Medium | S–M | Confirmed | Storefront | UXS-15 |
| [58](#item-58) | P2 | Cart clarity and safety | Medium | M | Confirmed | Storefront | UXS-16 |
| [59](#item-59) | P2 | No contact channel or link recovery | Medium | S–M | Confirmed | Storefront | UXS-17 |
| [60](#item-60) | P2 | Funnel analytics are defined but never fired | Medium | S | Confirmed | Storefront | UXS-19 |
| [61](#item-61) | P2 | Shipping, tax and lead time aren't disclosed before checkout | Medium | S | Confirmed / Needs-verif. | Storefront | UXS-20 |
| [62](#item-62) | P2 | Performance: every route is dynamic with no data caching, images load at full size, product pages query twice, and checkout makes sequential per-li… | Medium | M | Confirmed | Performance | UXS-21, REL-17, SD-15 (image config → #69) |
| [63](#item-63) | P2 | SEO and sharing | Medium | M | Confirmed | Storefront | UXS-22 |
| [64](#item-64) | P2 | The homepage upload stores unsanitized SVG, the sanitizer fails open past depth 100, and the public media bucket is listable | Low | S | Confirmed | Security | SD-12 |
| [65](#item-65) | P2 | `test-rls-lockdown.mjs` passes while covering no live PII or money table | Low | M | Confirmed | Security | SD-13, SA-4 (authenticated probe) |
| [66](#item-66) | P3 | `sanitizeAuthNextPath('/.//evil.com')` returns `//evil.com` (latent open redirect) | Low | S | Confirmed / Needs-verif. | Security | SA-8 |
| [67](#item-67) | P3 | Panel page authorization lives only in the `(panel)` layout, which partial (client-side) navigation skips | Low | S | Likely | Security | SA-9 |
| [68](#item-68) | P3 | `/auth/auth-error` displays attacker-supplied text on the real domain (phishing aid) | Low | S | Confirmed | Security | SA-10 |
| [69](#item-69) | P3 | Security header, cookie and image-proxy drift: Stripe in Permissions-Policy, wide CSP origins, `vercel.live` in prod, cookies without `Secure`, `*.… | Low | S | Confirmed | Security | SA-12, SD-15 |
| [70](#item-70) | P3 | `/shop/all` applies invisible filters and has no empty state | Low | S–M | Confirmed | Storefront | UXS-23 |
| [71](#item-71) | P3 | Toggle groups don't expose their selected state | Low | S | Confirmed | Storefront | UXS-24 |
| [72](#item-72) | P3 | Schedule blocks are linked by pasting UUIDs, and order "production hooks" are a second, disconnected schedule | Low | M | Confirmed | Admin | UXA-22 |
| [73](#item-73) | P3 | An expired session mid-edit shows a raw "Unauthorized admin request." and re-login lands on the dashboard | Low | M | Confirmed / Needs-verif. | Admin | UXA-23 |
| [74](#item-74) | P3 | Dead-end copy and orphaned surfaces | Low | S | Confirmed | Admin | UXA-25 |
| [75](#item-75) | P3 | Smaller keyboard and screen-reader gaps in the interactive pieces | Low | S | Confirmed / Needs-verif. | Admin | UXA-27 |
| [76](#item-76) | P3 | Formatting and time zones are inconsistent | Low | S | Confirmed | Admin | UXA-26 |

---

## 5. P0 — Do now

<a id="item-1"></a>
### #1 — Run the live-state verification sweep (read-only) before touching code
- **Priority:** P0 · **Rank:** 1/76 · **Lens:** Ops
- **Severity:** Gate for P0 items | **Effort:** S (≈1 h) | **Confidence:** n/a — this item *produces* confidence | **Sources:** SD-3/SA-2, SD-4/REL-1, SD-5/SA-4, SD-8, SD-9/REL-4, SA-3, REL-16
- **Why first:** Several of the most severe findings are written against `supabase/migrations/*.sql`, and OCT-13 says the live project's migration history is not baselined. Before any fix, establish what is actually live. If check 1 confirms the bug, every hour matters: customers are paying for orders that are never recorded.
- **Rules:** Read-only. Use `npx supabase db query --linked "<sql>"` (OCT-18: authenticated in the owner's environment, occasionally slow) or the dashboard SQL editor. Do **not** `db push` (OCT-13). Record results in a new "Live verification — <date>" section of this file.
- **Checks (run each; record the output):**
  1. **Does the shop checkout insert succeed?** (gates #2)
     ```sql
     select pg_get_constraintdef(oid) from pg_constraint
      where conrelid = 'public.exp_orders'::regclass and conname = 'exp_orders_payment_mode_check';
     select order_path, payment_mode, payment_status, count(*), max(created_at)
       from public.exp_orders group by 1,2,3 order by 5 desc;
     ```
     If the constraint lacks `'square_checkout'` **and** there are no `order_path='shop'` rows since Square checkout shipped, the bug is live. Then immediately compare Square Dashboard → Transactions (online, last 90 days) against `exp_orders` and hand the owner a list of paid-but-unrecorded orders to fulfil manually.
  2. **Which functions can anon/authenticated execute?** (gates #3)
     ```sql
     select p.oid::regprocedure as fn, p.prosecdef as definer,
            has_function_privilege('anon', p.oid, 'execute') as anon_exec,
            has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
       from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.prorettype <> 'trigger'::regtype order by 1;
     ```
  3. **Views/relations readable by anon/authenticated** (gates #3)
     ```sql
     select table_name, grantee, string_agg(privilege_type, ',')
       from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon','authenticated') group by 1,2 order by 1;
     select relname, reloptions from pg_class
      where relnamespace = 'public'::regnamespace and relkind in ('v','m');
     select count(*) as auth_users, (select count(*) from public.exp_admin_users) as admins from auth.users;
     ```
  4. **Is money being lost on process add-ons/combos today?** (sizes #5)
     ```sql
     select count(*) filter (where price_delta <> 0) from public.exp_product_process_pricing where is_enabled;
     select count(*) from public.exp_product_combo_discounts where is_enabled;
     ```
  5. **Duplicate live quote links** (sizes #15)
     ```sql
     select custom_request_id, count(*) from public.exp_orders
      where custom_request_id is not null and payment_status = 'pending' group by 1 having count(*) > 1;
     ```
  6. **Order-event CHECK** (gates #21)
     ```sql
     select pg_get_constraintdef(oid) from pg_constraint where conname = 'exp_orders_status_events_action_type_check'
        or conname like 'exp_order_status_events%check%';
     ```
  7. **Inventory reservations ever made?** (sizes #12)
     ```sql
     select count(*) filter (where inventory_reserved_at is null) as never_reserved, count(*)
       from public.exp_orders where payment_status = 'paid';
     ```
  8. **Storage listing policies**: `select policyname, tablename, cmd, roles from pg_policies where schemaname = 'storage';`
  9. **Dashboard checks (no SQL):**
     - Supabase → Auth → URL Configuration: list every Redirect URL. Wildcards, `localhost` or `*.vercel.app` entries on the production project make #11 live.
     - Auth → Providers: is Email/Phone/Anonymous enabled? Is "Confirm email" on? Is "Allow new users to sign up" on?
     - Auth → Sessions: is time-boxing or inactivity timeout set? (#34)
     - Square Dashboard → Webhooks: which event types are subscribed (`payment.created`, `payment.updated`, `refund.*`)? Open the event log for one real payment-link payment and note the `status` in the `payment.created` payload. (#4)
     - Shippo → Webhooks: send a test event and check Vercel logs for "Missing x-shippo-signature header". (#21)
- **Acceptance:** A dated "Live verification" section in this file with the raw output of checks 1–9, and each dependent item's **Confidence** updated from Likely/Needs-verification to Confirmed or Not-applicable.

<a id="item-2"></a>
### #2 — Shop orders can be paid but never recorded: link created before insert, insert errors swallowed, `payment_mode` violates the CHECK
- **Priority:** P0 · **Rank:** 2/76 · **Lens:** Payments · ✔︎ re-verified by coordinator
- **Severity:** Critical | **Effort:** M | **Confidence:** Code path Confirmed (coordinator re-verified `route.ts:416` → `:456-482` and every `payment_mode` CHECK in the migrations). "Every shop insert fails today" = Likely; confirm with #1 check 1. | **Sources:** SD-4, REL-1 (found independently by two reviewers) | **Existing plan overlap:** SEPT §1.3 (no checkout route tests)
- **Location:** `src/app/api/square/checkout/route.ts:413-435` (Square link created first), `:456-482` (insert after it; error only logged), `:461` (`payment_mode: 'square_checkout'`), `:509-513` (returns `checkoutUrl` regardless); `supabase/migrations/006_orders_foundation.sql:11`; `supabase/migrations/049_Migration_1.sql:740-741`; `supabase/migrations/050_custom_requests_square_integration.sql:38-40`; `src/app/api/webhooks/square/route.ts:106-121,144-154`; `src/components/checkout/CheckoutPageView.tsx:178-180`
- **Problem:**
  1. Every CHECK definition in the migrations allows only `stripe_checkout | stripe_payment_link | square_payment_link`, but the route inserts `'square_checkout'`. If the live constraint matches, every shop order insert fails with 23514.
  2. The route creates the Square payment link **before** inserting the order. On any insert error it logs and still returns the payable `checkoutUrl` (comment: "Don't fail the checkout — the Square link is already created").
  3. The customer pays. The webhook finds no row, returns `200 {order_found:false}`, and Square never retries. The shop has money but no order, address, options or design. Admin Orders, Finance and notifications never see it, and the only trace is one short-retention log line.
  4. Duplicates: the Square idempotency key is a fresh `randomUUID()` per request. Back, retry or refresh creates a new link, a new order row and a new promo increment. `CheckoutPageView` re-enables the Pay button in `finally` while the browser is still navigating.
- **Fix (implementation steps):**
  1. **Migration** (`NNN_checkout_order_integrity.sql`, next free number):
     ```sql
     alter table public.exp_orders drop constraint if exists exp_orders_payment_mode_check;
     alter table public.exp_orders add constraint exp_orders_payment_mode_check
       check (payment_mode in ('stripe_checkout','stripe_payment_link','square_payment_link','square_checkout')) not valid;
     alter table public.exp_orders validate constraint exp_orders_payment_mode_check;
     alter table public.exp_orders
       add column if not exists checkout_attempt_id uuid,
       add column if not exists square_payment_link_id text,
       add column if not exists square_payment_link_url text;
     create unique index if not exists exp_orders_checkout_attempt_uidx on public.exp_orders(checkout_attempt_id) where checkout_attempt_id is not null;
     -- run a duplicate check first: select square_order_id, count(*) from exp_orders where square_order_id is not null group by 1 having count(*)>1;
     create unique index if not exists exp_orders_square_order_uidx on public.exp_orders(square_order_id) where square_order_id is not null;
     ```
     Fold in the `exp_order_status_events` action_type widening from #21 if both ship together.
  2. **Re-order the route** (`src/app/api/square/checkout/route.ts`):
     1. Accept an optional `checkoutAttemptId` (uuid). If an `awaiting_payment` order with that id already has a `square_payment_link_url`, return it unchanged; this makes retries idempotent.
     2. Pre-generate `orderId = randomUUID()` and `guestTrackingToken = randomUUID()`.
     3. Insert the order with `id: orderId`, `square_order_id: null`, then insert the items. If either insert fails, delete the order row and return 500. **Do not call Square.**
     4. Reserve inventory here (#12). Claim promo usage here (#19).
     5. Call `createSquareCheckout` with:
        - `idempotencyKey: orderId`;
        - `reference_id: orderId` on the Square order;
        - `metadata: { exp_order_id: orderId }`;
        - `redirect_url: ${SITE}/checkout/success?order=${orderId}&access=${guestTrackingToken}`.

        Add `redirectUrl`/`referenceId` params to `createSquareCheckout` in `src/lib/square/client.ts`.
     6. Update the order with `square_order_id`, `square_payment_link_id` and `square_payment_link_url`, using `.select('id')`. If 0 rows come back, retry once. If it still fails, call the new `deleteSquarePaymentLink(id)` (DELETE `/v2/online-checkout/payment-links/{id}`, treating 404 as success), cancel the order, and return 500.
     7. If Square itself fails, mark the order `cancelled` with a status event, release the reservations, and return 502.
  3. **Webhook fallback** (pairs with #4): when no row matches `square_order_id`, retrieve the Square order (new `retrieveSquareOrder(id)`), match on `reference_id`. Otherwise insert an `exp_admin_notifications` row of type `payment_without_order` with the Square ids, and return 200.
  4. **Client** (`CheckoutPageView.tsx`): generate `checkoutAttemptId` once per (cart + address + rate + code) fingerprint in `sessionStorage`, wrapped in try/catch. Send it with the request. Do not reset `creatingSession` after `window.location.assign`.
- **Tests / acceptance criteria:** New `src/app/api/square/checkout/route.test.ts`, mocking Supabase and `fetch` the way `src/app/api/admin/orders/route.test.ts` does:
  - (a) insert error → 500, Square never called;
  - (b) the order insert happens before the Square call, which receives `idempotencyKey === orderId` and `reference_id === orderId`;
  - (c) the same `checkoutAttemptId` twice → one Square call;
  - (d) post-link update failure → link deleted, 500;
  - (e) Square error → order cancelled, 502.
  - Plus the schema-contract test from #16: every `payment_mode:` literal under `src/app/api` appears in the latest CHECK definition in `supabase/migrations`. That test fails on today's tree and passes after this item.
  - Manual: a sandbox purchase creates exactly one `exp_orders` row with `payment_mode='square_checkout'`, and it is marked paid by the webhook.
- **Risks / notes:** Abandoned checkouts now leave `awaiting_payment` rows with reservations; #38 adds the expiry sweeper. Ship #2, #4 and #12 in one batch if possible, because they share the order-creation sequence. Customers already affected need manual reconciliation (#1 check 1).

<a id="item-3"></a>
### #3 — Lock down database privileges: anon can execute SECURITY DEFINER RPCs, and an RLS-bypassing view is exposed
- **Priority:** P0 · **Rank:** 3/76 · **Lens:** Security · ✔︎ re-verified by coordinator
- **Severity:** High | **Effort:** S | **Confidence:** Likely. Coordinator verified that no migration contains `revoke execute … on function`; Supabase/Postgres grant EXECUTE to PUBLIC/anon/authenticated by default. Confirm with #1 checks 2–3. | **Sources:** SA-2 + SD-3 (functions, found independently by both security reviewers), SA-4 + SD-5 (view), UXA-25 (dead `CommissionQueueTracker`); lint error in that component | **Existing plan overlap:** none. `062_promo_usage_increment.sql` claims "service-role-only RPCs", but nothing enforces it.
- **Location:**
  - `supabase/migrations/061_security_remediation_followup.sql:42,76,170`
  - `supabase/migrations/062_promo_usage_increment.sql:1-33`
  - `supabase/migrations/064_fix_rate_limit_pk.sql:32,65`
  - `supabase/migrations/038_commission_queue_view.sql:5-33`
  - `supabase/migrations/049_Migration_1.sql:1304-1327,1576`
  - `src/lib/rate-limit.ts:71-84`
  - `src/app/api/webhooks/square/route.ts:95-100`
  - `src/app/api/promo/validate/route.ts:99-115`
  - `src/components/admin/CommissionQueueTracker.tsx` (imported nowhere; `npm run lint` reports `react-hooks/immutability` there)
- **Problem:** PostgREST exposes every public function at `/rest/v1/rpc/<name>`, and the anon key ships in the browser bundle.
  1. **Payment-webhook DoS.** The Square webhook rate-limit key is predictable: `square-webhook:<type>:<floor(now/60000)>`, 100 per minute, fail-closed. Calling `rpc/increment_rate_limit` 101 times per upcoming minute, with a far-future `p_expires_at` so cleanup never removes the rows, makes every genuine webhook get 429. Orders are then never marked paid while the attack runs. The same trick works on `intake:`, `artwork-upload:`, `search:` and per-IP admin keys, and it bloats the table.
  2. **Promo sabotage.** `/api/promo/validate` returns `promo.id` and `deals[].id`. Looping `exp_increment_promo_code_usage(id)` exhausts a code for everyone.
  3. **Inventory tampering.** `exp_reserve_order_inventory` and `exp_release_order_inventory` can be called for known order ids, which the view below leaks.
  4. **PII view.** `exp_commission_queue` has no `security_invoker`, so it runs as owner and bypasses RLS on orders and items. It is granted to `authenticated`, which every Google account that signs in at `/sign-in` or `/admin/login` becomes (non-admins stay signed in on `/admin/not-authorized`). `GET /rest/v1/exp_commission_queue` with that token returns every paid, undelivered order line: order UUID, product, variant, `character_name` and `nfc_target_data`. The default grants may also expose it to `anon`.
- **Fix (implementation steps):**
  1. Confirm the exact signatures: `select p.oid::regprocedure from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef;`
  2. Migration `NNN_db_privilege_lockdown.sql`:
     ```sql
     -- service-role-only RPCs
     revoke execute on function public.increment_rate_limit(timestamptz, text) from public, anon, authenticated;
     revoke execute on function public.cleanup_expired_rate_limits() from public, anon, authenticated;
     revoke execute on function public.exp_reserve_order_inventory(uuid) from public, anon, authenticated;
     revoke execute on function public.exp_release_order_inventory(uuid, text) from public, anon, authenticated;
     revoke execute on function public.exp_increment_promo_code_usage(uuid) from public, anon, authenticated;
     revoke execute on function public.exp_increment_bundle_deal_usage(uuid) from public, anon, authenticated;
     grant execute on function public.increment_rate_limit(timestamptz, text), public.cleanup_expired_rate_limits(),
       public.exp_reserve_order_inventory(uuid), public.exp_release_order_inventory(uuid, text),
       public.exp_increment_promo_code_usage(uuid), public.exp_increment_bundle_deal_usage(uuid) to service_role;
     -- future functions default to no public execute
     alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
     -- RLS-bypassing view
     revoke all on public.exp_commission_queue from anon, authenticated;
     drop view if exists public.exp_commission_queue;
     ```
     Leave trigger functions alone (e.g. `exp_mark_custom_request_paid()` is only reachable as a trigger; revoking is harmless but unnecessary). Use the signatures from step 1 if any differ.
  3. In the same migration, recreate `increment_rate_limit` with its 064 body unchanged, except clamp `p_expires_at := least(p_expires_at, now() + interval '1 day')`.
  4. Stop returning `id` for promos and deals from `/api/promo/validate`. Return only what the UI displays.
  5. Delete `src/components/admin/CommissionQueueTracker.tsx`, which also removes a lint error. Fix the "masked" claim in `docs/Database.md` and `docs/archive/verification/00_TABLES.md`.
  6. Apply via the SQL editor or `db query --linked` (not `db push`; OCT-13). The SQL is idempotent.
  7. Product decision to record under SEPT §10.17: if customers never sign in, disable "Allow new users to sign up" and pre-create admins with `auth.admin.createUser({ email, email_confirm: true })`. Either way, treat `authenticated` as untrusted everywhere.
- **Tests / acceptance criteria:**
  - Re-run #1 checks 2–3. `anon_exec` and `auth_exec` must be false for every non-trigger function, and no view may be granted to anon/authenticated.
  - Extend `scripts/test-rls-lockdown.mjs` (see #65) so `anon.rpc('increment_rate_limit', …)` fails with 42501 or PGRST202, and `exp_commission_queue` returns 42P01/42501.
  - New Vitest contract `src/lib/security/rpc-grants.contract.test.ts`: every `security definer` function created in `supabase/migrations` has a matching `revoke execute` in this or a later migration. Include a planted-offence fixture case.
  - New contract test: `/api/promo/validate` responses contain no `id` under `promo` or `deals` (route test with mocked Supabase).
- **Risks / notes:** All app callers already use `getSupabaseAdmin()` (service role), so nothing in the app breaks. Check that no Supabase Edge Function calls these RPCs as anon before revoking.

<a id="item-4"></a>
### #4 — Square webhook: marks orders paid without checking payment status, loses events on failure, ignores updates/refunds, has no state guard
- **Priority:** P0 · **Rank:** 4/76 · **Lens:** Payments · ✔︎ re-verified by coordinator
- **Severity:** High | **Effort:** M | **Confidence:** Code Confirmed (coordinator re-verified `route.ts:133` handles `payment.created`/`payment.completed` and never reads `payment.status`). Square event semantics Likely; confirm in the Square event log (#1 check 9). | **Sources:** SD-2, REL-2, SD-11 (Square half) | **Existing plan overlap:** none
- **Location:** `src/app/api/webhooks/square/route.ts:106-130` (dedupe insert before processing), `:133` (event types), `:141` (`total_money`), `:157` (amount check skipped when missing), `:170-181` (unguarded update; error only logged), `:235-245` (dead `payment.failed` branch); `src/lib/admin/notifications.ts:18-22,43`; `src/app/api/admin/orders/route.ts:261-306`
- **Problem:**
  1. **Status ignored.** `payment.created` is treated as paid without reading `payment.status` (APPROVED/PENDING/COMPLETED/FAILED/CANCELED). A FAILED payment at the right amount is marked paid and moved to `in_production`. For custom requests the trigger flips the request to paid and a "Payment received" email is sent.
  2. **Wrong event names.** `payment.completed` and `payment.failed` are not Square event types, so those branches are dead. `payment.updated` (the real COMPLETED/FAILED transition) and `refund.created`/`refund.updated` are never handled, so dashboard refunds never reach the app.
  3. **Amount check.** `total_money` includes tips and is skipped entirely when absent (`:157`). Split tender (gift card + card) mismatches only log.
  4. **Lost events.** The dedupe row is inserted **before** processing and any insert error is treated as a duplicate (200). A failed update only logs and returns 200, and a thrown error returns 500 but Square's retry hits the dedupe row. Either way the order stays pending forever. Dedupe rows are kept only 24 h.
  5. **No state guard.** The paid update has no `.eq('payment_status','pending')`, so a late event regresses `shipped` to `in_production` or resurrects `cancelled`. The admin PATCH has the mirror race: it reads the status, then writes with `.eq('id')` only.
  6. Sets `in_production`, never `paid`, so the "paid order awaiting production" notification (which looks for `status==='paid'`) never fires.
- **Fix (implementation steps):**
  1. **Migration** `NNN_mark_order_paid.sql`: `public.exp_mark_order_paid(p_order_id uuid, p_square_payment_id text, p_amount_cents bigint, p_paid_at timestamptz, p_source text) returns jsonb`, `security definer`, `set search_path = ''`, execute revoked from public/anon/authenticated (see #3). In one transaction:
     - lock the row `for update`;
     - if already paid, return `{ok:true, reason:'already_paid'}`;
     - if `round(order_total*100) <> p_amount_cents`, insert a `payment_webhook` status event and return `{ok:false, reason:'amount_mismatch'}`;
     - otherwise set `payment_status='paid'`, `paid_at = coalesce(paid_at, p_paid_at)`, `square_payment_id`, and `status='paid'` only when it was `awaiting_payment`; if it was `cancelled`, set `paid` but return `was_cancelled:true`;
     - insert a status event and return `{ok:true, reason:'marked_paid', was_cancelled}`.

     Inventory reservation now happens at checkout (#12), so this RPC does not reserve. If #12 ships later, call `exp_reserve_order_inventory` here.
  2. **Handler changes:**
     1. Dedupe rows: insert with `processed=false` (add the column if absent). Treat only error `23505` as a duplicate (200). Any other insert error → 500. Set `processed=true` after success. On a processing error, delete the dedupe row and return 500 so Square retries. Wrap the whole processing block in try/catch.
     2. Handle `payment.created` **and** `payment.updated`. Call the RPC only when `payment.status === 'COMPLETED'`, `amount_money.currency === 'USD'`, and `payment.location_id === process.env.SQUARE_LOCATION_ID`. Use `amount_money.amount` (excludes tips). If the amount is missing, do not mark paid.
     3. FAILED/CANCELED → `update … set payment_status='failed' where id=? and payment_status='pending'`. APPROVED/PENDING → record a status event only.
     4. Handle `refund.created`/`refund.updated` with `status==='COMPLETED'`: set `payment_status='refunded'` (or partially refunded), `refunded_at` and `refunded_amount` (add the columns).
     5. Remove the dead `payment.completed`/`payment.failed` branches. Guard every date parse (`new Date(x)`: check `isNaN`).
     6. Send customer email (#13/#14) and admin notifications only when the RPC returns `marked_paid`. Use `after()` from `next/server` so email latency does not delay the 200. Create an admin notification on `amount_mismatch`, `was_cancelled`, or unknown order (#2 step 3).
     7. Keep dedupe rows for 7 days.
  3. **Square dashboard:** subscribe the webhook to `payment.updated`, `refund.created` and `refund.updated` (owner action; note it in the PR).
  4. **Admin PATCH** (`src/app/api/admin/orders/route.ts`): every status write adds `.eq('status', order.status).select('id')` and returns 409 "Order changed — reload" when 0 rows match. Do the same for `cancel` and `mark_refunded`.
- **Tests / acceptance criteria:** New `src/app/api/webhooks/square/route.test.ts`, signing bodies with `createHmac('sha256', key).update(notificationUrl + body).digest('base64')`:
  - FAILED → no paid update;
  - APPROVED → no RPC;
  - `payment.updated` COMPLETED → RPC once;
  - RPC `already_paid` → no email;
  - missing amount → no RPC;
  - CAD currency → no RPC;
  - update/RPC throws → 500 and dedupe row deleted, then redelivery succeeds;
  - dedupe insert error `23505` → 200 duplicate; other insert error → 500;
  - bad signature → 401;
  - refund COMPLETED → `refunded`.

  Admin route test: a stale-status write → 409. Sandbox: pay with decline card `4000 0000 0000 0002` → order stays pending.
- **Risks / notes:** Orders already marked paid on a non-COMPLETED status need reconciling against Square's Payments API using `square_payment_id` (one-off script, read-only first). The status lands on `paid` rather than `in_production`, so check the admin Orders filters and the dashboard cards still show these orders.

<a id="item-5"></a>
### #5 — Pricing integrity and parity: the server accepts tampered option values, and ignores process add-ons, combo discounts and NFC that the storefront charges for
- **Priority:** P0 · **Rank:** 5/76 · **Lens:** Payments · ✔︎ re-verified by coordinator
- **Severity:** High | **Effort:** M | **Confidence:** Confirmed. Coordinator re-verified that `computeCanonicalLine(product, qty, variantId, selectedOptions)` has no process input and that the route ignores `selectedProcessKeys`. SD-1 confirmed the option bypass by running the real engine module. Money exposure depends on live data (#1 check 4). | **Sources:** SD-1, SD-9, UXS-4, REL-4 (three reviewers), plus the cart re-tier half of UXS-10 | **Existing plan overlap:** none. The August audit's "no price manipulation" claim is wrong.
- **Location:** `src/lib/pricing/engine.ts:1-16` (claims parity with the configurator), `:115-211` (esp. `:135-164`, `:189-190`); `src/app/api/square/checkout/route.ts:39`, `:225-230`, `:253-265`, `:304`; `src/components/shop/ProductConfigurator.tsx:163-226` (client pricing), `:273-280` (`addItem` drops NFC), `:382-407` (NFC UI); `src/components/cart/CartProvider.tsx:144-176,229-278`; `src/app/api/admin/catalog/pricing-preview/route.ts`
- **Problem:**
  1. **Tampering (SD-1).** A selected value that doesn't exactly match a defined value still prices at +$0 and is stored as typed. Proven by running the real engine module on a $40 product with "walnut +$25":
     - `"Walnut"` → $40, recorded as "Material: Walnut".
     - Disabled values (`is_enabled=false`) are priced and accepted.
     - Duplicate keys sum their deltas but record only the last value: `[cherry(-10)×3, walnut]` → $35, recorded as walnut.
     - Quantity `1.5` reaches Square as `"1.5"`.
     - Non-string values throw → 500. No length cap applies (body limit is 20 MB).
  2. **Parity (SD-9/UXS-4/REL-4).** The configurator adds `exp_product_process_pricing.price_delta` and `exp_product_combo_discounts`. The engine knows neither, and the route ignores `selectedProcessKeys`. So "UV print +$12" shows $37 and Square charges $25. A combo discount does the reverse: the customer is charged more than shown. The chosen process isn't stored, so the studio can't tell what was ordered. NFC add-on fields ("adds $N") live only in component state: not priced, not in the cart, not sent.
  3. **Cart re-tier (UXS-10/REL-4).** `CartProvider` quantity edits and merges scale the per-unit amount captured at add time and never re-evaluate bulk tiers. Example: add 10 at a 15% tier, drop to 2; the cart still shows 15% off and Square charges full price.
  4. Admin pricing-preview uses the same engine and is wrong the same way.
- **Fix (implementation steps):**
  1. **One pure pricing function.** In `src/lib/pricing/engine.ts`:
     - Extend `PricingContext` with `process_pricing` and `combo_discounts`.
     - Add `selectedProcessKeys: string[]` and `nfc?: {enabled:boolean}` parameters (or an options object).
     - Port `ProductConfigurator.tsx:163-226`, including the tier, process and combo helpers (percent, fixed, cheapest_free), so the module stays import-free and client-safe.
     - `ProductConfigurator`, `CartProvider` (repricing) and the checkout route all call this one function.
  2. **Validation inside `computeCanonicalLine`.** Return `null` (the route then returns 400) when any of these holds:
     - quantity is not an integer in 1–999;
     - an option entry isn't `{key: string, value: string}`;
     - a key is unknown or repeated;
     - a value is longer than 500 characters;
     - a `select` (or `checkbox` with defined values) value isn't found via `def.values.find(v => v.value === value && v.is_enabled)`;
     - a process key is unknown or disabled.

     Rules for accepted values:
     - text/textarea/file options never carry a delta;
     - number options must be finite;
     - descriptions and snapshots use the matched value's canonical `label`/`value`.
  3. **Route.** `fetchPricingContext` also selects process pricing and combo discounts (same for pricing-preview). Return 400 for a non-integer quantity instead of clamping.
  4. **Persist what was sold.** Migration `NNN_order_item_process_keys.sql`: `alter table public.exp_order_items add column if not exists selected_process_keys text[] not null default '{}', add column if not exists nfc jsonb;`. Store them in the snapshot and in the Square line description.
  5. **NFC.** Either add `{enabled, targetData, leaveUnlocked}` to `CartItem`, price it with `nfc_price_delta`, persist it and show it on cart lines; or hide the NFC block and remove the "adds $N" copy (owner decision).
  6. **Cart.** Store the pricing inputs on the `CartItem` (variant, options, process keys, quantity) and recompute line totals through the engine on every quantity change. No more `lineTotal / item.quantity`.
  7. **Show the charged total.** Have the route return `chargedTotalCents`. If it differs from the client summary by any amount, show "Your total was updated to $X — continue?" instead of redirecting silently.
- **Tests / acceptance criteria:**
  - `engine.test.ts`, each returning `null` without throwing:
    - case-mismatched value;
    - disabled value;
    - duplicate key;
    - unknown key;
    - non-string value;
    - quantities 1.5, 0 and 1000.
  - `engine.test.ts`, pricing cases:
    - free text prices at +$0;
    - a +$5 process adds 500¢;
    - `cheapest_free` subtracts the smaller delta;
    - unknown process key → `null`.
  - Parity test: one shared fixture priced through the configurator import path and the route path gives equal cents.
  - Cart test: re-tier when quantity goes 10 → 2. Contract: no `lineTotal / item.quantity` in `CartProvider`.
  - Route test (from #2): a tampered option → 400 and `createSquareCheckout` not called; honest walnut → 6500¢; +$12 process → +1200¢; the snapshot contains `selected_process_keys`.
  - Manual (Square sandbox): the Square total equals the product-page total for a product with a process add-on and a combo.
- **Risks / notes:** Carts saved in `localStorage` will be re-priced on load; show the new total rather than charging silently. Honest buyers are unaffected by the validation, since the storefront already offers only enabled values (`queries/products.ts:438-440`). Rounding is a separate issue (#35).

<a id="item-6"></a>
### #6 — The whole custom-request pipeline is dead in the admin panel: every quote/reject/handoff/export action fails CSRF
- **Priority:** P0 · **Rank:** 6/76 · **Lens:** Admin · ✔︎ re-verified by coordinator
- **Severity:** High | **Effort:** S | **Confidence:** Confirmed. Coordinator re-verified that `AdminCsrfFetchBridge.tsx:28` only covers `/api/admin`, the 7 `fetch` calls in `custom-requests/page.tsx` target `/api/custom-orders/*` and `/api/designs/export` with no `x-csrf-token`, and `requireAdminApiSession` → `requireCsrf` requires the header. | **Sources:** UXA-2, SA-6 (found independently by two reviewers) | **Existing plan overlap:** none
- **Location:** `src/components/admin/AdminCsrfFetchBridge.tsx:26-28`; `src/app/admin/(panel)/custom-requests/page.tsx:134,164,199,228,266,298,380`; `src/app/api/custom-orders/[id]/route.ts:189-198`; `src/app/api/designs/export/route.ts:160-169`; `src/lib/admin/auth.ts:142-151`; `src/lib/security/csrf.ts:168-182`
- **Problem:** These actions all return 403 "CSRF token missing or invalid." before any work happens:
  - Send Quote, Resend Quote, Extend Expiry, Handoff to Production, Reject, Reopen;
  - Generate Exports.

  The owner cannot run intake → quote → pay → produce from the panel. These admin mutations also live outside `/api/admin`, so they skip the edge gate (the server-side gate is still correct) and are not covered by the route-pattern contract test.
- **Fix (implementation steps):**
  1. **Preferred:** move the admin mutations into the admin namespace.
     - Create `src/app/api/admin/custom-requests/[id]/route.ts` and move the `PATCH` handler there verbatim from `src/app/api/custom-orders/[id]/route.ts` (≈ lines 189-549), together with its helpers (`sendQuoteEmail`, `createSquareQuotePaymentLink`, …). Move shared helpers to `src/lib/custom-requests/` rather than duplicating them.
     - Update the audit `route` strings.
     - Keep the public token-gated `GET` in `custom-orders/[id]` and **delete its PATCH**.
     - Create `src/app/api/admin/designs/export/route.ts` and delete the old route.
     - Update the 7 `fetch` URLs in `custom-requests/page.tsx`.
  2. **Minimal alternative**, if a move is too risky in one batch: export `ADMIN_MUTATION_PREFIXES = ['/api/admin', '/api/custom-orders/', '/api/designs/export']` from the bridge and use it in `shouldAttachCsrfHeader`, keeping the same-origin check.
- **Tests / acceptance criteria:**
  - New `src/components/admin/admin-fetch-scope.contract.test.ts`, using `listSourceFiles()`/`stripComments()` from `src/lib/testing/source-contract.ts`. Every `fetch(` under `src/app/admin/**` and `src/components/admin/**` whose options contain `method: 'POST'|'PUT'|'PATCH'|'DELETE'` must target a URL starting with `/api/admin` (or an exported allow-listed prefix). Include a planted-offence case.
  - Route test for the moved handler, using the orders route-test mocking pattern.
  - Manual: "Send quote" on a test request returns 200, creates a Square sandbox link and an `exp_orders` row, and shows success.
- **Risks / notes:** Once this works, the owner can actually click Send Quote, so ship #15 (stale links) and the UXA-3 confirm dialog (#28) **in the same batch or immediately after**. Today those bugs are masked by this one.

<a id="item-7"></a>
### #7 — "Save Base Price" on the product pricing page silently turns off the embedded designer and erases the mockup URL
- **Priority:** P0 · **Rank:** 7/76 · **Lens:** Admin · ✔︎ re-verified by coordinator · **Source finding:** UXA-1
> **Coordinator note:** Re-verified: `products/[id]/route.ts:110` defaults `has_designer` to `false` and the pricing page body (`pricing/page.tsx:140-151`) omits it. Step 1 (hotfix) is a few lines and can ship in Batch A on its own.

- **Severity:** Critical | **Effort:** M (S hotfix + M for PATCH semantics) | **Confidence:** Confirmed | **Overlaps:** none
- **Location:** `src/app/admin/(panel)/catalog/products/[id]/pricing/page.tsx:137-151`; `src/app/api/admin/catalog/products/[id]/route.ts:106-111,133-148`; also `catalog/products/[id]/page.tsx:189-193`, `builder/page.tsx:302-318`
- **Problem:** `PUT /api/admin/catalog/products/[id]` replaces the whole row. Every field missing from the body falls back to a default, and `has_designer` defaults to `false`. The pricing page builds an explicit body that omits `has_designer` and `designer_mockup_url`. Whenever the owner changes a price there, the product's embedded designer is switched off and its mockup URL is nulled. The page reports "Base price saved." and nothing on screen shows the side effect, because the pricing page renders neither field. Customers lose the designer until someone re-ticks the box in the builder.
  The same full-replace model also makes the three product editors (detail page, builder, pricing page) overwrite each other. Each one resends `base_price`, `title`, `description` and so on from whatever it loaded. If the owner has the builder open in one tab and changes the price on the pricing page in another, the next "Save Product" in the builder restores the old price.
- **Evidence:**
  ```ts
  // pricing/page.tsx:140-151 — body has no has_designer / designer_mockup_url
  body: JSON.stringify({ title: product.title, slug: product.slug, category_key: product.category_key,
    base_price: Number(basePrice), sort_order: product.sort_order, /* … */ is_customizable: product.is_customizable }),
  // products/[id]/route.ts:110-111
  const hasDesigner = asBoolean(body.has_designer, false)
  const designerMockupUrl = asString(body.designer_mockup_url, 2000) || null
  ```
- **Fix (implementation steps):**
  1. **Hotfix (S):** in `pricing/page.tsx`, add `has_designer` and `designer_mockup_url` to the `ProductPricing` interface and to the PUT body. They are already present in `productPayload.product`.
  2. **Root fix (M):** add a `PATCH` handler to `src/app/api/admin/catalog/products/[id]/route.ts` that validates and updates only the keys present in the body. Use `Object.prototype.hasOwnProperty.call(body, k)` per field and reuse the existing validators. Keep `PUT` temporarily for compatibility.
  3. Switch all three callers to send only the fields they edit. The pricing page sends `{ base_price }`. The builder and detail page send a diff against the loaded snapshot: keep `const [loaded, setLoaded] = useState<ProductDetail>()` and send only keys where `product[k] !== loaded[k]`.
  4. **Optimistic concurrency:** send `expected_updated_at: loaded.updated_at`. In the route, add `.eq('updated_at', expected)` to the update. If no row comes back, return `409 { error: 'This product was changed elsewhere. Reload to see the latest version.', current }`. The client shows that message with a "Reload" action instead of overwriting.
  5. Retire the legacy editors. The detail page and pricing page are no longer linked from the products list, which links to `/builder`. Replace both `page.tsx` files with `redirect(\`/admin/catalog/products/${id}/builder\`)` so only one editor can write.
- **Tests / acceptance criteria:**
  - New `src/app/api/admin/catalog/products/[id]/route.test.ts`, mocking Supabase the way `src/app/api/admin/orders/route.test.ts` does:
    - (a) a PATCH body `{ base_price: 12 }` produces an `update()` payload with exactly `{ base_price: 12 }`;
    - (b) a stale `expected_updated_at` returns 409;
    - (c) PUT without `has_designer` does not write `has_designer:false`, if PUT is kept.
  - Contract test asserting that `pricing/page.tsx` does not call `method: 'PUT'` on the products route.
  - Manual: tick "Has Embedded Designer" in the builder, change the price on the pricing page, reload the builder. The box stays ticked.
- **Risks / notes:** Products whose designer was turned off by an earlier pricing save need a one-off data check:
  `select id from exp_products where has_designer = false and designer_mockup_url is null and updated_at > '<deploy date of pricing page>'`.

<a id="item-8"></a>
### #8 — Abandoned-cart "recovery" emails customers who already paid, shows prices 100× too small, and repeats attacker-supplied text
- **Priority:** P0 · **Rank:** 8/76 · **Lens:** Reliability · ✔︎ re-verified by coordinator
- **Severity:** High | **Effort:** S–M | **Confidence:** Confirmed. Coordinator re-verified `abandoned-cart.ts:46` (`lineTotal / 100`), `:186` (`order_total / 100`) and `:229` (`order_id is null`), and that nothing ever sets `exp_cart_captures.order_id`. | **Sources:** REL-5, SD-10(2) | **Existing plan overlap:** SEPT §2.3 is marked DONE but the linkage was never implemented.
- **⚠️ Operational note for the owner, effective now:** **do not press "Run batch" on Admin → Abandoned Carts** until this ships.
- **Location:** `src/components/checkout/CheckoutPageView.tsx:122-137` (capture on every Pay click); `src/app/api/cart/capture/route.ts:42-52,111-117`; `src/lib/abandoned-cart.ts:39-55,46,180-187,219-270`; `supabase/migrations/024_abandoned_cart_recovery.sql:11-13`; `src/app/api/admin/abandoned-carts/route.ts:42-51`
- **Problem:**
  1. A capture is written on every Pay click, and `order_id` is never set (024's "linked back" was never built). The batch selects `order_id is null` older than 60 min, so **every paying customer** gets "You left something behind".
  2. `lineTotal` is stored in dollars, but the email divides by 100: $25.00 renders as $0.25. The same bug exists for `order_total` on the order path.
  3. The capture stores client-supplied `title` and `lineTotal`, and the email repeats that text from the shop's domain. Anyone can make the shop email arbitrary product text to an address of their choosing.
  4. The "sessions" tab looks for `cancelled`/`failed` orders, which never occur with Square. `processCheckoutAbandonmentRecovery` has no caller. There is no unsubscribe link (see #40).
- **Fix (implementation steps):**
  1. **Link captures to orders.** In the checkout route, right after the order insert (#2):
     ```ts
     await supabase.from('exp_cart_captures').update({ order_id: orderId })
       .eq('email', buyerEmail).is('order_id', null).gte('created_at', new Date(Date.now() - 2*3600e3).toISOString())
     ```
     Better: have the client send the `captureId` returned by `/api/cart/capture` and link by id.
  2. **Never email paying customers.** In the batch, skip a capture when a paid order exists for that email created at or after the capture. Use a service-role-only view `exp_abandoned_cart_candidates` or a `not exists` filter.
  3. **Store references, not text.** Captures store only `{productId, variantId, quantity}`. Titles and prices are looked up from `exp_products` at send time.
  4. **Formatting.** Add a shared `formatUsd(dollars: number)` in `src/lib/format.ts` and replace both `/ 100` sites.
  5. **Capture timing.** Capture on email-field blur (debounced, with the consent check in #40), not on Pay.
  6. Point the sessions path at `awaiting_payment` orders older than the hold window (claim with a conditional update before sending), or delete it and the dead `processCheckoutAbandonmentRecovery`.
  7. Add the marketing footer and unsubscribe from #40 before re-enabling sends.
- **Tests / acceptance criteria:** New `src/lib/abandoned-cart.test.ts`:
  - a capture followed by a paid order for the same email → excluded;
  - HTML for a $25.00 line contains `$25.00`;
  - the title comes from the product row, not the capture.

  Route test: the checkout route issues the capture-link update. Contract test: no `/ 100` in `abandoned-cart.ts`.
- **Risks / notes:** Captures already in the table have no `order_id`. Before re-enabling, run a one-off backfill joining captures to paid orders by email and time.

<a id="item-9"></a>
### #9 — Finish the dependency cleanup: two production advisories reappeared after Batch 9, the unused `square`/`codegraph` packages still ship, and an unfixable dev-only chain keeps the CI audit gate red
- **Priority:** P0 · **Rank:** 9/76 · **Lens:** Security · ✔︎ re-verified by coordinator
- **Severity:** Medium. Was High at `4aeb56f`: Batch 9 in `963e97f` cleared the critical `next` advisory plus `axios`, `@xmldom/xmldom` and `brace-expansion`. | **Effort:** S | **Confidence:** Confirmed. The coordinator ran `npm audit` on `963e97f` on 2026-10-08: **7 high, 0 critical**, of which 2 are in production (`npm audit --omit=dev`). | **Sources:** coordinator `npm audit` (both runs); OCT-12/OCT-30; SD-14 (`codegraph`); REL-15 (unused `square` SDK) | **Existing plan overlap:** SEPT §1.5 and OCT-30 record "`npm run audit` exits 0" as of 2026-10-01. That is **no longer true**; new advisories were published since.
- **Audit on `963e97f` (2026-10-08):**

  | Package | Sev. | Path | Reachable? | Fix |
  |---|---|---|---|---|
  | `sharp` 0.35.4 | high (prod) | `next@16.3.8` → `sharp` | GHSA-wq5f-xc86-pv6w (librsvg CVE in SVG decoding). `next/image` isn't used and SVG optimisation is off by default, so low | `npm audit fix` → ≥ 0.35.5 (in range) |
  | `source-map-js` 1.2.1 | high (prod) | `next` → `postcss` (and `vitest` → `vite` → `postcss`) | GHSA-68fv-2mgg-jv7q (event-loop DoS on crafted source maps). Build-time only in practice | `npm audit fix` → ≥ 1.2.2 |
  | `braces`, `micromatch`, `fast-glob`, `@next/eslint-plugin-next`, `eslint-config-next` | high (dev) | `eslint-config-next` lint tooling | dev-only. `npm audit` offers **no non-breaking fix** (it suggests downgrading to `eslint-config-next@14`, which is wrong) | `overrides` if a patched `braces` exists; otherwise accept as dev-only (step 4) |
  | `axios` 1.20.0 | (not flagged now) | `square@44` → `square-legacy` → `@apimatic/axios-client-adapter` | no. **The `square` SDK is never imported** (`src/lib/square/client.ts` uses `fetch`) | `npm uninstall square` removes it and its whole subtree |
  | `codegraph` ^1.0.0 | supply chain | direct, **production** dependency | the published package is an empty `package.json`, imported nowhere; any future 1.x publish would run install scripts in CI and the Vercel build | `npm uninstall codegraph` |
- **Fix (implementation steps)**, in a lockfile-only PR (OCT-12's advice):
  1. `npm audit fix` (non-breaking only; **never** `--force`). Expect `sharp` and `source-map-js` to bump.
  2. `npm uninstall square codegraph`.
  3. If a patched `braces` exists, add `"overrides": { "braces": "^<patched>" }` and re-run `npm ci && npm run lint`.
  4. Make the CI gate meaningful. Change the `audit` script and the `security-audit.yml` step to `npm audit --omit=dev --audit-level=high`, so unfixable dev-only tooling advisories don't keep CI permanently red. Add a weekly scheduled full `npm audit` job that reports without blocking. Record the change in OCT-30, since its "exits 0" claim no longer holds.
  5. Keep the OG/icon routes static: `ImageResponse` is still used, and GHSA-vcvr-r3jv-pc5j showed what happens when request data reaches it. Add a contract test asserting `src/app/opengraph-image.tsx` and `src/app/icon.tsx` don't read `searchParams`, `params` or `headers()`.
  6. Re-run `npm run type-check && npx vitest run && npm run build`.
- **Tests / acceptance criteria:**
  - `npm audit --omit=dev --audit-level=high` exits 0.
  - `npm ls square codegraph axios` is empty.
  - Type-check, the test suite (57 files / 406 tests on `963e97f`) and the build pass.
- **Risks / notes:** Low; these are in-range bumps. Check that `src/proxy.ts` still exports `proxy`, which `src/proxy.test.ts` pins.

<a id="item-10"></a>
### #10 — The dev sign-in helper's loopback check is a no-op under `next dev`: anyone on the LAN can mint a production admin session (now with MFA completed), and a TOTP secret for the production admin is stored in plaintext in `%TEMP%`
- **Priority:** P0 · **Rank:** 10/76 · **Lens:** Security · ✔︎ re-verified by coordinator
- **Severity:** High (the session mint is exposed only while `ADMIN_DEV_SIGNIN_ENABLED=true` and `next dev` is running; the stored TOTP secret persists after that) | **Effort:** S | **Confidence:** Confirmed. Traced through installed Next 16.3.4. Coordinator re-verified the gate at `route.ts:43` on both `4aeb56f` and `963e97f`, and the MFA escalation added in `963e97f`. | **Sources:** SA-1, plus coordinator review of `963e97f` | **Existing plan overlap:** none. SEPT Batch 8 and UI_AUDIT §15.3/§15.8 describe the loopback check as a security gate; Batch 9 added `escalateToAal2` for §10.16.
- **Location:** `src/app/api/dev/session/route.ts:43` (gate), `:110-118` (aal2 escalation, added in `963e97f`); `src/lib/dev/dev-signin.ts:63-77`, `:163-176` (`MFA_FACTOR_FILE = join(tmpdir(), 'rrs-dev-mfa-factor.json')`, which stores `{factorId, secret}` in plaintext), `:188-207` (`escalateToAal2` enrols a TOTP factor on the admin account); `node_modules/next/dist/server/lib/router-utils/resolve-routes.js:117`; `UI_AUDIT.md:51,467`; `src/app/api/dev/session/route.test.ts`
- **Update for `963e97f` (mandatory admin MFA, §10.16):**
  - The panel and admin API now demand `aal2`. This helper defeats that requirement: when the minted session is `aal1`, `escalateToAal2` enrols a dedicated TOTP factor **on the real allow-listed admin account** (dev uses the production project per OCT-14/OCT-18), completes the challenge, and returns an `aal2` session. So the LAN attack below yields a fully MFA-satisfied admin session.
  - The factor's **TOTP secret is written in plaintext** to `%TEMP%\rrs-dev-mfa-factor.json` and reused on later runs. Anyone who reads that file (malware, a backup, another local user) can generate valid second-factor codes for the production admin indefinitely. The factor stays enrolled on the account until it is deleted.
- **Problem:**
  - The gate is `isLoopbackHostname(request.nextUrl.hostname)`. On a real Next server, `nextUrl` is built from the server's **bind** hostname (`opts.hostname || 'localhost'`), not the client address or Host header.
  - `npm run dev` (no `-H`) listens on all interfaces, so every request sees `localhost` and the check always passes. The unit test constructs `new NextRequest('http://rubysrelicsstudio.vercel.app/...')`, a URL a real server never produces, so it gives false assurance.
  - UI_AUDIT §15.3 tells the operator to put the flag in `.env`, which points at the **only** (production) Supabase project (OCT-14/OCT-18).
  - Attack:
    1. While the developer runs `npm run dev` on café or office Wi-Fi, a peer runs `curl -i http://<dev-ip>:3000/api/dev/session`.
    2. The response is `Set-Cookie: sb-<ref>-auth-token=…`, carrying access and refresh tokens for the real allow-listed admin.
    3. The attacker replays the cookie on the production `/admin`.
  - DNS rebinding also works in browsers without Local Network Access protection.
- **Fix (implementation steps):**
  1. `dev-signin.ts`: add `ADMIN_DEV_SIGNIN_TOKEN` (≥ 32 chars). `describeDevSigninGate` refuses without it. Add `isValidDevSigninToken(provided, expected)` using `timingSafeEqual` on equal-length Buffers (false on length mismatch).
  2. `route.ts`:
     1. Require header `x-dev-signin-token`; the harness sets it via CDP `Network.setExtraHTTPHeaders`. Return 404 when missing or wrong, **before** `getSupabaseAdmin()`.
     2. Replace `request.nextUrl.hostname` with a parsed raw `Host` header (must handle `[::1]:3210`). This blocks DNS rebinding; the token is the control against LAN attackers.
     3. Return 404 when `sec-fetch-site` is present and not `none`/`same-origin`.
  3. Refuse unless the `NEXT_PUBLIC_SUPABASE_URL` host is `localhost`/`127.0.0.1`, or a second opt-in `ADMIN_DEV_SIGNIN_ALLOW_HOSTED=true` is set.
  4. Update `UI_AUDIT.md` §3/§15:
     - start with `npm run dev -- -p 3210 -H 127.0.0.1`;
     - pass the flag and token as process env for a single run, **never** in `.env`;
     - end each run with a global `signOut`.
  5. Consider deleting the helper entirely once the admin audit work is done.
  6. **MFA escalation (`963e97f`):**
     1. Stop persisting the secret. Enrol a fresh factor per run (give it a recognisable `friendlyName`, e.g. `dev-harness-<timestamp>`), and unenroll it at the end of the run (`mfa.unenroll({ factorId })`) or on the next start.
     2. If persistence is kept for speed, store the secret outside `%TEMP%` with user-only ACLs, and never for a hosted (non-local) Supabase project.
     3. Make step 3 (refuse unless the Supabase URL is local, or `ADMIN_DEV_SIGNIN_ALLOW_HOSTED=true`) **mandatory** for the escalation path.
  7. **Clean up now (owner, one-off):**
     1. Delete `%TEMP%\rrs-dev-mfa-factor.json` on every machine that ran the helper.
     2. Remove the dev factor from the admin account with the service role: `supabase.auth.admin.mfa.deleteFactor({ userId, id: '<factorId from that file>' })`.
     3. Prefer that targeted delete to `npm run admin:reset-mfa`, which deletes **all** factors, including the owner's real authenticator.
- **Tests / acceptance criteria:**
  - `dev-signin.test.ts`: `escalateToAal2` never calls the injected persistence writer with a `secret`, and it unenrolls the factor it created (inject the fakes as the existing test does).
  - `route.test.ts`:
    - a request to `http://localhost:3000/api/dev/session` with `Host: evil.example` → 404, and `getSupabaseAdmin` not called;
    - missing or wrong token → 404;
    - correct token + `Host: localhost:3000` → 200;
    - `sec-fetch-site: cross-site` → 404;
    - `Host: [::1]:3210` accepted.
  - Source contract: the route has no `nextUrl.hostname`.
  - Manual: `curl -H "Host: evil.example" http://127.0.0.1:3210/api/dev/session` → 404.
- **Risks / notes:** Update the harness in the same commit. Separate Supabase projects for dev/preview (#11) shrink this class of problem entirely.

<a id="item-11"></a>
### #11 — Supabase Auth configuration the admin model depends on is documented insecurely: wildcard redirect URLs on production, admin grants resolved by email
- **Priority:** P0 · **Rank:** 11/76 · **Lens:** Security
- **Severity:** Medium (if live). Was High at `4aeb56f`; mandatory MFA in `963e97f` mitigates part (a), but not part (b). | **Effort:** S | **Confidence:** Needs-verification (dashboard state; #1 check 9) | **Sources:** SA-3 | **Existing plan overlap:** none (§10.13 covers only `NEXT_PUBLIC_SITE_URL`)
- **Location:** `docs/GOOGLE_AUTH_SUPABASE.md:104-113`; `src/lib/auth/redirect.ts:86-92`; `src/lib/supabase/env.ts:69-77`; `scripts/lib/admin-allowlist.mjs:93-121,131-139`; `scripts/grant-admin.mjs`; `src/components/admin/AdminMfaView.tsx:41-53` (first-time TOTP enrolment)
- **Update for `963e97f`:** Both admin gates now require `aal2` (`src/lib/admin/auth.ts:175`, `:248`).
  - **Part (a), mitigated:** a stolen OAuth code yields only an `aal1` session. That session reaches `/admin/mfa`, where it would need the real admin's authenticator. This holds **as long as the real admin has already enrolled a factor**.
  - **Part (b), unchanged:** `AdminMfaView` offers first-time enrolment to an allow-listed account with no factors. An attacker whose pre-registered account gets granted can enrol their own authenticator and reach `aal2`.

  Keep the dashboard cleanup either way, because exact redirect URLs are cheap defence in depth.
- **Problem:**
  - **(a) Redirect allow-list.** The guide says to add `https://<domain>/**`, `http://localhost:3000/**` and `https://*-<team-slug>.vercel.app/**` to the single production project. Supabase honours any allow-listed `redirect_to` for a flow the *attacker* starts:
    1. The attacker sends the admin an `/auth/v1/authorize?provider=google&redirect_to=<matching attacker URL>&code_challenge=<attacker's>` link.
    2. Google skips the account chooser, and the admin's code lands on the attacker's preview or localhost.
    3. The attacker exchanges the code with their own verifier and gets an admin session.

    The app's PKCE doesn't help, because the attacker owns the flow. Whether another Vercel account can claim a `*-<slug>` hostname is unverified. The localhost entry sends production codes to whatever listens on the admin's port 3000.
  - **(b) Grants by email.** `grantAdmin()` finds the user by matching email from `listUsers()` without checking provider or `email_confirmed_at`. If the Email provider is on with confirmation off, an attacker can pre-register the future admin's address, and `admin:grant` grants the attacker's row. SEPT §10.0 itself calls email-based granting an account-takeover path.
- **Fix (implementation steps):**
  1. **Dashboard (owner):**
     - Auth → URL Configuration: keep only the exact production callback(s), e.g. `https://rubysrelicsstudio.vercel.app/auth/callback` plus any custom domain. Remove `/**`, `*.vercel.app` and localhost entries. If the exact entry rejects the `?next=` query, carry `next` in a short-lived first-party cookie set before `signInWithOAuth` instead.
     - Auth → Providers: disable Email, Phone and Anonymous unless needed; if Email stays, require confirmation.
  2. Use a **separate Supabase project** for local and preview environments (also shrinks #10).
  3. Rewrite `docs/GOOGLE_AUTH_SUPABASE.md` §4 and the comment at `redirect.ts:88-92`.
  4. In `scripts/lib/admin-allowlist.mjs`, add `assertGrantableUser(user)` and call it before any write. It requires `email_confirmed_at` and `identities.some(i => i.provider === 'google')`.
  5. In `grant-admin.mjs`, print user id, providers and `created_at`, and require a matching `--confirm-user-id <uuid>`.
- **Tests / acceptance criteria:**
  - New `src/lib/admin/admin-allowlist-script.test.ts`, importing the `.mjs` module:
    - unconfirmed user → throws;
    - user without a Google identity → throws;
    - confirmed Google user → passes;
    - a failing user causes no `upsert`/`updateUserById` call.
  - Acceptance: a hand-crafted authorize URL with `redirect_to=https://x-<slug>.vercel.app/` falls back to the Site URL.
- **Risks / notes:** Preview sign-in breaks unless previews get their own project; that is intended.


---

## 6. P1 — Core-flow correctness

<a id="item-12"></a>
### #12 — Inventory is never reserved, decremented or checked at checkout, so one-of-a-kind items can be oversold
- **Priority:** P1 · **Rank:** 12/76 · **Lens:** Payments
- **Severity:** High | **Effort:** M | **Confidence:** Confirmed: `exp_reserve_order_inventory` has no caller in `src/` and no trigger. Size the impact with #1 check 7. | **Sources:** SD-7, REL-3, UXS-13 (server half), UXA-6 (transition→cancelled skips release) | **Existing plan overlap:** migration 061 "P-6" assumes reserve is called at checkout.
- **Location:** `supabase/migrations/061_security_remediation_followup.sql:76-167`; `src/app/api/square/checkout/route.ts:64-130,214-238`; `src/components/shop/ProductConfigurator.tsx:157-161,253,450`; `src/app/api/admin/orders/route.ts:299-301` (transition to cancelled), `:364-370` (cancel action releases)
- **Problem:**
  - Stock, `force_out_of_stock` and max-quantity are enforced only in the browser. A direct POST, or an old cart, buys out-of-stock items or more units than exist.
  - Nothing decrements stock on sale, so `available_qty` never moves. Concurrent buyers oversell, and low-stock and back-in-stock signals are wrong.
  - Cancel → release returns `not_reserved` and does nothing.
  - Cancelling via the Transition dropdown never calls release at all.
- **Fix (implementation steps):**
  1. In the checkout route, for each line with `is_ready_made`, fetch the `exp_product_inventory` row. Sum quantity per product and evaluate with `evaluateInventoryState()` from `src/lib/inventory/state.ts`. Return 409 `{error: 'Only N left', productId, available}` when short.
  2. After the order and items are inserted (#2 step 2.3), call `supabase.rpc('exp_reserve_order_inventory', { p_order_id: orderId })`. If it returns `ok:false`, delete or cancel the order and return 409 **before** any Square link exists.
  3. Expiry: the #38 sweeper releases reservations, deletes the Square link and cancels `awaiting_payment` orders older than the hold window (60 min suggested).
  4. Paid after release: `exp_mark_order_paid` (#4), or the webhook, re-reserves when the hold was already released. If stock is now insufficient, still mark the order paid and create an "oversold" admin notification.
  5. Admin: remove `cancelled` from the Transition options, client (`orders/page.tsx:132-143`) and server (`transitionAllowed`), so cancelling always goes through `action:'cancel'`, which releases. See UXA-6 (#23) for the confirm dialog.
  6. Storefront UX for sold-out items (notify-me, labels) is #55.
- **Tests / acceptance criteria:**
  - Route tests:
    - `force_out_of_stock` → 409;
    - quantity above available → 409;
    - reserve `ok:false` → 409 with no Square call;
    - happy path reserves exactly once.
  - Admin route test: transition→cancelled → 400.
  - Staging: two concurrent reserves on a qty-1 item → exactly one succeeds (the RPC uses `FOR UPDATE`).
  - Manual: a sale writes an `order_reserved` adjustment and decrements stock.
- **Risks / notes:** Ship with #3; reserve/release must not be anon-callable once they matter. Holds from abandoned checkouts need #38 alongside, or stock drains.

<a id="item-13"></a>
### #13 — After paying, shop customers see "Stripe redirected successfully…" and get no order number, confirmation email or tracking link
- **Priority:** P1 · **Rank:** 13/76 · **Lens:** Storefront · ✔︎ re-verified by coordinator
- **Severity:** High | **Effort:** M | **Confidence:** Confirmed. Coordinator re-verified that `success/page.tsx:44` queries `.eq('stripe_session_id', sessionId)` from a `session_id` param Square never sends, and `square/client.ts:66` sets a bare `redirect_url`. Square's own appended params need a sandbox check. | **Sources:** UXS-5, REL-7 | **Existing plan overlap:** none
- **Location:** `src/app/checkout/success/page.tsx:36-66,85-91,120-123,205-213`; `src/components/checkout/ClearCartOnSuccess.tsx:9-11`; `src/lib/square/client.ts:65-67`; `src/app/api/square/checkout/route.ts:453,509-513`; `src/app/api/webhooks/square/route.ts:183-226`; `src/app/api/shippo/webhook/route.ts:160-161`; `src/app/orders/[id]/page.tsx:72-83,154-162`
- **Problem:**
  1. Every shop customer lands on the fallback: "Stripe redirected successfully. Your payment is still syncing, but your order record has been created." There is no order id, summary, shipping line or tracking button. The record may not even exist (#2).
  2. The route returns `guestTrackingToken`, but the client drops it.
  3. The webhook emails only custom-request orders. The tracking link is first sent when Shippo reports a shipment, which can be weeks later for made-to-order items. `customer_email` is optional and never backfilled from Square.
  4. The cart is cleared on **any** visit to `/checkout/success`.
  5. `/orders/[id]` shows raw enum values (`awaiting_payment`), no options, and times in UTC.
- **Fix (implementation steps):**
  1. Use the redirect from #2: `/checkout/success?order={id}&access={token}`.
  2. Success page:
     - Load the order by `id` **and** `guest_tracking_token`.
     - Remove `stripe_session_id`, the `session_id` param and all "Stripe" copy.
     - Show items, options, shipping and total.
     - While unpaid, poll with `router.refresh()` every 5 s for up to 60 s. If still pending, server-side reconcile via `retrieveSquareOrder` + `exp_mark_order_paid` (#4).
     - Add `robots: { index: false }`.
  3. `ClearCartOnSuccess`: clear only when an order was found (pass a prop from the server page).
  4. Confirmation email: send from the webhook's paid transition, only on `marked_paid`, with idempotency key `paid:${orderId}` (#14). Include items, options, total, production estimate and the `/orders/{id}?access=` link. Make buyer email required at checkout (#30). Backfill `customer_email` from `payment.buyer_email_address` when absent.
  5. Add `src/lib/orders/customer-status.ts`, mapping internal statuses to plain language. Use it on `/orders/[id]`, the success page and emails. Show carrier and tracking number on `/orders/[id]`. Format times with `Intl.DateTimeFormat(..., { timeZone: SHOP_TIME_ZONE })` (#39).
- **Tests / acceptance criteria:**
  - `customer-status.test.ts` (every status maps; no raw enum leaks).
  - Contract test: no `stripe_session_id` and no `Stripe` string under `src/app/checkout/**` or `src/components/checkout/**`.
  - Route test: the redirect URL carries `order=` and `access=`.
  - Webhook test: a shop order → exactly one email containing `/orders/`.
  - Success page: order lookup requires both id and token.
  - Manual: a sandbox purchase end to end shows the order summary and sends one email.
- **Risks / notes:** Verify that Square's appended query params (`transactionId`, `orderId`) coexist with ours. Depends on #2 and #4.

<a id="item-14"></a>
### #14 — Email sends are fire-and-forget: Resend errors are ignored, alerts are marked "notified" after failed sends, nothing is idempotent
- **Priority:** P1 · **Rank:** 14/76 · **Lens:** Reliability · ✔︎ re-verified by coordinator
- **Severity:** High | **Effort:** M | **Confidence:** Confirmed. Resend v4 returns `{ data, error }` and never throws (`node_modules/resend/dist/index.js:553-593`). Coordinator re-verified `back-in-stock.ts:99-113` awaits `resend.emails.send` and ignores the result. Resend's 2 req/s default limit is Likely. | **Sources:** REL-6, UXA-3 (part 5: quote email failures reported as success) | **Existing plan overlap:** none
- **Location:**
  - `src/lib/back-in-stock.ts:99-113,240-264`
  - `src/lib/capacity-alerts.ts:77-91,152-170`
  - `src/app/api/custom-orders/[id]/route.ts:51,55-72,319-331,364-376`
  - `src/app/api/custom-orders/route.ts:159-215`
  - `src/app/api/webhooks/square/route.ts:208-224`
  - `src/app/api/shippo/webhook/route.ts:164-173`
  - `src/app/api/admin/inventory/route.ts:258-260,395-397,538`

  The correct pattern already exists in `src/lib/abandoned-cart.ts` and `src/lib/custom-request-recovery.ts`.
- **Problem:**
  - **Alerts.** Back-in-stock and capacity alerts are set `notified` after a rejected send. A restock sends 100–200 emails sequentially inside the admin PATCH request; past Resend's rate limit they get 429 and are still marked notified. Subscribers silently never hear back.
  - **Quotes.** A failed quote email (or an unset `RESEND_API_KEY`) still shows "Quote sent successfully", and the resend count increments on failure.
  - **Webhooks.** Payment and delivered emails are dropped silently.
  - **Concurrency.** Two processor runs double-send, because no `idempotencyKey` is used anywhere.
- **Fix (implementation steps):**
  1. New `src/lib/resend/send.ts`:
     ```ts
     export type SendResult = { ok: true; id: string } | { ok: false; error: string; retryable: boolean }
     export async function sendEmail(input: { to: string; subject: string; html: string; idempotencyKey: string; headers?: Record<string,string> }): Promise<SendResult>
     ```
     - It checks `RESEND_API_KEY`/sender config, inspects `{ error }`, and maps 429/5xx to `retryable`.
     - It passes `idempotencyKey` (Resend supports `Idempotency-Key`).
     - Keys are deterministic: `back-in-stock:${alertId}`, `capacity:${alertId}`, `paid:${orderId}`, `quote:${requestId}:${quoteVersion}`, `delivered:${orderId}`.
     - Replace every direct `resend.emails.send` call with it, and add a contract test enforcing that.
  2. Migration `NNN_notification_send_state.sql`: add `send_attempts int not null default 0`, `last_send_error text` and `claimed_at timestamptz` to the back-in-stock and capacity alert tables.
  3. Processors:
     - Claim with a conditional update (`… set claimed_at = now() where id = ? and status='active' and (claimed_at is null or claimed_at < now() - interval '15 minutes') returning id`) before sending.
     - On success mark `notified`. On failure keep the alert `active`, increment `send_attempts` and store `last_send_error`.
  4. Move restock fan-out off the admin request: queue the sends and process them via `after()` or the cron in #38. Throttle (or `resend.batch.send`) under the account limit.
  5. `send_quote` (now under `/api/admin/custom-requests/[id]` per #6):
     - Return `{ request, warnings: ['email_not_sent'] }` when the send fails.
     - The UI shows a warning with a "Copy payment link" button.
     - Increment `quote_resend_count` only on success.
- **Tests / acceptance criteria:**
  - `send.test.ts`: `{ error: { statusCode: 429 } }` → `{ ok:false, retryable:true }`.
  - Processor tests: a rate-limit error leaves the alert `active` with `send_attempts=1`; a claim conflict → no send.
  - Route test: `send_quote` with a failing email → `warnings: ['email_not_sent']`.
  - Contract test: no `resend.emails.send(` outside `src/lib/resend/send.ts`.
- **Risks / notes:** Alerts already wrongly marked `notified` can't be identified retroactively. Consider one re-notification run for alerts on products currently in stock, with owner approval.

<a id="item-15"></a>
### #15 — Superseded and expired custom-quote payment links stay payable; a re-quote creates a duplicate order
- **Priority:** P1 · **Rank:** 15/76 · **Lens:** Payments
- **Severity:** High (money taken at the wrong price) | **Effort:** M | **Confidence:** Confirmed; size with #1 check 5 | **Sources:** SD-8, REL-10, UXA-3 (parts 3–4) | **Existing plan overlap:** none
- **Location:** `src/app/api/custom-orders/[id]/route.ts:142-151,225-336` (`:241` link created before the status-guarded update at `:271`; `:288-317` order insert, error swallowed), `:347-355`, `:437-456` (handoff picks the newest order); `supabase/migrations/063_qualify_mark_custom_request_paid.sql:16-25`
- **Problem:**
  1. Each `send_quote`, which is allowed again while `quote_sent`, creates a new Square link and a new pending `exp_orders` row, and never deletes the old link.
     - Example: quote $180, revised to $240. The customer pays the first email's link. The webhook matches the old row, the amounts agree, and the request flips to paid at $180.
  2. Expiring a quote changes only the request status, so the link still takes money. The 063 trigger ignores `expired`, so the request stays expired after payment.
  3. Handoff checks the **newest** order, which is unpaid, and fails with "Linked order is not paid yet." The request is stuck.
  4. The link is created before the status check, so `send_quote` on a `paid` request leaves an orphaned live link.
  5. A failed order insert is swallowed.
- **Fix (implementation steps):**
  1. Add `deleteSquarePaymentLink(id)` to `src/lib/square/client.ts` (DELETE `/v2/online-checkout/payment-links/{id}`; 404 → success). This is shared with #2.
  2. `send_quote`:
     1. Validate status **first**: allowed only for `awaiting_quote`, and as "re-quote" for `quote_sent|expired`.
     2. Delete the existing `square_payment_link_id` and cancel pending orders for that `custom_request_id`, with a status event "superseded by re-quote".
     3. Create the new link.
     4. Make the order insert fatal: on error, delete the new link and return 500.
  3. On every path that sets `expired` (manual and the #38 sweeper), delete the link.
  4. Webhook (#4): only mark paid when the order is `pending` and not cancelled. A COMPLETED payment on a superseded or cancelled row creates an `exp_admin_notifications` entry ("payment on superseded quote — refund or honour").
  5. Update the 063 trigger to accept `expired → paid` (and notify), **or** rely on step 3 so this cannot happen. Pick one and document it.
  6. Handoff selects the linked order with `.eq('payment_status','paid')`.
  7. Quote email copy: "This replaces any earlier quote links" (owner to approve).
- **Tests / acceptance criteria:** New `src/app/api/admin/custom-requests/[id]/route.test.ts` (after #6's move):
  - a second `send_quote` deletes the old link and cancels the old order;
  - `send_quote` on `paid` → 400 with no Square call;
  - order insert failure → 500 and the new link deleted;
  - handoff picks the paid order.

  Webhook test: a COMPLETED payment on a cancelled order → no paid update, one notification.
- **Risks / notes:** **Must ship with or right after #6**, because the CSRF bug currently prevents anyone from triggering it.

<a id="item-16"></a>
### #16 — CI only runs `npm audit` (and its schema greps are broken), lint fails with 8 errors, and the main admin-auth regression test passes vacuously on Windows
- **Priority:** P1 · **Rank:** 16/76 · **Lens:** Eng · ✔︎ re-verified by coordinator
- **Severity:** Medium (enabler: every other fix needs a real gate) | **Effort:** M | **Confidence:** Confirmed. Coordinator ran the checks on `963e97f` on 2026-10-08: `tsc --noEmit` clean; `vitest run` 57 files / 406 tests pass; `eslint .` **8 errors, 12 warnings**, the same set as on `4aeb56f`; `npm audit` 7 high (2 prod; see #9). | **Sources:** REL-15, SD-14, SA-7, coordinator lint/audit run | **Existing plan overlap:** SEPT §1.3, OCT-12, OCT-13, OCT-17
- **Location:** `.github/workflows/security-audit.yml` (`:15`, `:18`, `:42-43`); `package.json` (no `engines`); `src/lib/admin/auth-route-pattern.test.ts:14-23,32-38`; `src/types/database.ts` (empty scaffold); `src/lib/security/logger.ts:36-40`; lint error sites below
- **Problem:**
  1. **CI.**
     - The only workflow runs `npm audit` plus greps. There is no type-check, lint, test or build gate.
     - The grep for uppercase `DROP POLICY IF EXISTS exp_promo_codes_public_read` never matches migration 059's lowercase text, so the job is red even when audit passes.
     - There is no `permissions:` block, and actions are pinned by tag rather than SHA.
     - `node-version-file: package.json` resolves nothing because there is no `engines`.
  2. **Lint errors (8):**
     - `src/components/home/CategoryGrid.tsx:44`: `useState` is called **after an early return**. A real Rules-of-Hooks bug: if `categories` goes from empty to non-empty between renders, React throws "Rendered more hooks than during the previous render".
     - `src/components/admin/CommissionQueueTracker.tsx:40`: variable used before declaration. The component is dead; it is deleted in #3.
     - Six `react/no-unescaped-entities`: `builder/page.tsx:1638,1698`, `settings/page.tsx:181`, `shipping/page.tsx:173`.

     Twelve `exhaustive-deps`/unused-disable warnings: `ShippingForm.tsx:123,165` and `CartProvider.tsx:299` deserve a look, because stale closures there affect checkout.
  3. **Route-pattern test (SA-7).** `walkRouteFiles` matches `fullPath.endsWith('/route.ts')`, but `path.join` yields backslashes on Windows. The owner's machine is Windows: there it checks **0 of 44 files** and passes (coordinator confirmed the code). Even on POSIX it accepts a whole file if any one guard exists, and ignores admin routes outside `/api/admin`.
  4. **Schema drift is invisible.** `database.ts` is empty, so the admin client is untyped. Generated types wouldn't catch CHECK-literal drift (`'square_checkout'` in #2, `'tracking_update'` in #21) anyway.
  5. **Observability.**
     - There is no error reporting.
     - `safeLogError` drops Postgres `code`/`details`/`hint`, and logs `[object Object]` for plain objects (e.g. `shippo/rates/route.ts:86-88`).
     - README links a root `SECURITY_AUDIT.md` that lives in `docs/archive/`.
     - `supabase/.temp/cli-latest` is still tracked (OCT-17).
- **Fix (implementation steps):**
  1. New `.github/workflows/ci.yml` on push/PR to `main` and `dev`:
     - `permissions: contents: read`;
     - `actions/checkout` and `actions/setup-node` pinned to commit SHAs (Dependabot `github-actions` updates are already configured), `node-version-file: .nvmrc`, `cache: npm`;
     - steps: `npm ci`, `npm run type-check`, `npm run lint`, `npx vitest run`, `npm run build`, with dummy `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co` and `NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy` env.

     Make it a required check on `main`.
  2. Add `.nvmrc` (`22`) and `"engines": { "node": ">=20.9 <25" }`. The coordinator ran Node 24.18 locally, so allow it or pin it.
  3. Fix `security-audit.yml`:
     - use `grep -qi`;
     - add `permissions: contents: read`;
     - pin actions;
     - switch to `npm audit --omit=dev --audit-level=high` (#9).
  4. Fix the lint errors:
     - `CategoryGrid`: move `useState` above the early return.
     - Escape the entities, using `&quot;`/`&apos;` or `{'"'}`.
     - Delete `CommissionQueueTracker` (#3).
     - Review the three checkout/cart `exhaustive-deps` warnings: wrap the handlers in `useCallback` with correct deps, or document why they are stable.
  5. Route-pattern test:
     - match `basename(fullPath) === 'route.ts'`;
     - assert `checked >= 36`;
     - split the source per exported handler (`export (async )?function (GET|POST|PUT|PATCH|DELETE)`) and require `requireAdminApiSession(` plus `if (!x.ok)` in each chunk before the first `getSupabaseAdmin(`/`request.json(`/`formData(`;
     - add an explicit list of admin routes outside `/api/admin` (until #6 moves them).
  6. New `src/lib/db/schema-contract.test.ts`: parse the latest CHECK lists in `supabase/migrations/*.sql` (orders `payment_mode`/`status`/`payment_status`; `exp_order_status_events.action_type`) and assert every literal written by code under `src/app/api/**` is allowed. It **fails on today's tree**, which proves it works, and passes after #2 and #21.
  7. `safeLogError`: include `code`, `details` and `hint` when present, and `JSON.stringify` plain objects. Add `raiseOpsAlert(kind, payload)`, which inserts a deduplicated `exp_admin_notifications` row (and optionally emails the owner). Use it from #2, #4 and #21. Optionally add Sentry via `src/instrumentation.ts`.
  8. Hygiene: fix the README link; `git rm --cached supabase/.temp/cli-latest` and confirm `.gitignore` (OCT-17); generate `database.ts` once OCT-13 allows, and type the admin client.
- **Tests / acceptance criteria:**
  - A PR with a TypeScript error, lint error or failing test is blocked.
  - `npm run lint` exits 0.
  - The route-pattern test reports ≥ 36 files on Windows and Linux, and fails on a planted fixture missing the guard.
  - The schema-contract test is red before #2/#21 and green after.
- **Risks / notes:** Do this early. Nearly every other item adds tests that are only worth something when CI runs them.

<a id="item-17"></a>
### #17 — `/cart`'s only checkout button always fails, and would drop personalization if it didn't
- **Priority:** P1 · **Rank:** 17/76 · **Lens:** Storefront · ✔︎ re-verified by coordinator · **Source finding:** UXS-1
> **Coordinator note:** Severity adjusted **Critical → High**: the cart drawer has its own working "Checkout" button (`CartProvider.tsx:460` → `/checkout`), so customers can still pay; `/cart` (and every "back to cart" link) is a dead end, not a total block. Re-verified the 400 path. Same finding as REL-7(4).

- **Severity:** High (agent rated Critical; adjusted, see note) | **Effort:** S | **Confidence:** Confirmed | **Overlaps:** none
- **Location:** `src/components/cart/CartPageView.tsx:36-44, 136-141`; `src/components/shop/SquareCheckoutButton.tsx:26-57`; `src/app/api/square/checkout/route.ts:282-295`; `src/app/checkout/cancel/page.tsx` ("Return to Cart"); `src/components/checkout/CheckoutPageView.tsx:407-415` ("Back to Cart"); `src/app/checkout/page.tsx:24` (breadcrumb)
- **Problem:**
  - `/cart` offers only two actions: "Clear Cart" and "Checkout with Square".
  - The Square button posts `{items}` with no shipping address and no rate. The route rejects every such request with 400 "A complete shipping address is required." (rule P-5).
  - The customer sees a browser `alert()` and stays on `/cart`, which has no link to `/checkout`.
  - Every "back to cart" path lands here: the checkout breadcrumb, "Back to Cart" on `/checkout`, "Return to Cart" on `/checkout/cancel`, and the drawer's "View Full Cart".
  - The payload also leaves out `variantId`, `selectedOptions` and `designDocument`, so personalization would be lost even if the route accepted it.
  - `disabled={disabled ?? loading}` ignores `loading` whenever the caller passes `false` (it always does). Double-clicks therefore fire multiple requests.
- **Evidence:** `squareItems` has only `productId/title/quantity/unitPrice/selectedProcessKeys`; `<SquareCheckoutButton items={squareItems} disabled={items.length === 0} />`; `alert(...)`; route.ts:283-291 returns the 400.
- **Fix (implementation steps):**
  1. In `CartPageView`, remove `SquareCheckoutButton` and `squareItems`. Also remove the `config`/`loadingConfig` state and its `/api/storefront-config` fetch, since `config` is never read.
  2. Add `<Button component={Link} href="/checkout" variant="contained" size="large" disabled={items.length===0}>Continue to Checkout</Button>`. Place it first in DOM order and in the mobile layout.
  3. Demote "Clear Cart" to `variant="text"` (add the confirm step from UXS-16). Add a "Browse Shop" link to the empty state.
  4. In `SquareCheckoutButton`, set `disabled={Boolean(disabled) || loading}`. Replace `alert()` with an inline `<Alert severity="error" role="alert">`.
  5. The route now requires an address. Any product-page "buy now" that uses `SquareCheckoutButton` must either add the item and route to `/checkout`, or be removed.
- **Tests / acceptance criteria:**
  - New `cart-page.contract.test.ts`: `CartPageView` contains `href="/checkout"` and has no `SquareCheckoutButton` or `/api/storefront-config`.
  - New `square-checkout-button.contract.test.ts`: no `disabled ?? loading` and no `alert(`.
  - Repo scan: only `CheckoutPageView` posts to `/api/square/checkout`.
  - Manual: drawer → View Full Cart → the CTA reaches `/checkout`. `/checkout/cancel` → Return to Cart → the customer can still pay.
- **Risks / notes:** No functional risk; this path has never worked since P-5. Check whether abandoned-cart emails link to `/cart`.

<a id="item-18"></a>
### #18 — `/future-products` "Notify me" fails for every visitor and lands on raw JSON
- **Priority:** P1 · **Rank:** 18/76 · **Lens:** Storefront · ✔︎ re-verified by coordinator · **Source finding:** UXS-2
> **Coordinator note:** Severity adjusted **Critical → High** (secondary signup flow, not checkout). Re-verified: native form post (urlencoded) → `request.json()` fails → 400 JSON page. Fix together with #36 part 2 (the same endpoint re-subscribes opted-out users).

- **Severity:** High (agent rated Critical; adjusted, see note) | **Effort:** S | **Confidence:** Confirmed | **Overlaps:** §3.8/§3.11 cover the homepage card only
- **Location:** `src/app/future-products/page.tsx:167-175`; `src/app/api/future-products/route.ts:69-78`
- **Problem:**
  - The page uses a native `<form action="/api/future-products" method="post">`, which sends urlencoded data.
  - The route calls `request.json().catch(()=>({}))`, so `email` is always null and the route returns 400 `{"error":"A valid email address is required."}`.
  - The browser leaves the site for a bare JSON document. Every roadmap signup from this page is lost.
  - The homepage card works because it posts JSON from a client handler.
- **Fix (implementation steps):**
  1. Extract the homepage card's form into `src/components/home/FutureProductsNotifyForm.tsx` (a client component with props `{source, ctaLabel}`). Use it on the homepage with `source: 'homepage_notify_card'` and on the page with `source: 'future_products_page'`.
  2. Show success in a `role="status"` region and errors in `role="alert"`; today the card swaps its subheading silently. Add `autoComplete` for name and email, and move focus to the status message on success.
  3. In the route, as a fallback for no-JS: if the content-type isn't JSON, parse `formData()` and respond 303 to `/future-products?notify=ok|error`.
- **Tests / acceptance criteria:**
  - Route test: a urlencoded post returns 303 and the upsert receives the email.
  - Contract test: the page has no `action="/api/future-products"` and imports the shared form.
  - Manual: a submit shows an inline thank-you, and a row appears with `source=future_products_page`.
- **Risks / notes:** Render the route's rate-limit 200 message as success copy. See SD-10(3): this endpoint also re-subscribes people who opted out; fix both together.

<a id="item-19"></a>
### #19 — Promotions: automatic deals never apply, invalid codes are silently ignored, and usage limits are consumed at link creation and race
- **Priority:** P1 · **Rank:** 19/76 · **Lens:** Payments
- **Severity:** Medium | **Effort:** M | **Confidence:** Confirmed | **Sources:** REL-8, SD-6 (promo half), UXS-6 (part 3) | **Existing plan overlap:** migration 062 / SEC-062
- **Location:** `src/app/api/square/checkout/route.ts:334-404,350-357,437-450`; `src/lib/pricing/promotions.ts:376-411`; `supabase/migrations/062_promo_usage_increment.sql:9-31`; `src/app/admin/(panel)/catalog/pricing/page.tsx:71`; `src/app/api/promo/validate/route.ts` (no storefront caller)
- **Problem:**
  1. Deals are evaluated only when a code is entered. A non-deal code makes `resolveEligibleDeals` return `ok:false`, which drops automatic deals too. Automatic deals (the admin default) effectively never apply.
  2. An invalid, expired or exhausted code is silently dropped, and the customer pays full price with no message. There is no Apply step in the UI.
  3. Usage is incremented after link creation, before payment, and unconditionally (`usage_count < usage_limit` is checked separately). Concurrent checkouts overshoot the limit, and abandoned checkouts or retries consume limited codes.
- **Fix (implementation steps):**
  1. Always evaluate automatic deals. Pass the code to deal resolution only if it is a deal code, and keep promo-code and deal resolution independent.
  2. An entered code that doesn't resolve → `422 { error: 'That code isn't valid', code: 'promo_invalid' }`. The checkout UI gets an Apply button that calls `/api/promo/validate` and shows "applied −$X" or the error inline (#30).
  3. Migration `NNN_promo_redemptions.sql`:
     - `exp_try_redeem_promo_code(p_id uuid) returns boolean`, a single conditional `update … set usage_count = usage_count + 1 where id = p_id and is_active and (usage_limit is null or usage_count < usage_limit) and (valid_from is null or valid_from <= now()) and (valid_to is null or valid_to >= now()) returning true`;
     - `exp_release_promo_code(p_id uuid)` (decrement, floor 0);
     - the same pair for bundle deals;
     - `alter table exp_orders add column if not exists promo_code_id uuid, add column if not exists bundle_deal_ids uuid[] not null default '{}'`;
     - execute revoked from anon/authenticated (#3).
  4. Route: claim before calling Square (inside #2's sequence), and if a claim returns false → 422 with no Square call. Store the ids on the order. Remove the old unconditional increment calls. The #38 sweeper releases claims when it expires unpaid orders.
- **Tests / acceptance criteria:**
  - An automatic deal applies with no code.
  - Invalid code → 422.
  - Claim false → 422 and Square not called.
  - Contract test: the route doesn't contain `exp_increment_promo_code_usage`.
  - Staging: ten concurrent claims at `limit=1` → one succeeds.
- **Risks / notes:** **Review the live automatic deals with the owner before enabling them**, because fixing step 1 changes prices customers see.

<a id="item-20"></a>
### #20 — The public checkout endpoint has no rate limit, no item cap and no address/email validation
- **Priority:** P1 · **Rank:** 20/76 · **Lens:** Security
- **Severity:** Medium | **Effort:** S–M | **Confidence:** Confirmed | **Sources:** SD-6 (non-promo half) | **Existing plan overlap:** none
- **Location:** `src/app/api/square/checkout/route.ts:132-140` (20 MB body, no rate limit), `:159`, `:282-292`, `:408-410`, `:470-472`
- **Problem:**
  - This is the most expensive public endpoint: DB queries per item, a Shippo shipment, a Square link and inserts. It is the only paid-API public route with no rate limit.
  - `items` has no maximum.
  - `shippingAddress` is stored as arbitrary client JSON and passed whole to Shippo.
  - `buyerEmail` and phone aren't validated.
  - Every call leaves an unpaid order row behind.
- **Fix (implementation steps):**
  1. `rateLimit('checkout:' + getClientIp(request), 10, 10 * 60_000, { failClosed: true })`, using the existing helper in `src/lib/rate-limit.ts`.
  2. Cap the body at 2 MB with `parseJsonBodyOrError` from `src/lib/security/body.ts`, and require 1–50 items.
  3. Build a whitelisted address object; never store the raw body. Fields:
     - `name` ≤ 100 (required, see #31);
     - `street1`, `street2` ≤ 200;
     - `city` ≤ 100, `state` ≤ 50, `zip` ≤ 20;
     - `country` ∈ the supported list;
     - `phone` via `sanitizePhone`.
  4. Validate email with `validateEmail` from `src/lib/validate.ts` and make it required (#30).
- **Tests / acceptance criteria:**
  - 11th request in the window → 429.
  - 51 items → 400.
  - An extra `foo` key in the address is not stored.
  - Invalid email → 400.
  - Contract test: the route contains `rateLimit(`.

<a id="item-21"></a>
### #21 — Shippo webhook: the signature scheme is unverified, `TRANSIT` never maps to shipped, tracking events violate a CHECK, and delivered emails repeat
- **Priority:** P1 · **Rank:** 21/76 · **Lens:** Reliability
- **Severity:** Medium | **Effort:** S | **Confidence:** Ordering and mapping bugs Confirmed. The CHECK violation is Likely (migrations 018/049; #1 check 6). The signature header needs a live test (#1 check 9). | **Sources:** SD-11 (Shippo half), REL-16 | **Existing plan overlap:** none
- **Location:** `src/app/api/shippo/webhook/route.ts:39-65` (expects hex HMAC in `x-shippo-signature`), `:73-87` (dedupe before processing), `:105-177`, `:124-128` (`carrier.toUpperCase()`), `:158-170`; `supabase/migrations/018_orders_operations_module.sql:18-25`; `supabase/migrations/049_Migration_1.sql:839-841`; `src/app/api/admin/orders/route.ts:106-130,632-640`
- **Problem:**
  1. If Shippo doesn't send a hex HMAC in `x-shippo-signature` (historically it recommended a secret URL token), every real webhook returns 401, and delivery automation is silently dead.
  2. Shippo statuses are `TRANSIT`/`DELIVERED`, so `includes('ship')` never matches and orders never become `shipped`.
  3. `DELIVERED` is applied even to `cancelled` orders, and a delivered email is sent on every DELIVERED update.
  4. `carrier.toUpperCase()` throws when carrier is missing.
  5. `action_type: 'tracking_update'` isn't in the CHECK list, and the insert error is ignored. No tracking event is ever recorded (admin and Shippo paths).
  6. The dedupe row is inserted before processing, the same as #4.
  7. The default sender domain is wrong (#37).
- **Fix (implementation steps):**
  1. Send a Shippo dashboard test webhook and check the logs. If Shippo doesn't sign, switch to a `?token=` query secret compared with `timingSafeEqual` (store it as `SHIPPO_WEBHOOK_TOKEN`).
  2. Map transitions exactly, with conditional updates:
     - `TRANSIT` → `.in('status', ['in_production','ready_to_ship']).update({status:'shipped'})`;
     - `DELIVERED` → `.eq('status','shipped').update({status:'delivered'})`.

     Send the email only when a row changed, with idempotency key `delivered:${orderId}` (#14).
  3. Use `carrier ?? ''`.
  4. Widen `exp_order_status_events` `action_type` to include `'tracking_update','payment_webhook','expired','refund_webhook'`, folded into #2's migration. Check the insert error in `insertOrderEvent`.
  5. Dedupe like #4: `processed` flag; only 23505 is a duplicate; on failure delete the row and return 500.
- **Tests / acceptance criteria:** New `src/app/api/shippo/webhook/route.test.ts`:
  - `TRANSIT` → `shipped`;
  - DELIVERED twice → one email;
  - DELIVERED on cancelled → no change;
  - no carrier → 200 without throwing;
  - an update error → 500 and the dedupe row deleted.

  Admin tracking update inserts an event (schema-contract test from #16 covers the literal).

<a id="item-22"></a>
### #22 — An order cannot be fulfilled from the panel: no customer or ship-to address, no artwork, no tracking entry, no label, no "shipped" email
- **Priority:** P1 · **Rank:** 22/76 · **Lens:** Admin · **Source finding:** UXA-7
> **Coordinator note:** Interacts with #21 (Shippo status mapping, tracking events) and #13 (customer-facing status page/email).

- **Severity:** High | **Effort:** L | **Confidence:** Confirmed | **Overlaps:** none
- **Location:** `src/app/admin/(panel)/orders/page.tsx:374-626`; `src/app/api/admin/orders/route.ts:145-198,606-653`; `src/app/api/shippo/webhook/route.ts:104-176`; `supabase/migrations/049_Migration_1.sql:806-823`; `src/lib/resend/client.ts:31`
- **Problem:** Walking workflow (a) end to end:
  - *Find it:* see UXA-14 and UXA-15.
  - *See items:* `option_snapshot` renders, but `exp_order_items.source_file_url` (the customer's uploaded artwork), `nfc_target_data` and `leave_unlocked` are not selected by the GET (`route.ts:161`) and are not displayed. The owner cannot open the artwork for the job they are about to produce.
  - *Who and where:* the detail payload includes `shipping_address`, but the UI never renders `detail.order`. Only the list row's id and status appear (`page.tsx:386-388`). `customer_email` is not even selected. There is no name, address or email on screen.
  - *Buy label:* nothing anywhere calls Shippo transactions. The only Shippo admin UI is settings.
  - *Mark shipped and notify:* the API has an `update_tracking` action (`route.ts:606-653`), but the UI has no tracking or carrier field. The Shippo webhook finds orders *by `tracking_number`* (`webhook/route.ts:109-113`), so without a tracking number it never matches. Its only customer email is the "delivered" one. `ORDER_SHIPPED` exists as a template key but nothing sends it. The net effect: a manual "shipped" transition tells the customer nothing, and tracking never updates.
- **Evidence:**
  ```ts
  // orders/route.ts:161 — artwork/NFC columns not selected
  .select('id, product_id, product_title, variant_label, selected_options, option_snapshot, unit_price, quantity, line_subtotal, line_discount, line_total, created_at')
  ```
- **Fix (implementation steps):**
  1. **S:** Add `customer_email`, `shipping_address`, `tracking_number` and `shipping_carrier` to the detail render. Show a "Ship to" card with a "Copy address" button, and `mailto:` the customer.
  2. **S:** Select `source_file_url, nfc_target_data, leave_unlocked` in the items query. Render artwork through a new `GET /api/admin/orders/[id]/artwork` that returns signed URLs (same pattern as `api/admin/custom-requests/[id]/artwork`). Render `file`-type options from `option_snapshot` as links, not raw paths.
  3. **S:** Add a "Tracking" row (carrier `Select` USPS/UPS/FedEx/Other, plus a tracking number) that calls `update_tracking`. When the status is `ready_to_ship`, offer "Save tracking & mark shipped" as one action.
  4. **M:** On `transition → shipped`, send the `ORDER_SHIPPED` email via Resend with the carrier tracking link. Record `metadata.customer_notified` on the event and show "Customer notified ✓" in the action trail.
  5. **L (optional):** "Buy label" using Shippo `transactions` for the order's chosen rate, storing `label_url` and the tracking number.
- **Tests / acceptance criteria:**
  - Route tests: (a) the detail GET selects `source_file_url` and `customer_email`; (b) `update_tracking` followed by a `shipped` transition sends one email (mock Resend).
  - Manual: an order with an uploaded file shows a working "Open artwork" link, and the address is copyable.
- **Risks / notes:** Signed URLs should be short-lived. Shipping-address PII is already in the payload, so this only renders it.

<a id="item-23"></a>
### #23 — Orders: Cancel and "Mark Refunded" fire with no confirmation, and "cancelled" via the Transition menu skips inventory release
- **Priority:** P1 · **Rank:** 23/76 · **Lens:** Admin · **Source finding:** UXA-6
> **Coordinator note:** Step 1 (remove `cancelled` from Transition so cancel always releases inventory) is also listed in #12; do it once.

- **Severity:** High | **Effort:** M | **Confidence:** Confirmed | **Overlaps:** none
- **Location:** `src/app/admin/(panel)/orders/page.tsx:132-143,390-440`; `src/app/api/admin/orders/route.ts:266-342,344-401,403-456`
- **Problem:**
  1. "Cancel Order" and "Mark Refunded" are single clicks with no dialog, and both are irreversible because `cancelled` has no outgoing transitions. "Mark Refunded" on a paid order also moves it to `cancelled`. Neither action moves money in Square or Stripe, and the UI never says so, so an owner may think the customer has been refunded.
  2. The Transition `<Select>` offers `cancelled` as an option, and it is preselected when it is the only choice. That path (`route.ts:299-301`) only sets `cancelled_at`. It never calls `exp_release_order_inventory` the way the Cancel action does (`route.ts:365-370`), and no DB trigger does it (checked the migrations). Cancelling an unpaid order through the dropdown therefore leaves its stock reserved, and ready-made items stay unavailable for sale.
  3. The "Action note" field doubles as the cancel or refund note, but nothing makes it required for those destructive actions.
- **Evidence:**
  ```tsx
  // orders/page.tsx:424-431
  <Button variant="outlined" color="error" … onClick={() => void runAction({ action: 'cancel', note: actionNote }, 'Order cancelled.')}>Cancel Order</Button>
  ```
- **Fix (implementation steps):**
  1. Remove `cancelled` from `nextStatusOptions()`, both client (`page.tsx:132-143`) and server (`transitionAllowed`, `route.ts:71-83`). Cancelling must go through `action: 'cancel'`. Alternatively, route `transition→cancelled` through the same branch.
  2. Use the shared `ConfirmDialog` (UXA-3) for Cancel and Mark Refunded. Require a reason (minimum 3 characters) inside the dialog. Copy: "Mark order 1a2b3c4d as refunded? This only records the refund — issue the actual refund in Square first." Add a link to the Square dashboard if `payment_mode === 'square_payment_link'`.
  3. Show order total, payment status and paid date in the dialog body.
- **Tests / acceptance criteria:**
  - Route test: `transition` to `cancelled` returns 400 (or calls the RPC).
  - Existing `orders/route.test.ts`: add "cancel unpaid calls exp_release_order_inventory".
  - Contract test: `orders/page.tsx` has no direct `runAction({ action: 'cancel'` outside a confirm handler.
  - Manual: Cancel opens a dialog, the confirm button is disabled until a reason is typed, and focus returns to the Cancel button on close.
- **Risks / notes:** None.

<a id="item-24"></a>
### #24 — Homepage editor: a section "Save" silently re-shows sections hidden in the visibility panel, and a failed load followed by Save overwrites live content with defaults
- **Priority:** P1 · **Rank:** 24/76 · **Lens:** Admin · **Source finding:** UXA-4
- **Severity:** High | **Effort:** M | **Confidence:** Confirmed | **Overlaps:** §9.4 / OCT-29 (layout only), OCT-24 (sort_order). This is a different defect.
- **Location:** `src/app/admin/(panel)/homepage/page.tsx:182-266,268-288,300-324,326-351,353-377,379-411,524-534,1177-1195`
- **Problem:**
  1. **Two sources of truth for visibility.** The top "Section Visibility" panel edits `visibility[key]`. Each section editor also keeps its own `is_visible`, captured at page load (`heroCollage.is_visible`, `shopAllPreview.is_visible`, `futureProductsNotify.is_visible`, `tileSections[key].is_visible`). Toggling a section off and clicking "Save Visibility" hides it. Editing that section's text afterwards and saving sends the stale `is_visible: true`, and the section reappears on the storefront. The hero collage editor has no visibility control at all, but still sends `is_visible` (line 309).
  2. **Load failure falls through to a live editor.** If `GET /api/admin/homepage/sections` fails (500, 401 after session expiry, network), the catch only sets an error message. The page still renders every editor with hard-coded defaults: `visibility = {}`, so every switch shows ON, and the collage has six empty image slots. All Save buttons stay enabled. "Save Visibility" then publishes all 17 sections, including deliberately hidden ones. "Save Collage Settings" replaces the live images with empty slots.
  3. **Tile image upload failure is silent.** The `catch` only logs to the console (lines 1190-1192), and nothing shows that an upload is in progress.
- **Evidence:**
  ```ts
  // homepage/page.tsx:260-262 — error path still falls through to the full editor render
  } catch { setVisibilityMessage({ type: 'error', text: 'Failed to load homepage sections.' }) } finally { setLoading(false) }
  // :334 — per-section save re-sends the load-time visibility
  is_visible: shopAllPreview.is_visible,
  ```
- **Fix (implementation steps):**
  1. Add `const [loadError, setLoadError] = useState<string | null>(null)`. On failure, render only `<Alert severity="error" action={<Button onClick={reload}>Retry</Button>}>` and none of the editors or Save buttons.
  2. Make `visibility` the single source of truth. Remove the `is_visible` fields from `HeroCollageState`, `ShopAllPreviewState`, `FutureProductsNotifyState` and `TileSectionState`. Per-section switches read and write `visibility[key]`. Per-section saves send `is_visible: visibility[key]`. Better still, omit `is_visible` from content saves entirely and let the visibility panel own it. The `[key]` route already supports visibility-only and content writes (OCT-6).
  3. Tile upload: add per-tile `uploading` / `uploadError` state. Show a `CircularProgress` on the Upload button and an inline `FormHelperText error` on failure.
  4. Fix the uncontrolled-to-controlled warning at line 657 with `value={image.href ?? ''}`.
- **Tests / acceptance criteria:**
  - Contract test (`src/app/admin/(panel)/homepage/homepage-editor.contract.test.ts`): (a) the code includes a `loadError` early return before the visibility panel; (b) only one `is_visible` state field exists, with no `is_visible` key in the four section state interfaces; (c) the upload `catch` sets state rather than only calling `console.error`.
  - Manual: hide "Shop All Preview" and Save Visibility. Edit its heading and save. The section stays hidden. Block the GET in DevTools (request blocking) and confirm no Save button is rendered.
- **Risks / notes:** Removing the per-section visibility switches changes the layout slightly. Keep a read-only "Visible / Hidden" chip in each editor that links to the panel.

<a id="item-25"></a>
### #25 — Product detail editor throws away unsaved text edits whenever media or options are added or deleted
- **Priority:** P1 · **Rank:** 25/76 · **Lens:** Admin · **Source finding:** UXA-5
- **Severity:** High | **Effort:** S | **Confidence:** Confirmed | **Overlaps:** none
- **Location:** `src/app/admin/(panel)/catalog/products/[id]/page.tsx:125-171,268-275,305-306,339-347,377-381,417-423,453-454,466-468`
- **Problem:** Every media or option mutation ends with `await loadData()`, and `loadData` runs `setProduct(payload.product)`. Picture an owner who rewrites the description, then uploads and adds a photo before clicking "Save Product Content". The description silently reverts to the server copy. Nothing warns them, and the only "Save" sits above the media section, so this ordering is natural. A transient failure on any of the three parallel loads also sets `product` to `null`, and the whole editor becomes "Product not found." along with the unsaved edits. The page is a legacy duplicate of the builder (see UXA-1 step 5) but is still reachable by URL.
- **Evidence:**
  ```ts
  // page.tsx:268-275
  setSuccess('Media item added.'); /* … */ await loadData()   // → setProduct(payload.product) at :154
  ```
- **Fix (implementation steps):**
  1. **Preferred:** retire the page with a redirect to `/builder` (UXA-1 step 5).
  2. If it stays, split `loadData` into `loadProduct()`, `loadMedia()` and `loadOptions()`. Media and option mutations refresh only their own list.
  3. Never null `product` on a list-refresh failure. Show the error inline and keep the form.
- **Tests / acceptance criteria:** Contract test asserting that `addMedia` / `deleteMedia` / `addOption` / `addOptionValue` / `deleteOption*` do not call a function that runs `setProduct(` (or, after retirement, that the file is a redirect). Manual: edit the description, add media, and the description edit survives.
- **Risks / notes:** None.

<a id="item-26"></a>
### #26 — Product builder: deleting an option value always fails, "Add" buttons create duplicates on double-click, failed loads look like empty lists, and errors appear off-screen
- **Priority:** P1 · **Rank:** 26/76 · **Lens:** Admin · **Source finding:** UXA-9
- **Severity:** High | **Effort:** M | **Confidence:** Confirmed | **Overlaps:** OCT-20 (unnamed Selects in the same file, a different problem)
- **Location:** `builder/page.tsx:241-279,516-557,624-669,844-887,889-928,930-955,1007-1008,1246,1430,1571-1578,1747,1862,1992,2285`; `src/app/api/admin/catalog/options/values/route.ts:266-271`
- **Problem:**
  1. `deleteOptionValue` sends `{ valueId }`, but the route reads `body.optionValueId`. Every delete returns 400 "Option value id is required." The ✕ is also a bare glyph with no accessible name.
  2. `addVariant`, `addDiscountTier`, `addOption`, `addOptionValue` and `addMedia` have no busy state, and their buttons are never disabled. A double-click or an impatient second click inserts two identical variants, tiers or options.
  3. The initial load ignores non-OK responses (`if (variantsRes.ok && …)`). A failed variants or discounts fetch renders "No variants yet." with no error, and the owner re-adds rows that already exist.
  4. Media, variant, tier and product errors go to a single Alert at the top of a page several thousand pixels tall (line 1007). Clicking "Add tier" near the bottom shows nothing visible, which invites repeat clicks and feeds problem 2.
  5. There are three save models on one page, with no dirty indicator:
     - product fields need "Save Product";
     - process types and combo discounts are local until a separate small "Save" (line 1571), even though "Add Combo Discount" and "Remove" look like they take effect;
     - variants, tiers, options and media save immediately.
- **Evidence:**
  ```ts
  // builder/page.tsx:938 vs options/values/route.ts:266
  body: JSON.stringify({ valueId, confirmAction: 'delete_option_value' })
  const optionValueId = asString(body.optionValueId, 64)
  ```
- **Fix (implementation steps):**
  1. Change line 938 to send `optionValueId: valueId`. Give the ✕ `aria-label={\`Delete value ${value.label}\`}`.
  2. Introduce `src/components/admin/useAdminMutation.ts`. It returns `{ run, busy, error }`, sets busy, parses `{ error }` from the JSON, and reports through a shared Snackbar context (UXA-19). Use one instance per section and pass `disabled={busy}` to every Add or Save button.
  3. In the initial load, collect failures: `const failed = [...].filter(r => !r.ok)`. Show a section-level `<Alert severity="error">Couldn't load variants — <Button onClick={reloadVariants}>Retry</Button></Alert>` instead of an empty state.
  4. Decompose the 2,314-line page. This unlocks steps 2–5 and makes them testable. Split into `builder/sections/{ProductCoreSection,MediaSection,VariantsSection,ProcessTypesSection,DiscountTiersSection,OptionsSection}.tsx`, each owning its fetch, mutation hook and inline Alert. The page keeps `product` and a section registry for the dirty guard (UXA-11).
  5. Process types: show a "Unsaved changes" chip plus a sticky "Save process types" bar when `assignedProcessKeys`, `processPricing` or `comboDiscounts` differ from the loaded snapshot.
- **Tests / acceptance criteria:**
  - Contract tests: (a) the builder's delete-value body contains `optionValueId`; (b) every `<Button` whose `onClick` calls `add*` has a `disabled=` prop; (c) the load does not use the bare pattern `if (xRes.ok && Array.isArray(` without an else branch.
  - Pure unit test for a `diffProcessTypes(loaded, current)` helper extracted for the dirty chip.
  - Manual: double-click "Add variant" and get exactly one row; delete an option value and it disappears.
- **Risks / notes:** Decomposition is mechanical but large. Land step 1 (one line) first.

<a id="item-27"></a>
### #27 — The variant "Weight" field is really machine-hours, editing a variant in the builder zeroes it, and real shipping weight (`weight_lb`) cannot be edited anywhere
- **Priority:** P1 · **Rank:** 27/76 · **Lens:** Admin · **Source finding:** UXA-8
- **Severity:** High | **Effort:** M | **Confidence:** Confirmed | **Overlaps:** none
- **Location:** `builder/page.tsx:78-86,531,599,1408-1414,1476-1482,1526`; `catalog/products/[id]/pricing/page.tsx:225,321`; `src/app/api/admin/catalog/variants/route.ts:30-34,56,179,210`; `src/app/admin/(panel)/shipping/page.tsx:245-248`; `src/lib/shippo/weight.ts:44-63`; `supabase/migrations/002_product_catalog.sql:43`
- **Problem:**
  1. Both variant forms label `capacity_weight` as "Weight". The migration defines that column as "for machine scheduling (hours)". The Shipping page tells the owner "Product weights are taken from variant capacity_weight", but shipping rates actually use `exp_products.weight_lb` / `exp_product_variants.weight_lb`, defaulting to **1 lb** (`weight.ts:52`). No admin screen can set `weight_lb`, so every package is quoted at 1 lb per item and heavy items are under-charged.
  2. The builder's `Variant` type reads `variant.weight`, but the API returns `capacity_weight`. Opening "Edit" therefore shows an empty Weight field. Saving sends `capacity_weight: null`, which the server's `Number(null) === 0` stores as **0**. Fixing a label typo silently zeroes the variant's capacity hours.
- **Evidence:**
  ```ts
  // builder/page.tsx:1526
  setEditVariantWeight(variant.weight ? String(variant.weight) : '')   // field is `capacity_weight`
  // weight.ts:52
  let unitWeight = Number(product?.weight_lb ?? 1)
  ```
- **Fix (implementation steps):**
  1. Rename the UI label to "Production hours (capacity)" with helper text, and fix the builder type and reads to use `capacity_weight`.
  2. Add `weight_lb` to the variants route (GET select, POST/PUT validation 0–150, matching `MAX_PACKAGE_WEIGHT_LB`) and to the products `[id]` route. Add "Shipping weight (lb)" fields in the builder product section and the variant rows.
  3. Server `asNumber`: treat `null` and `''` as `null`, not 0, in `variants/route.ts`.
  4. Correct the Shipping page copy to: "Weights come from each product's Shipping weight (lb), overridden per variant; missing weights default to 1 lb."
  5. Show the shipping weight in the variant list row, and add a warning chip in the products list when `weight_lb` is null.
- **Tests / acceptance criteria:**
  - Route test: PUT with `capacity_weight: null` stores `null`; `weight_lb` is validated.
  - Contract test: the builder contains no `variant.weight` reference.
  - Manual: edit a variant label and confirm `capacity_weight` is unchanged; set 3 lb and confirm checkout rates change.
- **Risks / notes:** Check the data first with `select count(*) from exp_product_variants where capacity_weight = 0` to find rows already zeroed.

<a id="item-28"></a>
### #28 — "Send Quote" is a one-click, irreversible customer email with hidden side effects: the internal note is emailed, a re-quote leaves the old payment link live, and failures are reported as success
- **Priority:** P1 · **Rank:** 28/76 · **Lens:** Admin · **Source finding:** UXA-3, SA-11
> **Coordinator note:** Parts 3–4 (wrong-status sends, stale/duplicate payment links, handoff picks the wrong order) are implemented in **#15**; part 5 (email failures reported as success) in **#14**. Implement here: the shared `ConfirmDialog`, status-gated buttons, the warnings UI, and the note split. For the note split add `alter table exp_custom_requests add column if not exists internal_notes text;` and never select `internal_notes` in customer-facing paths (`/api/custom-orders/[id]` GET, the status page, emails). Same issue as SA-11. Do this right after #6, because #6 makes these buttons work for the first time.

- **Severity:** High | **Effort:** M | **Confidence:** Confirmed | **Overlaps:** none
- **Location:** `src/app/admin/(panel)/custom-requests/page.tsx:121-156,629-648`; `src/app/api/custom-orders/[id]/route.ts:42-73,226-336,437-451`
- **Problem:**
  1. **No confirmation.** One click creates a real Square payment link and emails the customer. A typo such as `1500` for `150` goes straight to the customer.
  2. **The field labelled "Admin note" is customer-facing.** Its text goes into the quote email as "Note from the studio" (`route.ts:70`), and it is re-sent on "Resend Quote". The label reads as internal, so private remarks can reach customers. The same single draft is also sent with Handoff and Reopen, and it overwrites `admin_notes` each time. An empty draft writes `null` and erases the rejection reason (`route.ts:267,466,523`). `admin_notes` is never displayed.
  3. **Wrong-status sends.** "Send Quote" is enabled for every non-cancelled status, including `paid`, `expired` and `restricted_*`. The server creates the Square link *before* the status-guarded update (`route.ts:241` vs `271`). On a paid request this leaves an orphaned live payment link and returns "Could not save quote details."
  4. **Re-quoting creates a second payable link and a duplicate order.** Re-sending to a `quote_sent` request makes a new Square link and inserts another `exp_orders` row (`route.ts:288-310`) without deactivating the first. The customer then has two payable emails, and the Orders list and dashboard count two awaiting-payment orders. If the customer pays the old link, Handoff checks only the newest order (`route.ts:437-451`) and fails with "Linked order is not paid yet."
  5. **Silent partial failure.** If the email throws, or `RESEND_API_KEY` is unset (`route.ts:51`), or the order insert fails (`route.ts:312-317`), the route still returns 200 and the UI says "Quote sent successfully." The owner believes the customer was emailed and that payment will be matched, when neither may be true.
- **Evidence:**
  ```ts
  // route.ts:70
  ${input.note ? `<p><strong>Note from the studio:</strong> ${safeHtmlEscape(input.note)}</p>` : ''}
  // page.tsx:641-646 — no status gate
  <Button … disabled={submittingId === row.id} onClick={() => void sendQuote(row)}>Send Quote</Button>
  ```
- **Fix (implementation steps):**
  1. Add a shared `src/components/admin/ConfirmDialog.tsx`: MUI `Dialog` with `aria-labelledby`, props `{ open, title, body, confirmLabel, tone: 'danger'|'primary', busy, onConfirm, onClose }`, focus on Cancel by default.
  2. Wrap Send Quote in it. The body reads: "Send a **$X.XX** quote to **email**? This creates a Square payment link and emails the customer now." Show the "Message to customer" text verbatim.
  3. Split the note into two fields:
     - "Message to customer (included in email)", sent as `customerMessage`;
     - "Internal note (never sent)", sent as `internalNote`.
  4. Server side, make the internal note append-only. Insert into a notes table, or append with a timestamp instead of `admin_notes: note`. Never write `null` when the field is empty. Render the history on the card.
  5. Gate the buttons by status. Send Quote is enabled only for `awaiting_quote` and, labelled "Re-quote…", for `quote_sent | expired`. Move the status check in `route.ts` above `createSquareQuotePaymentLink`.
  6. On re-quote, first deactivate the previous Square link (Square `DeletePaymentLink` or `UpdatePaymentLink`) and mark the previous `exp_orders` row `cancelled` with an event note "superseded by re-quote". Then create the new link. Make Handoff look up the *paid* linked order (`.eq('payment_status','paid')`) rather than the newest.
  7. Return warnings in the payload, for example `{ request, warnings: ['email_not_sent' | 'order_link_failed'] }`. The UI then shows `severity="warning"`: "Quote saved, but the email was not sent — copy the payment link and send it manually", with a Copy button.
- **Tests / acceptance criteria:**
  - Route tests:
    - (a) send_quote on `paid` returns 400 and never calls `createSquareCheckout`;
    - (b) when the email throws, the response has `warnings: ['email_not_sent']`;
    - (c) re-quote cancels the previous order row;
    - (d) an empty internal note does not null `admin_notes`.
  - Contract test: `custom-requests/page.tsx` renders a `ConfirmDialog` before calling `send_quote`, and contains no `label="Admin note"`.
  - Manual: re-quote a test request. Only the newest link is payable in Square sandbox.
- **Risks / notes:** Deactivating Square links needs a Square API call. Feature-flag it if sandbox credentials are not available.

<a id="item-29"></a>
### #29 — The artwork/logo "file" product option never uploads the file
- **Priority:** P1 · **Rank:** 29/76 · **Lens:** Storefront · **Source finding:** UXS-3
> **Coordinator note:** The new checkout route test file is shared with #2/#5. The upload-rules module comes from #32.

- **Severity:** High | **Effort:** M | **Confidence:** Confirmed | **Overlaps:** none
- **Location:** `src/components/shop/ProductConfigurator.tsx:599-613`; seeds `supabase/seed/002_product_seed.sql:81-83, 290, 376`; `supabase/migrations/027_slate_sign_options_backfill.sql:38-44`; `src/lib/pricing/engine.ts:149-162`
- **Problem:**
  - Seeded products have `artwork_file` options of type `file`: slate sign "Artwork or Logo Upload — SVG is preferred", and drinkware "Custom Artwork".
  - Picking a file stores only `file.name` (`onChange(file.name)`). The cart and server treat it as free text.
  - The order records `"logo.png"` and the studio never receives the artwork, while the UI says "File selected: logo.png".
- **Fix (implementation steps):**
  1. Add an `ArtworkUploadField` component that:
     - validates the file against the shared rules (UXS-8);
     - POSTs to `/api/custom-orders/upload` and shows progress;
     - disables Add to Cart while uploading.
  2. Store `{name, path, uploadToken, size}` on a new `CartItem.artworkUploads` field, persisted through `normalizeCartItem`.
  3. Show an "uploaded ✓" chip with a remove button (`aria-label="Remove {name}"`) and a retry action on error.
  4. Server: for `option_type==='file'`, require `{path, uploadToken}` and verify ownership the way the custom-orders route does. Persist the path on `exp_order_items` so admin can link to it.
  5. Until this ships, hide file-type options and show "email your logo after checkout" copy (owner to approve).
- **Tests / acceptance criteria:**
  - Contract test: no `onChange(file.name)`.
  - New `square/checkout/route.test.ts`: a bare filename returns 400, and a verified upload is saved in the snapshot.
  - Manual: slate sign → upload → the admin order shows a download link.
- **Risks / notes:** Upload tokens expire (SEPT §4.2). Show "upload expired — re-attach" on the cart line.

<a id="item-30"></a>
### #30 — Checkout gating and error feedback
- **Priority:** P1 · **Rank:** 30/76 · **Lens:** Storefront · **Source finding:** UXS-6
> **Coordinator note:** Part 3 (promo Apply step and errors) is implemented with #19; required, validated email is also enforced server-side in #20.

- **Severity:** High | **Effort:** M | **Confidence:** Confirmed | **Overlaps:** §8.1 residual / OCT-19
- **Location:** `CheckoutPageView.tsx:94-96, 122-137, 326-344, 364-404`; `ShippingForm.tsx:125-145, 158-165, 171, 236-253`; `TermsOfServiceCheckbox.tsx` (never rendered); `CartProvider.tsx:180, 186-199`; `/api/promo/validate` (no storefront caller)
- **Problem:**
  1. "Pay with Square" stays disabled until shipping is calculated, and nothing says why.
  2. Email is marked required, but `canCheckout` checks neither its presence nor its format. With no email, the Shippo tracking email can never reach the buyer.
  3. The promo code has no Apply step, and the route silently ignores an invalid code.
  4. Editing the address clears the chosen rate but leaves the old rates in the dropdown, so the customer can pick a rate quoted for the previous address.
  5. Error boxes have no `role="alert"` and sit below the shipping block, off-screen on mobile.
  6. `TermsOfServiceCheckbox` is never rendered.
  7. The cart starts empty and reads localStorage in an effect, so the server-rendered `/checkout` shows "Your Cart Is Empty" until hydration finishes.
  8. Pressing Back from Square wipes the address, rate and email.
- **Fix (implementation steps):**
  1. Compute a `blockingReason` (for example "Enter your email…" or "Calculate shipping to continue"). Render it in `#pay-blocker` and point the Pay button's `aria-describedby` at it.
  2. Validate the email (reuse the regex at `NewsletterBlock.tsx:29`). Add the helper text "We'll send your receipt and tracking link here" and include the email in `canCheckout`.
  3. Add an Apply button that calls `/api/promo/validate` and shows "applied −$X" or the error inline. The route should return 400 for an invalid code instead of ignoring it.
  4. On any address change, call `setRates([])` and show "recalculate".
  5. Show errors in `role="alert"` (or an MUI `Alert`) above the Pay button, then scroll to the error and focus it.
  6. Render `TermsOfServiceCheckbox`, make it required, and persist `tosAcceptedAt`.
  7. Add `hydrated` to the cart context and show skeletons until it is true.
  8. Save a checkout draft (address, rate, email) to sessionStorage.
- **Tests / acceptance criteria:**
  - Extract `src/lib/checkout/blocking-reason.ts` and give it unit tests.
  - Contract tests: the terms checkbox is rendered; `aria-describedby="pay-blocker"`; `/api/promo/validate` is called; `ShippingForm` contains `setRates([])`; the cart exposes `hydrated`.
  - Manual: run the harness at 390 px with a throttled CPU.
- **Risks / notes:** Making email required is necessary for tracking (UXS-5).

<a id="item-31"></a>
### #31 — Checkout address form: no recipient name, no autofill hints, unlabeled selects
- **Priority:** P1 · **Rank:** 31/76 · **Lens:** Storefront · **Source finding:** UXS-7
> **Coordinator note:** The recipient-name field is also required by #20's address whitelist.

- **Severity:** High | **Effort:** S | **Confidence:** Confirmed | **Overlaps:** none (prior captures had an empty cart)
- **Location:** `ShippingForm.tsx:169-253`; `CheckoutPageView.tsx:326-344`; `route.ts:408-410`
- **Problem:**
  - No field declares `autoComplete`.
  - There is no Full name field, even though the type has `name`, so the order has no recipient.
  - The Country select (US/CA/MX codes) and the shipping-options select have no labels.
  - The ZIP field has no input hints.
  - Headings skip levels (h1 → h5 → h6).
- **Fix (implementation steps):**
  1. Add a required "Full name" field (`autoComplete="shipping name"`). Send it to the route and prepend it to the order note and the Shippo address.
  2. Add `autoComplete` tokens:
     - `shipping address-line1`;
     - `shipping address-line2`;
     - `shipping address-level2`;
     - `shipping address-level1`;
     - `shipping postal-code`, plus `inputProps={{ autoCapitalize: 'characters' }}`;
     - `shipping country`.

     Add an optional `tel` field and send it as `buyerPhone`.
  3. Use `FormControl` + `InputLabel` + `labelId` for both selects, and show full country names.
  4. Stack State/ZIP/Country on xs.
  5. Use `component="h2"` for the section headings, and wrap the address in a `fieldset` with a `legend`.
- **Tests / acceptance criteria:**
  - Contract `shipping-form.contract.test.ts`: the `autoComplete` tokens are present, and every `Select` has a matching `labelId`.
  - Optional: a storefront-wide scan for Selects without a `labelId` (as OCT-20 did for admin).
  - Manual: phone autofill offers a saved address.
- **Risks / notes:** Confirm Shippo accepts the name field (it does: `name` on the address object).

<a id="item-32"></a>
### #32 — Artwork upload rules contradict each other, and failures appear only at submit
- **Priority:** P1 · **Rank:** 32/76 · **Lens:** Storefront · **Source finding:** UXS-8
> **Coordinator note:** The SVG decision interacts with #64 (sanitizer). If SVG is allowed for customers, it must be sanitized.

- **Severity:** High | **Effort:** S–M | **Confidence:** Confirmed | **Overlaps:** none
- **Location:**
  - `upload/route.ts:9-19, 63-65, 90-110`
  - `CustomOrderIntakeForm.tsx:210-214, 229-248, 487-506`
  - `ProductConfigurator.tsx:607`
  - `027_slate_sign_options_backfill.sql:42` ("SVG is preferred")
  - `002_product_seed.sql:83` ("Max 20 MB")
  - `resources/content.ts:267` ("vector artwork is preferred")
  - `custom-orders/route.ts:27-31`
- **Problem:**
  - The copy and the file pickers (`accept=".svg"`) invite SVG, and help text says 20 MB. The API rejects SVG by design and caps uploads at 15 MB.
  - The intake form checks nothing until Submit, then uploads files one by one. Errors appear at the top of the form, off-screen on mobile.
  - If one file fails, the files uploaded before it are orphaned.
  - Picking files again replaces the list. Files beyond the limit are silently dropped by `.slice(0, maxFiles)`.
- **Fix (implementation steps):**
  1. Create `src/lib/uploads/artwork-rules.ts` with the extensions, MIME types, size limits, `describeArtworkRules()` and `validateArtworkFile()`. Use it in both routes and all three pickers.
  2. Owner decision: support SVG (sanitized, see SD-12) or change the copy to "vector PDF preferred". Ship any data change as reviewable SQL.
  3. Validate on selection. Show a row per file with name, size, progress and a remove button. Make selection additive and announce when files are truncated.
  4. Upload eagerly per file with `allSettled`, with a per-file retry.
  5. Show the rules as helper text.
- **Tests / acceptance criteria:**
  - `artwork-rules.test.ts`.
  - Contract test: no local extension lists in the routes, and no `accept=".svg"` unless the rules allow SVG.
  - Manual: picking an SVG shows an immediate inline error.
- **Risks / notes:** Uploads are rate-limited to 20 per IP per hour; explain a 429 in plain terms.

<a id="item-33"></a>
### #33 — Configurator accessibility: unlabeled fields, vague required errors, silent price and cart updates
- **Priority:** P1 · **Rank:** 33/76 · **Lens:** Storefront · **Source finding:** UXS-9
- **Severity:** High | **Effort:** M | **Confidence:** Confirmed (screen-reader output needs a browser check) | **Overlaps:** OCT-19 / §8.1 residual; §8.8 (sticky mobile bar)
- **Location:** `ProductConfigurator.tsx:310, 336-340, 447-457, 545-626, 281-282`; `CartProvider.tsx:229-255`
- **Problem:**
  - Fields are unlabeled for assistive tech, so they announce as "Select an option, combobox" or "edit text":
    - `FormLabel` has no `htmlFor`;
    - `Select` has no `labelId`;
    - text-type `TextField`s have no `label`.
  - Pill groups aren't grouped.
  - The required-field caption is generic and not linked to the button, and no field ever shows an error state.
  - The total has no `aria-live`.
  - Add to Cart only swaps its label for 2 s. `openDrawer` is never called and there is no live region.
- **Fix (implementation steps):**
  1. Label every field (`InputLabel` + `labelId`, or `TextField label`), with help text via `helperText`. Remove the nested `FormControl`.
  2. Wrap the pills in `role="group"` + `aria-labelledby`.
  3. Track touched fields and show an error per field. Replace the caption with "Still needed: Finish, Engraving Placement" (`id="atc-blocker"`, linked through `aria-describedby`).
  4. Put the total in a polite live region, with debounce.
  5. After adding, call `openDrawer()`, focus the drawer heading, and announce "Added X".
  6. Add the sticky mobile bar per §8.8.
- **Tests / acceptance criteria:**
  - Contract `product-configurator.contract.test.ts`.
  - A pure `getMissingRequiredOptions` function with unit tests.
  - Manual: an NVDA/VoiceOver pass.
- **Risks / notes:** Keep the drawer non-blocking.

<a id="item-34"></a>
### #34 — Admin sessions never expire, and the Settings "Session TTL" control is dead
- **Priority:** P1 · **Rank:** 34/76 · **Lens:** Security
- **Severity:** Medium | **Effort:** M (or S if the owner chooses "delete the control") | **Confidence:** Confirmed: `getAdminSessionSettings` has zero callers. Dashboard time-boxing state is unverified (#1 check 9). | **Sources:** SA-5, UXA-24 | **Existing plan overlap:** SEPT §10.17 (open decision). This adds that the advertised TTL is unenforced.
- **Location:** `src/app/admin/(panel)/settings/page.tsx:232-245`; `src/app/api/admin/settings/route.ts:112-128`; `src/lib/storefront-settings.ts:115-126`; `src/proxy.ts:118-127`; `src/lib/admin/auth.ts:139-240`; `node_modules/@supabase/ssr/dist/main/utils/constants.js:4-11` (400-day cookie `maxAge`)
- **Problem:**
  - The settings page says the TTL "Controls how long an admin login remains valid before re-authentication is required". It validates (1–336), saves, and nothing reads it.
  - The proxy rotates tokens on every `/admin` request with 400-day cookies, so unless dashboard time-boxing is set, a session lasts until sign-out.
  - MFA is now mandatory (§10.16, shipped in `963e97f`), which raises the bar for **new** sign-ins. But a refresh token keeps its `aal2` level when it refreshes. A stolen token (via #10, XSS or a shared device; cookies are JS-readable) therefore stays a permanent MFA-satisfied admin credential, while the owner believes the limit is, say, 12 hours.
  - `963e97f` also added `signOutOthers` (`AuthProvider.tsx:77`, Supabase `scope: 'others'`, part of §10.17). Revocation is now possible, but expiry still is not enforced.
  - Clearing the field also snaps it to 1 (`|| 1`).
- **Fix (owner decision first; both options are concrete):**
  - **Option A — enforce:**
    1. `src/lib/auth/claims.ts` (which gained `hasAal2` in `963e97f`): add `authenticatedAt` = the max numeric `amr[].timestamp`. Supabase tokens carry `amr` from the original sign-in, including the `totp` entry, and it survives refresh. Measure the TTL from the `totp` entry when present, so re-authenticating means re-doing MFA.
    2. `src/lib/admin/auth.ts`: add `assertAdminSessionFresh(claims)` and call it in both gates after the allow-list check.
       - Read `getAdminSessionSettings()`, memoised for 60 s.
       - If `authenticatedAt` is missing, or older than `ttl_hours*3600`: API → 401 `{ error: 'Admin session expired. Sign in again.', code: 'admin_session_expired' }`; page → redirect `/admin/login?reason=expired&next=…`.
       - Fail closed on a missing `amr`.
    3. `AdminLoginView`: when `reason=expired`, call `signOut()` before offering Google sign-in, so a fresh `amr` is minted.
    4. Also enable dashboard session time-boxing if the plan allows it.
  - **Option B — remove:** delete the TTL section and its validation, replace it with "Sessions are managed by Google sign-in; use Sign out to end this session," and record "unbounded by design" in §10.17.
- **Tests / acceptance criteria:**
  - **Option A:**
    - `claims.test.ts`: `amr` parsing covers missing, non-numeric and max.
    - `auth.test.ts`: expired → 401 with `code`; within TTL → passes; missing `amr` → 401; the page gate redirects with `reason=expired`.
    - Contract test: `auth.ts` references `getAdminSessionSettings`.
  - **Option B:** contract test: the settings page has no `ttl_hours`.
- **Risks / notes:** Option A logs out admins whose session is older than the TTL at deploy; announce it. Pair with #73 (UXA-23), so an expired session mid-edit doesn't lose the form.

<a id="item-35"></a>
### #35 — Money math: per-unit rounding makes the charge differ from the displayed price, stored totals don't reconcile, and no sales tax is computed
- **Priority:** P1 · **Rank:** 35/76 · **Lens:** Payments
- **Severity:** Medium | **Effort:** M | **Confidence:** Confirmed by replicating the engine in Node | **Sources:** REL-9 | **Existing plan overlap:** SEPT §2.14 (tax)
- **Location:** `src/lib/pricing/engine.ts:189-190`; `src/app/api/square/checkout/route.ts:240-265,370-395,454-468`; `src/app/checkout/success/page.tsx:209-213`; `src/lib/square/client.ts:53-64`
- **Problem:**
  1. The Square line amount is `round(lineTotal/qty × 100) × qty`, so the displayed and charged totals drift:
     - $1.99 × 7 at 15%: displayed $11.84, charged $11.83.
     - $0.35 × 500 at 17%: displayed **$145.25**, charged **$145.00**.
     - $3.50 × 3 at 5%: displayed $9.97, stored $9.98, charged $9.99.
  2. Promos rewrite the unit price, which repeats the rounding.
  3. `discount_amount` includes the free-shipping discount, but `shipping_cost` is stored post-discount, so subtotal − discount + shipping ≠ total. Item `line_total` is stored pre-promo. The success page has no shipping row.
  4. Ad-hoc Square line items carry no tax.
- **Fix (implementation steps):**
  1. Do all money math in integer cents end to end; the pricing function from #5 returns cents.
  2. Send **undiscounted** unit prices to Square, and express tiers and promos as Square `order.discounts` (`FIXED_AMOUNT`, scope `LINE_ITEM`) referenced via `applied_discounts`. Express free shipping as a discount on the shipping line.
  3. Store from cents:
     - `shipping_cost` pre-discount, plus a new `shipping_discount` column;
     - per-item post-promo `line_total`;
     - `tax_amount` (new column).

     Enforce `subtotal − discount + shipping − shipping_discount + tax = order_total` with a unit-tested `assertOrderTotalsReconcile()` before insert.
  4. **Tax: owner/accountant decision.** For nexus states, add `order.taxes`, or use Square's automatic tax if available for payment links. Store `tax_amount`.
  5. Show Shipping and Tax rows on the success page, order page and emails.
- **Tests / acceptance criteria:**
  - The three examples above produce charged cents equal to the displayed amount.
  - A property-style invariant test over randomized carts (seeded RNG) checks that the stored fields reconcile and Square line totals sum to the order total.
- **Risks / notes:** Changes how orders appear in the Square dashboard (discount lines). Tell the owner.


---

## 7. P2 — Important

<a id="item-36"></a>
### #36 — Public signup endpoints can be abused to make the shop email arbitrary addresses; capacity alerts have no limits at all
- **Priority:** P2 · **Rank:** 36/76 · **Lens:** Security
- **Severity:** Medium | **Effort:** M | **Confidence:** Confirmed | **Sources:** SD-10 (parts 1, 3, 4, 5) | **Existing plan overlap:** SEC-015; SEC-016 (bypassed by part 3)
- **Location:** `src/app/api/capacity-alerts/subscribe/route.ts:16-36`; `src/lib/capacity-alerts.ts:100-148,181-217`; `src/app/api/future-products/route.ts:94-113`; `src/app/api/newsletter/subscribe/route.ts:123-143`; `src/app/api/custom-orders/route.ts:180-216,224`
- **Problem:**
  1. **Capacity alerts.**
     - The subscribe route has no rate limit, no body cap, validates email only with `includes('@')`, and doesn't check the category. No UI calls it.
     - Anyone can insert unlimited rows. The admin "process" button then mails up to 250 attacker-chosen addresses per run from the shop's domain, which harms sender reputation.
     - Rows with a bogus category are skipped but stay active, and the processor takes the oldest N active rows, so ~250 junk rows permanently starve real subscribers.
  2. **Future-products interest.** It upserts the newsletter row with `subscribed: true, unsubscribed_at: null`, silently **re-subscribing people who opted out**.
  3. **Custom-order intake.** It sends a confirmation to any address, with a 120-character attacker-chosen name in it, rate-limited per IP only.
  4. Newsletter, back-in-stock and future-products store **raw** consent IPs (cart capture hashes them).
- **Fix (implementation steps):**
  1. **Capacity alerts:**
     - Delete the unused capacity subscribe route (preferred), or harden it with `parseJsonBodyOrError`, per-IP (5/h) and per-email (3/day) rate limits, `validateEmail`, and an existence check against `exp_taxonomy` (type `category`).
     - In the processor, mark unknown-category rows `unsubscribed` (or filter them out in SQL).
  2. **Future products:** never flip an existing row to subscribed. Insert only when absent; otherwise update just `interest_details`. Keep interest data separate from the newsletter consent flag. (UXS-2 / #18 fixes the page form itself.)
  3. **Custom-order intake:** add a per-email limit of 3 per 24 h. Strip URLs and markup from the name before it reaches the email (it's already HTML-escaped).
  4. **Raw IPs:** hash `consent_ip` with the same HMAC used by cart capture, and backfill or null the existing raw values (migration).
- **Tests / acceptance criteria:**
  - Capacity: 6th call → 429; `a@` → 400; unknown category → 404 (or a contract test that the route is gone).
  - Future products: a row unsubscribed 5 days ago stays unsubscribed.
  - Intake: 4th request for the same email in 24 h → 429.
  - Live check: `select count(*) filter (where category_key not in (select key from exp_taxonomy where type='category')), count(*) from exp_capacity_reopen_alerts where status='active';`

<a id="item-37"></a>
### #37 — External calls have no timeouts or retry policy, and config silently falls back to wrong values (fake ship-from address, localhost redirect)
- **Priority:** P2 · **Rank:** 37/76 · **Lens:** Reliability
- **Severity:** Medium | **Effort:** M | **Confidence:** Confirmed | **Sources:** REL-11 | **Existing plan overlap:** SEPT §1.2, §10.13
- **Location:** `src/lib/square/client.ts:46-81`; `src/lib/shippo/client.ts:126-149,130-138,178-192,269-275,322-328`; `src/app/api/square/checkout/route.ts:300-308`; `src/app/api/shippo/webhook/route.ts:158-159`; `src/lib/back-in-stock.ts:80,117`; `src/lib/abandoned-cart.ts:58`; `src/lib/usps/client.ts` (dead); `.env.example`
- **Problem:**
  1. No `AbortSignal` is used anywhere, and undici defaults to a ~300 s timeout. A slow Shippo call hangs checkout, which invites double clicks and retries. Square's `response.ok` isn't checked before parsing.
  2. Silent fallbacks:
     - `SHIPPO_FROM_*` → "123 Main St, Anytown CA 90210", so rates and charges use the wrong origin;
     - `NEXT_PUBLIC_SITE_URL` → `http://localhost:3000` in the Square `redirect_url`;
     - the sender defaults to `orders@rubysrelics.com` (a different domain than the site);
     - `SQUARE_ENVIRONMENT` defaults to sandbox.
  3. Nothing validates env at startup, and `.env.example` lists none of the Square, Shippo or Resend variables.
- **Fix (implementation steps):**
  1. New `src/lib/http/fetch-with-timeout.ts`: `fetchWithTimeout(url, init, { timeoutMs, retries })` using `AbortSignal.timeout`.
     - Timeouts: Square 10 s, Shippo rates 15 s, others 8 s.
     - Exponential backoff with jitter on 429/5xx, **only for idempotent calls** (GETs, or POSTs carrying an idempotency key).
     - Map `TimeoutError` to a typed error the routes turn into 504 "The shipping service is slow — try again".
  2. New `src/lib/config/server-env.ts`: a typed schema of every required production variable, including:
     - `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_WEBHOOK_URL`, `SQUARE_ENVIRONMENT`;
     - `SHIPPO_API_KEY` and `SHIPPO_FROM_*`;
     - `RESEND_API_KEY` and `EMAIL_FROM`;
     - `NEXT_PUBLIC_SITE_URL`, which must be `https` and not localhost in production;
     - `CRON_SECRET` (#38) and `SHOP_TIME_ZONE` (#39).

     Call it from `src/instrumentation.ts` `register()`: throw in production, log-only in preview/dev. Replace every inline `?? 'fallback'` with the validated getter.
  3. Complete `.env.example` with all of the above (placeholders only).
  4. Delete `src/lib/usps/client.ts` if unused (grep first), and remove the `square` SDK (#9).
- **Tests / acceptance criteria:**
  - `server-env.test.ts`: production with a localhost site URL throws; a missing `SHIPPO_FROM_STREET1` throws in production and warns in dev.
  - `fetch-with-timeout.test.ts` with fake timers: aborts at the deadline; retries a 503 twice, then succeeds; does not retry a POST without an idempotency key.
  - Checkout route: a Shippo timeout → 504 and no Square call.
- **Risks / notes:** A strict env check can take production down if a variable is missing. Deploy it log-only first, read the logs, then make it fatal.

<a id="item-38"></a>
### #38 — There is no scheduler: expiry, reconciliation, retention and notification jobs only run when someone clicks a button
- **Priority:** P2 · **Rank:** 38/76 · **Lens:** Reliability
- **Severity:** Medium | **Effort:** M | **Confidence:** Confirmed (no `vercel.json`; SEPT §10.12 notes `pg_cron` is absent) | **Sources:** REL-12 | **Existing plan overlap:** SEPT §2.3, §2.4, §2.13
- **Location:** `src/app/api/admin/abandoned-carts/route.ts:63-86`; `src/app/api/admin/custom-requests/recovery/route.ts`; `src/app/api/admin/capacity-alerts/route.ts`; `src/app/api/admin/back-in-stock/route.ts`; `src/lib/custom-request-recovery.ts:63-70`; `src/app/api/webhooks/square/route.ts:123-129`
- **Problem:**
  - Abandoned-cart, reminder and capacity jobs run only when an admin clicks.
  - Stale `awaiting_payment` orders never expire, and once #12 ships their inventory holds never release.
  - Nothing reconciles pending orders with Square when a webhook is missed.
  - `exp_cart_captures`, alerts, rate-limit rows and webhook events are kept forever, including PII.
  - Custom-request "recovery" targets requests waiting on the **shop's** quote; confirm with the owner that this is intended.
- **Fix (implementation steps):**
  1. `vercel.json` crons:
     - `/api/cron/reconcile-payments`, every 15 min: pending orders older than 10 min with a `square_order_id` → `retrieveSquareOrder` → `exp_mark_order_paid` (#4);
     - `/api/cron/expire-checkouts`, hourly: `awaiting_payment` older than the hold → release inventory (#12) and promo claims (#19), delete the Square link, cancel with a status event; also expire custom quotes past `quote_expires_at` (#15);
     - `/api/cron/notifications`, hourly: back-in-stock, capacity and abandoned-cart **after #8 ships**;
     - `/api/cron/retention`, daily.

     Check the Vercel plan's cron limits; Hobby allows daily jobs only, so the fallback is `pg_cron` + `pg_net`, or one daily job that does everything.
  2. Each cron route requires `Authorization: Bearer ${CRON_SECRET}` (Vercel sends this automatically), compared with `timingSafeEqual`. Each runs bounded batches (≤ 100 rows) and uses conditional claims, so overlapping runs are safe.
  3. Migration `NNN_retention.sql`: `exp_run_retention()` (security definer, service-role only) that deletes:
     - cart captures older than 90 days;
     - unsubscribed or notified alerts older than 180 days;
     - expired rate-limit rows;
     - webhook events older than 30 days.

     Document these periods in the privacy policy (#40).
  4. The admin "run now" buttons call the same library functions.
- **Tests / acceptance criteria:**
  - Each cron route: missing or wrong bearer → 401.
  - The expire job touches only `awaiting_payment` rows older than the hold, and releases inventory once.
  - The reconcile job is a no-op for orders already paid.
- **Risks / notes:** **Ship #8 first**, or the notifications cron will email paying customers.

<a id="item-39"></a>
### #39 — Finance always leaves out today and buckets by the wrong timestamp; customer-facing times are shown in UTC
- **Priority:** P2 · **Rank:** 39/76 · **Lens:** Reliability
- **Severity:** Medium | **Effort:** S–M | **Confidence:** Confirmed for the date handling; row-cap/URL-length thresholds Likely | **Sources:** REL-13, UXA-12 (found independently by two reviewers) | **Existing plan overlap:** none (see #76 / UXA-26 for admin display formatting)
- **Location:**
  - `src/app/admin/(panel)/finance/page.tsx:91-96,139,165,187`
  - `src/app/api/admin/finance/route.ts:59-68,140-185,199-216,247-250,271-273`
  - `src/app/api/admin/labor/route.ts:68-72`
  - `src/app/checkout/success/page.tsx:69-80`
  - `src/app/orders/[id]/page.tsx:72-83`
  - `src/app/custom-orders/[id]/page.tsx:89`
  - `src/lib/custom-request-recovery.ts:39`
- **Problem:**
  1. The page sends `to=2026-10-06`. `new Date('2026-10-06')` is 00:00 **UTC**, and the queries use `.lte('created_at', …)`. So every range, including the default "last 30 days → today", excludes today. For a US owner, evening sales land on the wrong day. CSV exports share the bug.
  2. Sales are bucketed by `created_at` rather than `paid_at`, and refunds by creation date rather than `refunded_at`. Shipping is counted as sales, and `branch='DEV'` rows aren't filtered.
  3. Unbounded selects hit PostgREST's 1000-row cap silently, and `.in('order_id', allIds)` blows the URL limit after a few hundred orders.
  4. Customer pages and emails render UTC times. The labor route throws a `RangeError` (500) on an invalid date.
- **Fix (implementation steps):**
  1. Add a `SHOP_TIME_ZONE` setting (env, default `America/Chicago`; confirm with the owner), validated in #37.
  2. New `src/lib/time/shop-day.ts`: `shopDayRangeToUtc(fromYmd, toYmd, tz)` returns half-open `[startUtc, endUtcExclusive)` bounds, DST-correct. Use `Intl.DateTimeFormat` offset math; no new dependency is needed.
  3. Finance route:
     - accept date-only params, convert with the helper, and query with `.gte(start).lt(endExclusive)`;
     - return 400 for invalid dates (same for labor);
     - bucket sales by `paid_at`, refunds by `refunded_at`;
     - report shipping separately;
     - filter `branch='PROD'`.
  4. Replace unbounded selects with a SQL function `exp_finance_summary(p_from timestamptz, p_to timestamptz)` (service-role only) that aggregates server-side. Add indexes on `exp_orders(paid_at)` and the labor `logged_at`.
  5. Pass `timeZone: SHOP_TIME_ZONE` in every customer-facing `Intl.DateTimeFormat`/`toLocaleString`, and label the finance range "(shop time)".
- **Tests / acceptance criteria:**
  - `shop-day.test.ts`: America/Chicago bounds, including both DST change days.
  - Route tests: an order paid at 23:30 local on the `to` day is included; the default range includes an order from one minute ago; `to=garbage` → 400.

<a id="item-40"></a>
### #40 — Privacy and email compliance: analytics ignore the cookie choice, marketing emails lack unsubscribe and postal address, and there are no retention or deletion paths
- **Priority:** P2 · **Rank:** 40/76 · **Lens:** Privacy
- **Severity:** Medium | **Effort:** M | **Confidence:** Confirmed | **Sources:** REL-14, UXS-18, SD-10 (part 5, raw IPs → #36) | **Existing plan overlap:** SEPT §2.9; SEPT §7 (informational)
- **Location:** `src/app/layout.tsx:89-92`; `src/lib/analytics/events.ts`; `src/lib/cookie-consent.ts`; `src/components/common/CookieBanner.tsx:53-62,130-132,183-208`; `src/components/layout/Footer.tsx:166-173`; `src/app/resources/content.ts:95-121,160-166`; `src/lib/abandoned-cart.ts:93-97`; `src/lib/back-in-stock.ts:103-112`; `src/lib/capacity-alerts.ts:81-90`; `src/app/api/newsletter/subscribe/route.ts:47-55`
- **Problem:**
  1. **Consent.**
     - The banner offers an opt-in Analytics switch and "Essential Only", and the policy promises an opt-out manager.
     - `<Analytics />` and `track()` run regardless of the stored choice, including on `/admin`.
     - Raw search text is sent despite "no personal data".
     - The banner never comes back: the footer "Cookie Settings" only opens the policy page.
     - The Preferences switch does nothing.

     Vercel Web Analytics is cookieless, so the main problem is that the **copy is false**.
  2. **Marketing email.** Abandoned-cart emails have no unsubscribe, no suppression list, no postal address and no `List-Unsubscribe` header. That breaks CAN-SPAM and Gmail/Yahoo bulk-sender rules. Alert emails also lack a postal address.
  3. **Newsletter.** There is no unsubscribe or confirmation, yet it tells users to "check your email".
  4. There are no retention periods and no "delete my data" path.
- **Fix (implementation steps):**
  1. **Owner decision:** keep opt-in analytics (implement step 2) or declare analytics exempt (cookieless) and rewrite the banner and policy copy to say so. Either is fine; mismatched copy is not.
  2. If opt-in:
     - `cookie-consent.ts`: add `hasAnalyticsConsent()` and dispatch a `rrs:consent-change` event.
     - Add a client `ConsentedAnalytics` wrapper whose `beforeSend` returns `null` without consent, and skips `/admin`.
     - `events.ts`: `safeTrack()` no-ops without consent and never sends raw query text (send length or bucket only).
     - Footer "Cookie Settings" reopens the banner dialog.
     - Implement or remove the Preferences switch.
  3. **Email:**
     - Add `renderMarketingFooter({ unsubscribeUrl })` with the shop's postal address (from settings) and the unsubscribe link.
     - Send `List-Unsubscribe: <https://…/api/email/unsubscribe?token=…>, <mailto:…>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (via `sendEmail` headers, #14).
     - Migration `NNN_email_suppressions.sql`: `exp_email_suppressions(email_hash text primary key, reason text, created_at timestamptz default now())`, RLS on with no policies.
     - New `/api/email/unsubscribe` (GET shows a confirm page; POST one-click) using the existing HMAC token pattern from back-in-stock.
     - Every marketing send checks suppression first.
  4. **Newsletter:** double opt-in (a confirmation email with an HMAC link), or change the response copy to not promise an email.
  5. **Retention and deletion:** use #38 for retention. Add an admin "Delete customer data" action that anonymises orders (keeps financial rows, nulls name/email/address) and deletes captures, alerts and subscriptions for an email. Document both in the privacy policy (`resources/content.ts`).
- **Tests / acceptance criteria:**
  - `beforeSend` returns `null` without consent.
  - `safeTrack` doesn't call `track` without consent.
  - Rendered abandoned-cart HTML contains the unsubscribe link and postal address.
  - The send call includes `List-Unsubscribe`.
  - Unsubscribe route: a bad token → 400; a good token → suppression row.
  - Manual: with analytics declined, no `/_vercel/insights` request appears in the network tab.
- **Risks / notes:** Recorded traffic drops if opt-in is enforced.

<a id="item-41"></a>
### #41 — Custom request lifecycle has dead ends and missing information at decision points
- **Priority:** P2 · **Rank:** 41/76 · **Lens:** Admin · **Source finding:** UXA-10
> **Coordinator note:** Stale or duplicate quote links and the handoff-picks-newest-order bug are fixed in #15. This item covers the remaining lifecycle UX.

- **Severity:** Medium | **Effort:** M | **Confidence:** Confirmed | **Overlaps:** §9.16, §9.17 (toolbar wrap and UUID title, which are visual and not repeated here)
- **Location:** `custom-requests/page.tsx:20-40,88-116,486-705`; `src/app/api/custom-orders/[id]/route.ts:347-355,398-401,512-515`; `src/app/api/admin/custom-requests/route.ts:22-47`
- **Problem:**
  1. **Expired-quote trap.** "Resend Quote" on an out-of-date quote flips the status to `expired` and replies "Extend expiry before resending." (`route.ts:350-354`). But "Extend Expiry" only works for `quote_sent` (`route.ts:399`; button disabled at `page.tsx:660`), and Send Quote fails for `expired` (UXA-3). The only way out is the undiscoverable Reject → Reopen → Send.
  2. **Quoted amount is never shown.** `quote_amount` is fetched (`page.tsx:30`) but never rendered, so the owner cannot see what they quoted when a customer asks.
  3. **No paid → order link.** A paid request does not link to its `exp_orders` row, and "Handoff to Production" gives no next step: no link to the order, schedule or exports.
  4. **Search, filters and volume.** The list is hard-capped at 60 rows and search filters after the cap (`route.ts:26,39-47`), so older requests are unfindable. The default filter is "All", which mixes cancelled requests into the triage view. Status options are raw snake_case (`page.tsx:443-451`). Every card shows every action, including a primary "Send Quote" on paid requests.
- **Fix (implementation steps):**
  1. Allow `extend_quote_expiry` for `expired` too, setting status back to `quote_sent`. Or make Re-quote (UXA-3) accept `expired`. Change the 409 message to name the button that works.
  2. Render "Quoted $X.XX · sent {date} · expires {date}" on every quoted card.
  3. Return the linked `order_id` in the list query (`exp_orders` by `custom_request_id`) and render "Open order →" to `/admin/orders?orderId=…` (needs UXA-15's URL state).
  4. Move `q` into the SQL (`.or('customer_email.ilike.%q%,customer_name.ilike.%q%,item_type.ilike.%q%')`, with no `id.ilike` on a uuid; see UXA-14). Add `range()` pagination with a "Load more" button. Default the status filter to `awaiting_quote`, and show counts per status as filter chips.
  5. Show only the actions valid for each status: a primary button for the next step, secondary actions in a "More" `Menu`.
- **Tests / acceptance criteria:** Route test: extend on `expired` succeeds and restores `quote_sent`. Pure unit test for `actionsForStatus(status)` returning the allowed actions (extracted to `src/lib/admin/custom-request-actions.ts`). Manual: an expired request can be re-quoted in one step.
- **Risks / notes:** Depends on UXA-2 being fixed first; until then no action works.

<a id="item-42"></a>
### #42 — No unsaved-changes protection anywhere, and every sidebar click is a full page reload
- **Priority:** P2 · **Rank:** 42/76 · **Lens:** Admin · **Source finding:** UXA-11
- **Severity:** Medium | **Effort:** M | **Confidence:** Confirmed | **Overlaps:** §9 "Ideas" (sticky save bar for the homepage), which is an idea only
- **Location:** `src/components/admin/AdminShell.tsx:348-376,397-436`; long forms in `builder/page.tsx`, `homepage/page.tsx`, `settings/page.tsx`, `shipping/page.tsx`, `orders/page.tsx:161-167`. No `beforeunload` exists anywhere in `src/` (grep).
- **Problem:** The builder (several sections, several Save buttons), the homepage editor (six Save buttons) and Settings and Shipping (one Save at the bottom) keep edits only in React state. The module rail and search results are plain `<a href>` (`component="a"`), not Next `Link`, so one click on a sidebar item or search hit discards everything without warning. Every module switch also re-runs the server layout, which calls `syncOperationalNotifications()` (two selects, an upsert of up to 160 rows, and a count) before the page renders, making navigation slower than it needs to be.
- **Fix (implementation steps):**
  1. Add `src/components/admin/useUnsavedChangesGuard.ts(isDirty: boolean, message?)`. It registers `beforeunload` when dirty, and intercepts clicks on in-panel anchors via a capturing `document` click listener for `a[href^="/admin"]`, calling `window.confirm(message)` and `preventDefault()` when the user cancels.
  2. Switch the module rail and search results to `next/link` (`component={Link}`) so navigation is soft and the layout's notification sync doesn't re-run per click. Keep `aria-current`; the existing contract test in `admin-shell.contract.test.ts` checks for it.
  3. Wire dirty flags:
     - builder: snapshot comparison per section;
     - homepage: one `JSON.stringify(loaded) !== JSON.stringify(current)` per section;
     - settings and shipping: compare to the loaded object.
  4. Show a sticky bottom bar (`position: sticky; bottom: 0`) with "Unsaved changes · Save · Discard" on settings, shipping and the builder core section.
- **Tests / acceptance criteria:**
  - Contract tests: (a) builder, homepage, settings and shipping import `useUnsavedChangesGuard`; (b) `AdminShell.tsx` uses `Link` for module links, with no `component="a"` on module or search rows.
  - Unit test for a pure `isDirty(a, b)` helper.
  - Manual: edit a setting, click "Orders", and a confirm dialog appears; Cancel keeps the edit.
- **Risks / notes:** The App Router has no route-change blocking API, which is why the click-capture approach is used. Test that it doesn't block the Sign out button.

<a id="item-43"></a>
### #43 — Saving inventory settings overwrites stock with a stale count
- **Priority:** P2 · **Rank:** 43/76 · **Lens:** Admin · **Source finding:** UXA-13
- **Severity:** Medium | **Effort:** S | **Confidence:** Confirmed (mechanism). How often it happens depends on order volume. | **Overlaps:** none
- **Location:** `src/app/admin/(panel)/inventory/page.tsx:121-173`; `src/app/api/admin/inventory/route.ts` (POST upsert ~L174-237)
- **Problem:** "Edit" loads `available_qty` into the editor. "Save configuration" always sends `availableQty` as an absolute value, even when the owner only changed the low-stock threshold or the override. A sale or reservation between opening the editor and saving is reversed, and the ledger records the reversal as `reason_code: 'initial_set'`. Oversell risk on ready-made items.
- **Fix (implementation steps):**
  1. Split the editor. "Settings" (threshold, override, tracking) saves without `availableQty`; the server keeps the column when the key is absent. Quantity changes go only through the delta "Adjust" action, which already exists with reasons.
  2. If an absolute "Set count" stays, send `expectedQty` and have the server return 409 if the current quantity differs, with "Stock changed to N since you opened this — review and retry".
- **Tests / acceptance criteria:** Route test: POST without `availableQty` does not change `available_qty`; a mismatched `expectedQty` returns 409.
- **Risks / notes:** None.

<a id="item-44"></a>
### #44 — Global search and notifications never take the owner to the record; order and request search is likely broken outright
- **Priority:** P2 · **Rank:** 44/76 · **Lens:** Admin · **Source finding:** UXA-14
- **Severity:** Medium | **Effort:** M | **Confidence:** Likely for the uuid `ilike` error (Postgres has no `uuid ~~* text` operator; check the server log for `[admin:search:orders]`). Confirmed for everything else. | **Overlaps:** §9 "Ideas" (Ctrl-K)
- **Location:** `src/app/api/admin/search/route.ts:26-47,59-81`; `src/lib/admin/notifications.ts:41-130`; `src/app/api/admin/notifications/route.ts:27-32`; `src/components/admin/AdminShell.tsx:148-167,218-224,237-316`
- **Problem:**
  1. Every search result's `href` is the module root (`/admin/orders`, `/admin/catalog`, `/admin/custom-requests`), so a hit only takes the owner to a list where they search again. Product hits go to the catalog *hub*, not even the products list.
  2. `.or('id.ilike.%q%,…')` on a `uuid` column raises a Postgres operator error, so the orders and custom-request queries return nothing. Errors are only logged, so search appears to find only products and modules. Orders can't be found by customer email at all.
  3. Notifications link generically (`href: '/admin/orders'`). They never resolve: a "Paid order awaiting production" stays unread after the order ships, so the badge grows into noise. Each sync rewrites `updated_at` on every pending row, so ordering is meaningless, and no timestamps are shown.
  4. The bell panel closes itself when the list is empty or the request fails (`AdminShell.tsx:153-163`). "No notifications right now." flashes and disappears, and errors are invisible.
- **Fix (implementation steps):**
  1. Add URL deep links: `/admin/orders?orderId=…`, `/admin/custom-requests?id=…`, `/admin/catalog/products/{id}/builder`. Orders and custom requests read `useSearchParams()` on mount to select or scroll to the record (UXA-15).
  2. Search: replace `id.ilike` with a prefix match on `id::text`, through an RPC or a generated `id_text` column. Search `exp_orders.customer_email`.
  3. Notifications: on sync, set `resolved_at` (new column) for rows whose source no longer matches the condition, and hide resolved rows. Set `updated_at` only when content changes, using `ignoreDuplicates: true` plus a separate update when the body changes. Store a specific `href`. Render a relative time.
  4. Keep the panel open with an empty or error state and a Retry button. Add `aria-expanded` to the bell.
- **Tests / acceptance criteria:**
  - Route test for search: the generated filter contains no `id.ilike`, and results carry record-specific `href`s.
  - Unit test for a pure `pendingNotifications(orders, requests)` builder: resolved sources are excluded.
  - Manual: search a customer email → click → the request is highlighted.
- **Risks / notes:** Adding a column needs a migration. Note the migration-history caveat in OCT-13.

<a id="item-45"></a>
### #45 — Orders list: search only by id or status, capped at 120 rows; details open below the whole list; typed notes are lost on failure
- **Priority:** P2 · **Rank:** 45/76 · **Lens:** Admin · **Source finding:** UXA-15
- **Severity:** Medium | **Effort:** M | **Confidence:** Confirmed | **Overlaps:** §9.9 (906 px of chrome on a phone), which makes the detail placement worse on mobile
- **Location:** `src/app/admin/(panel)/orders/page.tsx:183-245,323-372,374,452-460,501-549`; `src/app/api/admin/orders/route.ts:201-234,508`
- **Problem:**
  1. Search is "order id or status" only, applied in JS *after* `.limit(120)`. There is no customer name or email, no date range, no sort and no pagination, so older orders are unfindable.
  2. List rows lead with the full UUID and show no customer, item count or age.
  3. "Open" renders the detail panel *below all 120 rows*, with no scroll or focus move. On a phone that is thousands of pixels away, and after acting the owner scrolls back up to find the next order.
  4. "Add Note" and "Add Hook" clear their inputs immediately after firing the request (`void runAction(…); setNewNote('')`). If the request fails, for example with a 401, the typed text is gone.
  5. "Scheduled for (ISO datetime)" is free text. Invalid input becomes a generic 500 "Could not create production hook.", and a valid one is stored as UTC.
  6. Selection and filters are not in the URL, so a refresh or the back button loses context.
- **Fix (implementation steps):**
  1. Move `q` into SQL (`customer_email.ilike`, `order_path.eq`, plus an id-prefix RPC per UXA-14). Add `range()` pagination and default to newest-first, with a "needs action" quick filter (`paid, in_production, ready_to_ship`).
  2. Render the detail in a right-side `Drawer` (`anchor="right"`, full-screen below `md`) and move focus to its heading. Or route to `/admin/orders/[id]`.
  3. Clear note or hook inputs only after success: `const ok = await runAction(…); if (ok) setNewNote('')`.
  4. Use `type="datetime-local"` and convert with `new Date(v).toISOString()`, the same pattern as `schedule/page.tsx:107-115`.
  5. Sync `orderId`, `status`, `payment` and `q` to `useSearchParams` / `router.replace`.
- **Tests / acceptance criteria:**
  - Contract test: `setNewNote('')` and `setHookNote('')` happen only after an awaited success.
  - Route test: `q=email@x` filters in SQL, so the mock sees `.or(...)`.
  - Manual at 390 px: Open shows the detail without scrolling.
- **Risks / notes:** None.

<a id="item-46"></a>
### #46 — Customer-facing bulk email runs fire on a single click with no preview of who will be emailed
- **Priority:** P2 · **Rank:** 46/76 · **Lens:** Admin · **Source finding:** UXA-16
> **Coordinator note:** Do not run the abandoned-cart batch at all until #8 ships.

- **Severity:** Medium | **Effort:** S | **Confidence:** Confirmed | **Overlaps:** §9.16 (button wrap, visual only)
- **Location:** `custom-requests/page.tsx:336-367,454-460`; `abandoned-carts/page.tsx:75-94,~120-127`; `inventory/page.tsx:264-299`
- **Problem:** "Run Recovery Reminders", "Run Recovery Batch" and "Process Capacity Alerts" immediately email up to 80, all pending, and 250 customers respectively. An accidental click or a double-click on a slow network sends a batch with no undo. The capacity-alerts category input is free text (comma-separated keys), and a typo silently matches nothing.
- **Fix (implementation steps):**
  1. Add a `dryRun: true` mode to the three routes that returns `{ wouldSend, sample: [email…] }`.
  2. The button opens `ConfirmDialog`: "Send recovery reminders to 12 customers? (a@…, b@…, +10)". On confirm, call without `dryRun`.
  3. Replace the capacity categories text field with a multi-select fed by the categories API.
- **Tests / acceptance criteria:** Route tests: `dryRun` performs no `resend.emails.send` call. Contract test: each of the three buttons opens a dialog rather than calling `fetch` directly.
- **Risks / notes:** None.

<a id="item-47"></a>
### #47 — Creating and publishing a product is a trial-and-error loop: the checklist appears only on Publish, uploads aren't "featured", and Preview 404s for drafts
- **Priority:** P2 · **Rank:** 47/76 · **Lens:** Admin · **Source finding:** UXA-17
- **Severity:** Medium | **Effort:** M | **Confidence:** Confirmed | **Overlaps:** none
- **Location:** `catalog/products/new/page.tsx:94-119`; `builder/page.tsx:337-403,1010-1021,1912-1919`; `catalog/products/page.tsx:102-147,272-298`; `src/app/api/admin/catalog/route.ts:205-222`; `src/lib/supabase/queries/products.ts:339-340`
- **Problem:** Workflow (c) takes this path:
  1. New product → builder.
  2. "Upload file" creates media with `is_featured: false` by default (`builder:371`).
  3. The builder shows no Draft/Published state and has no Publish button.
  4. The owner must go back to the list and click Publish. Only then does the server return "At least one featured media item is required".
  5. Back in the builder: Edit media → tick Featured → Save → back to the list → Publish.

  That's two extra round trips. "Preview Product" opens `/shop/categories/{category_key}/{slug}`, but the storefront only loads `is_active` products, so a draft (the one case where preview matters) returns a 404. It also uses the category *key* where the route expects the *slug* (OCT-23 notes these can differ). Base price may be $0 (`new/page.tsx` defaults it to `'0'`), and that passes the checklist. "Deactivate" removes a live product from the store with no confirmation.
- **Fix (implementation steps):**
  1. Add a status header to the builder: a `Chip` showing Draft, Published or Archived, plus a Publish/Unpublish button using the existing `PATCH /api/admin/catalog` action.
  2. Add `GET /api/admin/catalog/publish-checklist?productId=` exposing `validatePublishChecklist`. Render it as a live checklist (✓/✗ per item) next to Publish, with Publish disabled until it passes. Add "price > 0" as a warning that needs explicit acknowledgement.
  3. When the product has no featured media, mark the first uploaded item featured automatically, and give media rows a "Set as featured" radio.
  4. Preview: build the URL from the category `slug` (load categories with slug) and append a signed `?preview=` token that `getProductBySlug` accepts for admins, or render an in-panel preview.
  5. Confirm "Deactivate": "Remove {title} from the storefront?"
- **Tests / acceptance criteria:** Route test for the checklist endpoint. Unit test: the first upload sets `is_featured` when none exists. Manual: new product → upload one image → Publish succeeds from the builder.
- **Risks / notes:** The preview token must be scoped and short-lived. The security agent should review it.

<a id="item-48"></a>
### #48 — Promotions: the "Pricing" nav item is a placeholder; promos can't be edited and their dates are hidden and stored in UTC; bundle deals need raw JSON whose default applies to every cart
- **Priority:** P2 · **Rank:** 48/76 · **Lens:** Admin · **Source finding:** UXA-18
- **Severity:** Medium | **Effort:** M | **Confidence:** Confirmed for UI and server parse. Likely for the UTC shift (assumes server TZ = UTC, as on Vercel). | **Overlaps:** none
- **Location:** `src/app/admin/(panel)/pricing/page.tsx:8-31`; `src/app/admin/(panel)/layout.tsx:27-31`; `catalog/pricing/page.tsx:61-77,115-155,189-223,401-418,436-447,492-514`; `src/app/api/admin/catalog/promo-codes/route.ts:54-59`; `src/lib/pricing/promotions.ts:153-170,204-210`; `src/app/api/admin/catalog/future-products/route.ts` (GET and POST only)
- **Problem:** Workflow (d), running a promo:
  1. **Navigation.** The "Pricing" nav item → placeholder → "Open Catalog Pricing Controls", which goes to the Catalog *hub* → "Pricing" card → the promo page. That's four clicks through two dead ends.
  2. **Dates.** Promo `datetime-local` values (for example `2026-10-31T23:59`) are parsed with `new Date()` on the *server* (`asIsoOrNull`), so the owner's local time is read as UTC. A US-Central promo ending at 23:59 actually ends at 18:59 local.
  3. **No edit.** The list shows neither the valid-from/to dates nor whether a promo is currently live. There is no edit; only toggle or delete, and delete loses `usage_count`. Values display raw, as "percent 10" and "fixed_amount 10".
  4. **Bundle deals.** These require hand-written `conditions_json` / `rewards_json` with no schema help. The prefilled `{"rules": []}` makes `evaluateConditions` return `true` for *every cart* (`promotions.ts:167`), and deals are created `is_active: true`. A rewards block with empty rules is therefore applied store-wide immediately.
  5. **Future products** (roadmap) are create-only: there is no edit, hide or delete in the UI or the API, and "Status ID" and "Category key" are pasted raw IDs.
- **Fix (implementation steps):**
  1. Remove the `/admin/pricing` module from `ADMIN_MODULES` or redirect it to `/admin/catalog/pricing`, and label that page "Promotions".
  2. Convert dates on the client: `valid_from: promoValidFrom ? new Date(promoValidFrom).toISOString() : null`. On the server, reject date strings without an offset.
  3. Add an Edit form (the PUT already exists), show "Valid {from} – {to} · Live now / Scheduled / Expired" chips, and format values ("10% off", "$10.00 off", "Free shipping").
  4. Replace the JSON fields with a small form for the supported rule and action types (`category_qty` → `order_discount_percent` and the like, from `promotions.ts`). Create new deals with `is_active: false`. Refuse to create an automatic deal with zero rules unless "Applies to every cart" is ticked.
  5. Add PUT and DELETE to future-products, an Edit/Hide UI, and `Select`s fed by the statuses and categories APIs.
- **Tests / acceptance criteria:** Unit test for a pure `bundleFormToJson(form)` and its inverse. Route test: a promo with an offset-less date returns 400. Unit test: `evaluateConditions({rules:[]})` is guarded by the new create-time validation. Manual: create a promo ending tonight 23:59 local; the stored value equals local 23:59.
- **Risks / notes:** None.

<a id="item-49"></a>
### #49 — Feedback is inconsistent and often invisible: page-top Alerts far from the action, stale success banners, no toasts
- **Priority:** P2 · **Rank:** 49/76 · **Lens:** Admin · **Source finding:** UXA-19
> **Coordinator note:** Introduce the shared Snackbar + `useAdminMutation` early. #6, #7, #23 and #28 can adopt it immediately.

- **Severity:** Medium | **Effort:** M | **Confidence:** Confirmed | **Overlaps:** §9.13 (duplicated `role="alert"`)
- **Location:** for example `orders/page.tsx:320-321`, `custom-requests/page.tsx:463-464`, `builder/page.tsx:1007-1008`, `catalog/pricing/page.tsx:381-382`, `catalog/products/page.tsx:167-168`, `AdminShell.tsx:169-185` (mark-read failures ignored)
- **Problem:** Most pages render one `error` / `success` Alert at the top. Actions sit far down long lists (custom requests, orders, builder), so the result of a click is off-screen. Success messages persist until the next action, so "Order cancelled." stays visible while the owner opens a different order. Some mutations don't check the response at all: mark-read and mark-all-read (`AdminShell.tsx:170-184`), and the homepage tile upload. Each page re-implements the same `fetch → json → throw` boilerplate, which is where the bugs in UXA-9 and UXA-15 come from.
- **Fix (implementation steps):**
  1. Add `src/components/admin/AdminFeedbackProvider.tsx`: a context exposing `notify({ severity, message, action? })`, rendered as one MUI `Snackbar` + `Alert` (`role="status"` for success, `alert` for errors) in `AdminShell`.
  2. Add `useAdminMutation` (UXA-9 step 2), built on the provider. It parses `{ error, warnings }`, maps 401 to "Your session expired — sign in again" with a sign-in action (UXA-23), and maps 409 to a Reload action.
  3. Keep inline field-level errors for validation. Remove page-top success Alerts.
- **Tests / acceptance criteria:** Unit test for a pure `parseAdminResponse(status, body)` covering 200 with warnings, 400, 401, 403-CSRF and 409. Contract test: `AdminShell.tsx` renders `AdminFeedbackProvider`. Migrate pages incrementally.
- **Risks / notes:** None.

<a id="item-50"></a>
### #50 — Number inputs: empty means $0, decimals are fragile, and percent tiers show a "$" prefix
- **Priority:** P2 · **Rank:** 50/76 · **Lens:** Admin · **Source finding:** UXA-20
- **Severity:** Medium | **Effort:** S | **Confidence:** Confirmed for empty→0 and the "$" on percent. Needs-verification for decimal typing (type "12." then "5" into the builder base price in Chrome). | **Overlaps:** none
- **Location:** `builder/page.tsx:1769-1779,1644-1652,1816-1826`; `catalog/products/[id]/pricing/page.tsx:144,301-308`; `catalog/products/new/page.tsx:47,100`; `homepage/page.tsx:725-735`; `settings/page.tsx:240`
- **Problem:**
  1. The builder base price and process deltas are parsed to a number on every keystroke (`asNumber(event.target.value)`). Clearing the field shows "0" at once, and partial input such as "12." may be coerced, depending on the browser.
  2. The pricing page, new-product page and homepage send `Number('')`, which is 0. Clearing the base price and clicking Save makes the product **free** without a warning; the server allows `>= 0`.
  3. The bulk-tier "Discount value" always shows a `$` adornment, even when the type is "Percent off", so "10" reads as $10.
  4. "Products shown" accepts 0 and negatives client-side.
- **Fix (implementation steps):**
  1. Add `src/components/admin/MoneyField.tsx`. It keeps the string in state, validates `^\d+(\.\d{0,2})?$`, shows `helperText` errors, and exposes `valueCents | null`. The parent blocks Save while it is invalid. Use it for base price, deltas and quote amounts.
  2. Block a $0 base price unless an "Item is free" checkbox is ticked.
  3. Switch the adornment by type: `%` for percent, `$` otherwise.
- **Tests / acceptance criteria:** Unit tests for a pure `parseMoneyInput('12.')` → `{ ok: false }`, `('12.50')` → `1250`, and `('')` → `null`. Contract test: no `onChange={(e) => updateProduct('base_price', asNumber(`.
- **Risks / notes:** None.

<a id="item-51"></a>
### #51 — The dashboard doesn't show what needs doing today
- **Priority:** P2 · **Rank:** 51/76 · **Lens:** Admin · **Source finding:** UXA-21
- **Severity:** Medium | **Effort:** M | **Confidence:** Confirmed | **Overlaps:** §9 "Ideas" (link the four tiles). This finding adds the missing queues.
- **Location:** `src/app/admin/(panel)/page.tsx:8-36,94-149`
- **Problem:** Four counts are shown: Awaiting Quote, Quote Sent, "Orders Paid" (actually *paid, not yet started*) and Awaiting Payment. None is a link. Missing:
  - production queue (`in_production`) and orders to ship (`ready_to_ship`);
  - paid custom requests not yet handed off (`status='paid' and production_handoff_at is null`);
  - quotes expiring within 24 hours;
  - low or out-of-stock items, today's schedule blocks and conflicts, failed design exports.

  Below the tiles, a 10-card grid repeats the sidebar (and leaves out Shipping), taking up the space where a work queue should be. The subtitle "Protected operations shell…" is developer copy.
- **Fix (implementation steps):**
  1. Replace `MODULE_CARDS` with "Today" queues. Each is a card with a count plus the top 5 rows, linking to a filtered list via URL params (UXA-15).
  2. Rename the tiles ("Paid — not started", …) and make them `Link`s.
  3. Add an "Attention" strip for expiring quotes, low stock and failed exports.
- **Tests / acceptance criteria:** Unit test for a pure `buildDashboardQueues(rows)` helper. Contract test: tiles are links with `?status=` params.
- **Risks / notes:** Check query cost. Use `head: true` counts plus a limit-5 select.

<a id="item-52"></a>
### #52 — The product designer is unreachable on the storefront, and isn't touch/keyboard ready
- **Priority:** P2 · **Rank:** 52/76 · **Lens:** Storefront · **Source finding:** UXS-11
> **Coordinator note:** Note #7: every price save on the admin pricing page currently switches `has_designer` off, so fix #7 before wiring this.

- **Severity:** High | **Effort:** L | **Confidence:** Confirmed | **Overlaps:** §4.1–§4.3
- **Location:** `src/lib/supabase/queries/products.ts:330-338, 451-486`; `ProductConfigurator.tsx:21-22, 434-444`; `ProductDesigner.tsx:117-158, 225-231, 303-375`; admin builder; migration `035`
- **Problem:**
  - Admin can enable `has_designer` and set a mockup URL, but `getProductBySlug` never selects `has_designer`, `designer_mockup_url` or `is_square_enabled`. "Customize Design" therefore never renders.
  - Konva is still statically imported into every product page.
  - Once wired, the designer has these issues:
    - the stage is a fixed 500 px inside a dialog that is ~310 px wide at 390 px;
    - there is no keyboard alternative;
    - "Add Image" has no uploading state;
    - the close button has no `aria-label`;
    - the title nests h2 > h6;
    - the design lives only in component state;
    - text defaults to black.
- **Fix (implementation steps):**
  1. Don't wire the columns until steps 2–6 are done. Then add them to the select and to the returned object.
  2. Load the designer with `next/dynamic` (`ssr:false`) and render it only while open.
  3. Scale the stage with a ResizeObserver, and use `fullScreen` on xs.
  4. Keyboard and screen-reader access: add a layer list, numeric X/Y/size/rotation fields, arrow-key nudging, a live region, and `role="application"` with a label.
  5. Add an upload state and the shared validation (UXS-8).
  6. Label the close button, fix the title, confirm before discarding, and save the design to sessionStorage.
  7. Show a design thumbnail and an "Edit design" link on the product page.
- **Tests / acceptance criteria:**
  - Contract tests: the select includes the designer fields; the designer is loaded through dynamic import; Stage has no fixed `width={500}`.
  - Chunk grep: Konva appears only in a lazy chunk.
  - Manual: a pass at 390 px and a keyboard-only pass.
- **Risks / notes:** Design upload tokens expire (§4.2). Decide `is_square_enabled` together with UXS-1. Note UXA-1: the admin pricing page currently switches `has_designer` off on every price save.

<a id="item-53"></a>
### #53 — Quantity only moves ±1, and the cart doesn't re-apply bulk tiers
- **Priority:** P2 · **Rank:** 53/76 · **Lens:** Storefront · **Source finding:** UXS-10
> **Coordinator note:** The cart re-tiering half (correct totals) is in #5. This item is the stepper and tier-chip UX.

- **Severity:** Medium | **Effort:** M | **Confidence:** Confirmed | **Overlaps:** none
- **Location:** `ProductConfigurator.tsx:251-257, 328-335, 369-380`; `CartProvider.tsx:144-176, 229-278`; `CartPageView.tsx:97-112`; `CheckoutPageView.tsx:248-275`
- **Problem:**
  - Volume tiers are advertised, but reaching 50 takes 49 taps.
  - The cart never re-evaluates tiers: `updateQuantity` and merges scale the per-unit amounts captured at add time. The server does re-tier, so the cart total differs from what Square charges.
  - Drawer quantity buttons are 24 px. Checkout's buttons are named only "−"/"+".
- **Fix (implementation steps):**
  1. Add a shared `QuantityStepper` with a numeric input (`inputMode="numeric"`, `aria-label`) and 44 px targets on xs. Use it everywhere.
  2. Make tier chips clickable, and add an "add N more to save" hint.
  3. Store the pricing inputs on each cart item and reprice through the shared engine (UXS-4/SD-9), or through a debounced `/api/cart/quote`.
  4. Give the checkout buttons item-specific labels.
- **Tests / acceptance criteria:**
  - Unit tests for `repriceCartLine`.
  - Contract test: no `lineTotal / item.quantity` in `CartProvider`.
  - Manual: the drawer total matches the Square total.
- **Risks / notes:** Clamp quantity to available inventory (UXS-13 / SD-7).

<a id="item-54"></a>
### #54 — Custom-order form: hidden validation, errors out of view, native confirm on load
- **Priority:** P2 · **Rank:** 54/76 · **Lens:** Storefront · **Source finding:** UXS-12
- **Severity:** Medium | **Effort:** M | **Confidence:** Confirmed | **Overlaps:** none
- **Location:** `CustomOrderIntakeForm.tsx:82-112, 197-204, 302-361, 376-389, 398-485, 518-551, 557`; `custom-orders/page.tsx:54-110`
- **Problem:**
  - Submit stays disabled until hidden thresholds are met: name longer than 1 character, description longer than 10, and three checkboxes. Fields never show errors.
  - Server errors appear at the top of the form, with no `role="alert"` and no focus.
  - A blocking `window.confirm` fires on load when a draft exists.
  - The terms checkbox has no link.
  - There is no `autoComplete`, and the deadline accepts past dates with no lead-time hint.
  - The success state isn't focused and shows the raw `awaiting_quote` status. Unlike the email, it doesn't mention "check your email" or "1–2 business days".
  - "What happens next" sits below the form on mobile.
- **Fix (implementation steps):**
  1. Keep Submit enabled. On submit, run `validateIntake()`, show errors per field, focus the first one, and add an error-summary `Alert`.
  2. Add a character counter to the description.
  3. Replace `confirm` with a non-blocking `Alert` offering Restore/Discard, noting that files aren't saved in drafts.
  4. Link Terms and Returns in the checkbox label.
  5. Add `autoComplete`, plus `min` on the deadline with turnaround help text.
  6. Focus and scroll to the success panel. Add the email and turnaround copy, a short ID, and the mapped status.
  7. Show a compact "What happens next" above the form on mobile.
- **Tests / acceptance criteria:**
  - `validate-intake.test.ts`.
  - Contract test: no `window.confirm`; the terms link is present; `autoComplete` is present; Submit is not disabled on `!canSubmit`.
- **Risks / notes:** Wire the `customRequestAbandoned` analytics event (UXS-19).

<a id="item-55"></a>
### #55 — Sold out is a dead end
- **Priority:** P2 · **Rank:** 55/76 · **Lens:** Storefront · **Source finding:** UXS-13
> **Coordinator note:** The server half (stock check, reservation, 409) is #12. This item is the storefront UX.

- **Severity:** Medium | **Effort:** M | **Confidence:** Confirmed | **Overlaps:** §2.1 (backend only); server half is SD-7
- **Location:**
  - `ProductConfigurator.tsx:157-161, 356-367, 447-451`
  - `/api/back-in-stock/subscribe` and `/api/capacity-alerts/subscribe` (only `admin/inventory` references them)
  - listing cards
  - `CartProvider.tsx:419-422`
  - checkout route (no inventory check)
- **Problem:**
  - Sold-out items show a disabled "Out of Stock" button with no notify-me form, although a back-in-stock API exists.
  - Customers see admin wording: "(manual override)" and "(not tracked)".
  - Listing cards don't show stock.
  - The cart allows up to 999 units.
- **Fix (implementation steps):**
  1. Add `customer-label.ts` mapping states to "Sold out", "Only N left" and "In stock".
  2. Add a `BackInStockForm` that posts to `/api/back-in-stock/subscribe`, plus a "request a custom version" link.
  3. Carry the maximum quantity into the cart.
  4. Add stock badges to listing cards (needs an inventory join in the listing queries).
  5. Make the route return 409 with a quantity hint when stock is short (SD-7).
- **Tests / acceptance criteria:**
  - Label unit tests: no "override" or "tracked" in the output.
  - Contract test: the subscribe call exists.
  - Route test for the 409.

<a id="item-56"></a>
### #56 — No branded not-found/error/loading pages; a Supabase error looks like a 404
- **Priority:** P2 · **Rank:** 56/76 · **Lens:** Storefront · **Source finding:** UXS-14
> **Coordinator note:** Also add `src/app/admin/(panel)/error.tsx` (REL-15) and branded `global-error.tsx`.

- **Severity:** Medium | **Effort:** M | **Confidence:** Confirmed | **Overlaps:** none
- **Location:**
  - no `not-found.tsx`, `error.tsx`, `global-error.tsx` or `loading.tsx` outside admin
  - `products.ts:344-348`
  - product page lines 30-35 and 60
  - 38 internal `component="a"` links in the storefront
- **Problem:**
  - A bad slug shows Next's default, unbranded 404, and any thrown error shows the default error screen.
  - Any database error returns null from the product query, so the page renders a 404 titled "Product Not Found".
  - Catalog pages are force-dynamic with no loading boundary, so taps give no feedback.
  - Plain `<a>` links cause full page reloads.
- **Fix (implementation steps):**
  1. Add a branded `not-found.tsx` with navigation and search.
  2. Add `error.tsx` and `global-error.tsx`, each with a "Try again" action.
  3. Add skeleton `loading.tsx` files for the shop and product pages.
  4. Treat PGRST116 as "not found" and throw on every other error.
  5. Switch internal links to `next/link`.
- **Tests / acceptance criteria:**
  - Contract tests: the files exist, and there is no internal `component="a"` (with an allow-list).
  - Unit test: a non-PGRST116 error throws.
  - Manual: a bad slug shows the branded 404.

<a id="item-57"></a>
### #57 — No search on phones; the search dialog is unlabeled and dead-ends
- **Priority:** P2 · **Rank:** 57/76 · **Lens:** Storefront · **Source finding:** UXS-15
- **Severity:** Medium | **Effort:** S–M | **Confidence:** Confirmed | **Overlaps:** none
- **Location:** `Header.tsx:201-212` (search hidden on xs), `:260-358` (drawer has no search); `SearchModal.tsx:44-65, 85-107`
- **Problem:**
  - There is no search under 600 px.
  - The dialog has no title and the input has no label.
  - "No results" offers nothing, and Enter does nothing.
  - Results aren't announced.
  - Overlapping requests race each other.
  - Search analytics are never recorded.
- **Fix (implementation steps):**
  1. Show the search icon at all widths and add search to the drawer.
  2. Dialog markup:
     - `aria-labelledby` on the dialog;
     - `aria-label` and `type="search"` on the input;
     - `fullScreen` on xs;
     - a close button.
  3. Add a live status ("Searching…", "N results").
  4. On no results, link to `/shop/all?search=q`, offer "Request it custom", and show category chips.
  5. Make Enter go to `/shop/all?search=`.
  6. Cancel stale requests with an `AbortController`, and record analytics without PII.
- **Tests / acceptance criteria:** Contract tests on `Header` and `SearchModal`; a manual check at 390 px.

<a id="item-58"></a>
### #58 — Cart clarity and safety
- **Priority:** P2 · **Rank:** 58/76 · **Lens:** Storefront · **Source finding:** UXS-16
- **Severity:** Medium | **Effort:** M | **Confidence:** Confirmed | **Overlaps:** §8.4 (empty cart only)
- **Location:** `CartPageView.tsx:80-147`; `CartProvider.tsx:144-176, 308-475`; `CheckoutPageView.tsx:224-233`; `products.ts:472` (`featured_media: null`, so the cart has no images)
- **Problem:**
  - `/cart` doesn't show the chosen options, the engraving text or the design. Processes appear as raw keys, and there is no Edit link.
  - The delete button is icon-only with no accessible name.
  - "Clear Cart" has no confirm or undo, and it comes first on mobile.
  - Touch targets are 22–24 px, and there are no thumbnails.
- **Fix (implementation steps):**
  1. Build a shared `CartLine` component:
     - a thumbnail from `product.media`;
     - a linked title;
     - options as "Label: value";
     - process display names;
     - "design attached" when there is one;
     - the quantity stepper;
     - a named remove button of at least 40 px.
  2. Add an Edit link to the product page, ideally prefilled via `?config=`.
  3. Make Clear Cart a text button placed last, with a confirm or an Undo snackbar.
  4. Give the drawer `aria-labelledby` and a "Shipping & taxes at checkout" line.
- **Tests / acceptance criteria:**
  - Contract tests: no unnamed icon buttons; options are rendered; source order is correct.
  - Harness capture with a seeded cart.

<a id="item-59"></a>
### #59 — No contact channel or link recovery
- **Priority:** P2 · **Rank:** 59/76 · **Lens:** Storefront · **Source finding:** UXS-17
> **Coordinator note:** The noindex list overlaps #63. Implement it once.

- **Severity:** Medium | **Effort:** S–M | **Confidence:** Confirmed | **Overlaps:** none
- **Location:** `Footer.tsx:24-43, 95-190`; `Header.tsx:28-35`; `orders/[id]/page.tsx:119-131`; `custom-orders/[id]/page.tsx:142-154`; `storefront-settings.ts:46`
- **Problem:**
  - The site chrome has no email address or contact link.
  - "Contact Support" on the tracking page goes to the commission intake form, which demands legal checkboxes.
  - There is no way to resend a lost link.
  - Token pages are indexable.
- **Fix (implementation steps):**
  1. Add a Contact link in the footer and header: a `mailto` from settings or a `/contact` page (placement for the owner to approve).
  2. Add a `mailto` link and a "Resend my link" form, backed by a new rate-limited, non-enumerating `POST /api/orders/resend-link`.
  3. Add noindex to `orders/[id]`, `custom-orders/[id]`, `checkout/success`, `checkout/cancel`, `cart` and `checkout`.
- **Tests / acceptance criteria:** Contract tests, plus a route test that a match and a mismatch return the same body.

<a id="item-60"></a>
### #60 — Funnel analytics are defined but never fired
- **Priority:** P2 · **Rank:** 60/76 · **Lens:** Storefront · **Source finding:** UXS-19
> **Coordinator note:** Wire events only after #40 settles the consent model.

- **Severity:** Medium | **Effort:** S | **Confidence:** Confirmed | **Overlaps:** §3.11 (partial)
- **Location:** `src/lib/analytics/events.ts`. These events have zero call sites: `productViewed`, `optionSelected`, `fileUploaded`, `addedToCart`, `cartViewed`, `checkoutStarted`, `checkoutCompleted`, `checkoutAbandoned`, `searchQuery`, `searchResultClicked`, `searchZeroResults`, `customRequestAbandoned`, `futureProductNotifySubmitted`, `waitlistSignupAttempted`, `howItWorksAnchorClicked`.
- **Fix (implementation steps, after UXS-18):**
  - Fire events at these points:
    - product view: a tracker on the product page;
    - add to cart;
    - cart viewed: on the page and on the drawer;
    - checkout started;
    - checkout abandoned: send the error code only;
    - checkout completed: on the success page once an order is found;
    - the three search events;
    - intake abandonment: on `pagehide`;
    - notify submitted.
  - Send no PII: no emails, names or engraving text.
- **Tests / acceptance criteria:** A contract test that every `Analytics` key has a call site, with an allow-list.

<a id="item-61"></a>
### #61 — Shipping, tax and lead time aren't disclosed before checkout
- **Priority:** P2 · **Rank:** 61/76 · **Lens:** Storefront · **Source finding:** UXS-20
- **Severity:** Medium | **Effort:** S | **Confidence:** Confirmed (Square tax behaviour needs a sandbox check) | **Overlaps:** §2.14
- **Location:** product page `168-186, 257-298`; `CartProvider.tsx:451-454`; `CartPageView.tsx:127-134`; `CheckoutPageView.tsx:98-111`; `square/client.ts:56-63` (no tax lines sent)
- **Problem:**
  - The drawer, cart and checkout show "Total" before shipping is known.
  - The product page has no shipping info.
  - Nothing combines production time and transit time into one estimate.
- **Fix (implementation steps):**
  1. Label the amount "Subtotal" and add "Shipping & any taxes calculated at checkout".
  2. Always show a Shipping row with an arrival estimate.
  3. Add a Shipping line on the product page linking to `/resources/shipping`.
  4. Verify tax behaviour in the Square sandbox and state it on the page.
- **Tests / acceptance criteria:** Contract tests and a harness capture.

<a id="item-62"></a>
### #62 — Performance: every route is dynamic with no data caching, images load at full size, product pages query twice, and checkout makes sequential per-line round trips
- **Priority:** P2 · **Rank:** 62/76 · **Lens:** Performance
- **Severity:** Medium | **Effort:** M | **Confidence:** Confirmed; LCP numbers need a browser | **Sources:** UXS-21, REL-17, SD-15 (image config → #69) | **Existing plan overlap:** SEPT §2.11
- **Location:** `src/app/layout.tsx:74-82`; `src/app/page.tsx:42,53-65`; `src/lib/supabase/queries/products.ts:220-281,327-410`; product page `src/app/shop/categories/[slug]/[productSlug]/page.tsx:30-33,55-70`; `src/app/api/square/checkout/route.ts:159-274`; `src/lib/shippo/weight.ts:42-77`; `src/app/api/admin/orders/route.ts:201-234`; `src/components/auth/AuthProvider.tsx`; 13 raw `<img>` tags in shop/category/ready-made pages, `ProductMediaGallery`, `GalleryExplorer`
- **Problem:**
  - The nonce-based CSP makes every route dynamic, with no data cache on top. The homepage runs ~11 queries per view, including the full catalog with descriptions and media.
  - `getProductBySlug` runs twice per product page (metadata and page) without `cache()`.
  - The product page fetches the whole category's products just to read the category name, and fetches recommendations only after everything else.
  - Images are raw `<img>`: original size, eager, no srcset.
  - `AuthProvider` (supabase-js) wraps every storefront page, although sign-in is admin-only.
  - Checkout makes 5–6 sequential round trips per cart line.
  - Admin order search filters the newest 120 rows in memory.
- **Fix (implementation steps):**
  1. Wrap storefront reads in `unstable_cache` (or `'use cache'` + `cacheTag`) keyed by slug and tagged `catalog`/`homepage`. Call `revalidateTag` from the admin write routes (catalog, homepage, inventory).
  2. Wrap `getProductBySlug` in React `cache()`. Drop the `getProductsByCategory` call from the product page (`getProductBySlug` already returns category fields). Stream recommendations in `<Suspense>`.
  3. Drop `description` from grid queries and add limits.
  4. Use `next/image` with `fill`/`sizes`, and `priority` only on the main product image. The CSP `img-src` must allow `/_next/image`, and the remote pattern must be narrowed first (#69).
  5. Move `AuthProvider` from the root layout into the `sign-in` and admin layouts.
  6. Checkout: batch product, variant, option and inventory lookups with `.in()` (one query per table, not per line).
  7. Admin orders search: move it into SQL (`ilike` on `customer_email`/`id::text` via a computed column or RPC) with `.range()` pagination (see #45 / UXA-15).
- **Tests / acceptance criteria:**
  - Contract tests: no `<img` in `src/app/shop/**`; `getProductBySlug` is wrapped in `cache(`; no `AuthProvider` in `src/app/layout.tsx`; admin catalog writes call `revalidateTag`.
  - Route test: a 5-line cart makes ≤ 6 `from()` calls.
  - Lighthouse before and after on the home and product pages (UI_AUDIT harness).

<a id="item-63"></a>
### #63 — SEO and sharing
- **Priority:** P2 · **Rank:** 63/76 · **Lens:** Storefront · **Source finding:** UXS-22
> **Coordinator note:** **Partly resolved on `dev` @ `963e97f` (Batch 10).** Already shipped: `src/app/sitemap.ts`; `src/app/robots.ts`, which disallows `/admin`, `/api`, `/auth`, `/sign-in`, `/cart`, `/checkout`, `/orders` and `/custom-orders/`; and `Product` + `BreadcrumbList` JSON-LD via `src/lib/seo/structured-data.ts`. **Skip steps 1, 2 and 4.** Remaining work: step 3 (canonical URL, product OG image, `permanentRedirect` from non-canonical category paths) and step 5 (`/shop` metadata, the Stripe wording in the checkout description, and a `noindex` meta on private pages; `robots.txt` stops crawling but not indexing of URLs linked from elsewhere). The noindex part overlaps #59.

- **Severity:** Medium | **Effort:** M | **Confidence:** Confirmed | **Overlaps:** §2.10, §7.10
- **Location:** no `sitemap.ts` or `robots.ts`; product page metadata `30-47`; `shop/page.tsx` (no metadata); `checkout/page.tsx:15` ("Stripe"); private pages have no noindex
- **Problem:**
  - There is no canonical URL: a product page resolves by product slug under any category path.
  - Open Graph has no product image.
  - There is no Product/Offer JSON-LD and no sitemap.
- **Fix (implementation steps):**
  1. Add `sitemap.ts` built from the canonical category slugs.
  2. Add `robots.ts` disallowing admin, api, checkout, cart, orders, the custom-orders status pages and sign-in.
  3. Add a canonical URL and an OG image, and `permanentRedirect` from non-canonical paths.
  4. Add nonced Product/Offer JSON-LD.
  5. Add `/shop` metadata, noindex on the private pages, and Square wording in the checkout description.
- **Tests / acceptance criteria:** `sitemap.test.ts`, contract tests, and a Rich Results test.
- **Risks / notes:** The JSON-LD script tag needs the CSP nonce.

<a id="item-64"></a>
### #64 — The homepage upload stores unsanitized SVG, the sanitizer fails open past depth 100, and the public media bucket is listable
- **Priority:** P2 · **Rank:** 64/76 · **Lens:** Security
- **Severity:** Low (admin-only uploads; scripts would run on the Supabase storage origin, not the shop's) | **Effort:** S | **Confidence:** Confirmed (SD-12 ran the real sanitizer: a 102-deep `<g>` nesting kept `onmouseover` and a `data:text/html` link) | **Sources:** SD-12 | **Existing plan overlap:** SEC-009, OCT-12
- **Location:** `src/app/api/admin/homepage/upload/route.ts:12-20,93-97`; `src/lib/security/svg-sanitizer.ts:249-265,287-290,397-405,475`; `supabase/migrations/029_product_media_storage.sql:20-34`
- **Problem:**
  1. The homepage upload route accepts SVG and uploads it **unsanitized** to the public `product-media` bucket. The catalog route does sanitize.
  2. The sanitizer stops recursing at depth 100 and leaves deeper nodes untouched. Its final regex only catches `<script`, `onerror`, `onload=` and `javascript:`.
  3. `style` attributes with `url(…)` and protocol-relative `//` URLs pass (external fetches, not script).
  4. The "Public read product media assets" select policy lets anyone **list** the bucket, including media for unpublished products.
- **Fix (implementation steps):**
  1. Homepage route: remove SVG from the allowlists, or call `sanitizeSvg` exactly as `catalog/media/upload` does.
  2. Sanitizer:
     - **Fail closed** past max depth: return the empty-SVG result or drop the subtree.
     - Widen the final assertion to `/<script|\son[a-z]+\s*=|javascript:|data:text\/html|<foreignobject/i`.
     - Drop `style` attributes containing `url(` or `expression`.
     - Reject `href`/`xlink:href` values starting with `//`.
  3. Migration: drop the listing (`select`) policy on `storage.objects` for `product-media`. Public object URLs keep working without it.
  4. Bump `@xmldom/xmldom` (#9).
- **Tests / acceptance criteria:**
  - `svg-sanitizer.test.ts`: depth-102 payload → no `onmouseover` in the output; no `url(` in style output; no `//` href.
  - Contract test: the homepage route either excludes `image/svg+xml` or calls `sanitizeSvg`.
  - Live: `select policyname from pg_policies where schemaname='storage'` no longer shows the listing policy.

<a id="item-65"></a>
### #65 — `test-rls-lockdown.mjs` passes while covering no live PII or money table
- **Priority:** P2 · **Rank:** 65/76 · **Lens:** Security
- **Severity:** Low (but it's the guard for #3) | **Effort:** M | **Confidence:** Confirmed | **Sources:** SD-13, SA-4 (authenticated probe) | **Existing plan overlap:** SEPT §3.12
- **Location:** `scripts/test-rls-lockdown.mjs:11-25,97-103,172-182`
- **Problem:**
  - Six of its seven "customer" tables were dropped (042) and are skipped, and strict mode is off, so the script passes. Only `exp_newsletter_subscribers` is really tested.
  - Never tested:
    - orders, order items, custom requests, cart captures, alerts, promos, artwork uploads;
    - admin users, the audit log, webhook events;
    - views, functions, the `authenticated` role, storage.
  - It counts only error 42501 as a pass, so a table that correctly answers "200, empty" would be reported as a failure, and the script can't simply be extended.
- **Fix (implementation steps):**
  1. `PROTECTED_TABLES` list: pass on 42501, **or** 200 with zero rows *after* confirming via service role that the table has rows.
  2. `REMOVED_TABLES`: pass only on PGRST205 or 42P01.
  3. Probes:
     - the #3 RPCs as anon → 42501/PGRST202;
     - `exp_commission_queue` (should be gone);
     - listing the `customer-artwork`, `design-artifacts` and `product-media` buckets.
  4. Authenticated probe:
     1. Create a throwaway user with the service role (`email_confirm: true`) and sign in with a password.
     2. Run the same probes.
     3. Delete the user in `finally`.
  5. Make strict mode the default.
  6. Add `supabase/verification/security_posture.sql` with #1 checks 2, 3 and 8.
- **Tests / acceptance criteria:** Against today's live project the script **fails** on the #3 probes, and passes after #3's migration.


---

## 8. P3 — Polish

<a id="item-66"></a>
### #66 — `sanitizeAuthNextPath('/.//evil.com')` returns `//evil.com` (latent open redirect)
- **Priority:** P3 · **Rank:** 66/76 · **Lens:** Security
- **Severity:** Low | **Effort:** S | **Confidence:** Confirmed for the function (SA-8 executed the real module); no reachable end-to-end exploit found, because both flows sanitise twice and the code exchange needs the victim's PKCE verifier | **Sources:** SA-8 | **Existing plan overlap:** none
- **Location:** `src/lib/auth/redirect.ts:43-57`; `src/app/auth/callback/route.ts:60-62`
- **Problem:** Checks run on the raw string, then URL parsing removes dot segments. `/.//evil.com`, `/..//evil.com`, `/%2e%2e//evil.com` and `/admin/..//evil.com` all yield `//evil.com`, and `new URL('//evil.com', origin)` resolves to `https://evil.com/`. The comment "cannot leave the site" is false. `sanitizeAdminNextPath` is safe only because of its `/admin` prefix check.
- **Fix (implementation steps):**
  1. After building `out`, return the fallback when `out.startsWith('//') || out.startsWith('/\\')`.
  2. In the callback, assert `destination.origin === origin` before redirecting; otherwise redirect to `/`.
  3. Fix the comment.
- **Tests / acceptance criteria:** The four inputs above return `'/'`. `buildAuthCallbackUrl(site, '/.//evil.com')` has no `next`. Pin `sanitizeAdminNextPath('/admin/..//evil.com') === '/admin'`.

<a id="item-67"></a>
### #67 — Panel page authorization lives only in the `(panel)` layout, which partial (client-side) navigation skips
- **Priority:** P3 · **Rank:** 67/76 · **Lens:** Security
- **Severity:** Low (today it exposes only 4 dashboard counts) | **Effort:** S | **Confidence:** Likely (documented App Router behaviour; not executed) | **Sources:** SA-9 | **Existing plan overlap:** SEPT §10.17
- **Location:** `src/app/admin/(panel)/layout.tsx:79`; `src/app/admin/(panel)/page.tsx:8-36,91-92`; `SEPT_IMPLEMENTATION_PLAN.md:1529-1531` (break-glass runbook)
- **Problem:**
  - On client navigation, the RSC request renders only the changed segment, so the layout's `requireAdminPageSessionOrRedirect` (the allow-list re-check) doesn't run. The edge gate checks only the JWT claim.
  - A user with a stale `role=admin` claim but a revoked allow-list row can fetch the dashboard RSC payload, which is read with the service role.
  - After `admin:revoke`, the window is the access-token lifetime. After the SQL break-glass in the runbook (`update exp_admin_users set is_active=false`), it is unbounded, because the claim stays and keeps refreshing.
- **Fix (implementation steps):**
  1. Call `await requireAdminPageSessionOrRedirect('/admin')` as the first line of every **server** page under `(panel)` that reads data, starting with `AdminDashboardPage`.
  2. Update the break-glass runbook to also clear the claim (`npm run admin:revoke`) and `delete from auth.sessions where user_id = '<id>'` with the service role.
- **Tests / acceptance criteria:** New `admin-page-gate.contract.test.ts`: every non-`'use client'` `page.tsx`/`layout.tsx` under `src/app/admin/(panel)` that references `getSupabaseAdmin` or `createServerSupabaseClient` calls `requireAdminPageSessionOrRedirect(`.

<a id="item-68"></a>
### #68 — `/auth/auth-error` displays attacker-supplied text on the real domain (phishing aid)
- **Priority:** P3 · **Rank:** 68/76 · **Lens:** Security
- **Severity:** Low | **Effort:** S | **Confidence:** Confirmed | **Sources:** SA-10 | **Existing plan overlap:** none
- **Location:** `src/app/auth/auth-error/page.tsx:27-31,54-56`; `src/app/auth/callback/route.ts:36-43,56-58`
- **Problem:** `?reason=` (≤ 300 chars) is rendered verbatim under "We could not sign you in". React escapes it, so there is no XSS. But `…/auth/auth-error?reason=Your order payment failed. Call +1-… to re-enter your card` is a credible lure on the real origin. The callback also forwards raw provider/GoTrue error text.
- **Fix (implementation steps):**
  1. In the callback, map failures to an enum (`cancelled | link_incomplete | exchange_failed | provider_error`). Redirect with `?code=` and log the raw error via `safeLogError`.
  2. The page renders fixed copy per code, with a generic fallback, and stops reading `reason`.
- **Tests / acceptance criteria:**
  - The callback with `?error_description=Call%20us` redirects with `code=provider_error`, and the Location doesn't contain "Call".
  - Contract test: the page doesn't reference `reason`.

<a id="item-69"></a>
### #69 — Security header, cookie and image-proxy drift: Stripe in Permissions-Policy, wide CSP origins, `vercel.live` in prod, cookies without `Secure`, `*.supabase.co` image proxy
- **Priority:** P3 · **Rank:** 69/76 · **Lens:** Security
- **Severity:** Low | **Effort:** S | **Confidence:** Confirmed | **Sources:** SA-12, SD-15 | **Existing plan overlap:** none
- **Location:** `next.config.ts:12-15,27-30`; `src/lib/security/csp.ts:49-66,80-101,116`; `src/lib/supabase/server.ts:22-40`; `src/lib/supabase/update-session.ts:31-57`; `src/lib/supabase/browser.ts:21-24`; `src/proxy.ts:49-57`; `src/lib/security/env.ts:16-28`
- **Problem:**
  - (a) Permissions-Policy is `payment=(self "https://js.stripe.com")`, but Stripe is gone and Square is a hosted redirect.
  - (b) `connect-src` includes server-only origins (`api.resend.com`, `secure.shippingapis.com`) and any `*.supabase.co`, so injected script could exfiltrate to an attacker's project.
  - (c) `vercel.live` is allowed in prod `script-src`/`frame-src`.
  - (d) There is no `frame-ancestors 'none'`; XFO DENY covers it today.
  - (e) Supabase auth cookies use the `@supabase/ssr` defaults: no `Secure`, 400-day `maxAge`. `httpOnly` can't be set because `AuthProvider` reads them, but `Secure` can.
  - (f) `isProd()` is false on previews, so `rrs_csrf`/`rrs_csp_nonce` lack `Secure` there.
  - (g) `images.remotePatterns` allows **any** `*.supabase.co` project. `/_next/image?url=https://<any-project>.supabase.co/storage/v1/object/public/…` resizes third-party images under the shop's domain and spends Vercel image quota.
- **Fix (implementation steps):**
  1. `payment=()`.
  2. `csp.ts`:
     - derive `https://<ref>.supabase.co wss://<ref>.supabase.co` from `NEXT_PUBLIC_SUPABASE_URL`;
     - drop the Resend and USPS origins;
     - include `vercel.live` only when `VERCEL_ENV==='preview'`;
     - add `frame-ancestors 'none'`.
  3. Add `isHttpsDeployment() = isProd() || process.env.VERCEL === '1'` and use it for cookie `secure` (`proxy.ts:54`, `csp.ts:116`).
  4. Pass `cookieOptions: { secure: isHttpsDeployment(), sameSite: 'lax', path: '/' }` in `server.ts` and `update-session.ts`. In `browser.ts`, use `location.protocol === 'https:'`.
  5. `next.config.ts`: set the remote pattern hostname to `new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname`, or `images: { unoptimized: true }` until #62 adopts `next/image`.
- **Tests / acceptance criteria:**
  - `csp.test.ts`: the prod policy excludes `vercel.live`, `api.resend.com`, `shippingapis` and the `*.supabase.co` wildcard, and includes `frame-ancestors 'none'`; with `VERCEL_ENV=preview` it includes `vercel.live`.
  - `next.config` contract: `payment=()`, no "stripe", no `'*.supabase.co'`.
  - Cookie options test: `secure` when `VERCEL=1`.
- **Risks / notes:** Verify realtime still connects against the pinned origin. Only the dead `CommissionQueueTracker` used realtime, and #3 deletes it.

<a id="item-70"></a>
### #70 — `/shop/all` applies invisible filters and has no empty state
- **Priority:** P3 · **Rank:** 70/76 · **Lens:** Storefront · **Source finding:** UXS-23
- **Severity:** Low | **Effort:** S–M | **Confidence:** Confirmed | **Overlaps:** §7.9 (homepage side)
- **Location:** `shop/all/page.tsx:25-59, 97-147`; `HomepageProductGrid.tsx:81-90`; `filters.ts`
- **Problem:**
  - Homepage "View All" carries category, price, ready-made, customizable and search params. The page applies them, but there are no chips and no way to clear them; only `process` gets a banner.
  - Zero results show an empty grid with no message.
  - There is no sort anywhere.
- **Fix (implementation steps):**
  1. Show removable chips for each active filter, plus "Clear all".
  2. Add an empty state with a custom-order CTA.
  3. Optional: a GET form for filters and sort.
- **Tests / acceptance criteria:** Unit tests for `describeActiveFilters`; a contract test for the empty state.

<a id="item-71"></a>
### #71 — Toggle groups don't expose their selected state
- **Priority:** P3 · **Rank:** 71/76 · **Lens:** Storefront · **Source finding:** UXS-24
- **Severity:** Low | **Effort:** S | **Confidence:** Confirmed | **Overlaps:** none
- **Location:** `GalleryExplorer.tsx:233-257, 119`; `MaterialPreview.tsx:73-99`; `ProductMediaGallery.tsx:104-124`
- **Problem:**
  - Selection is shown by colour only, with no `aria-pressed` or `aria-current`.
  - The gallery count isn't announced.
  - The gallery pills are about 19 px tall.
- **Fix (implementation steps):**
  - Add `aria-pressed`, with `role="group"` and a label on the group.
  - Add `aria-current` on thumbnails.
  - Add `role="status"` on the count.
  - Enlarge the pills.
- **Tests / acceptance criteria:** A regex contract test per file.

<a id="item-72"></a>
### #72 — Schedule blocks are linked by pasting UUIDs, and order "production hooks" are a second, disconnected schedule
- **Priority:** P3 · **Rank:** 72/76 · **Lens:** Admin · **Source finding:** UXA-22
- **Severity:** Low | **Effort:** M | **Confidence:** Confirmed | **Overlaps:** OCT-20 (`schedule/page.tsx:604` unnamed Select)
- **Location:** `schedule/page.tsx:588-603`; `orders/page.tsx:485-589`; `src/app/api/admin/schedule/route.ts` (`exp_machine_schedule_blocks`) vs `exp_order_production_hooks`
- **Problem:** Scheduling an order means copying its 36-character UUID from Orders into "Order ID (UUID)". A typo returns a server error after the dialog is filled. Separately, Orders has "Production Scheduling Hooks" stored in a different table that the Schedule page never shows, so the owner keeps two schedules that don't know about each other.
- **Fix (implementation steps):** Replace the UUID fields with an `Autocomplete` searching orders and requests (by short id, customer or title). Add "Schedule this order" on the order detail, opening the Schedule dialog prefilled. Either retire hooks or show them as read-only items on the Schedule timeline.
- **Tests / acceptance criteria:** Contract test: no `label="Order ID (UUID)"`. Manual: schedule an order from its detail panel without copying an id.
- **Risks / notes:** None.

<a id="item-73"></a>
### #73 — An expired session mid-edit shows a raw "Unauthorized admin request." and re-login lands on the dashboard
- **Priority:** P3 · **Rank:** 73/76 · **Lens:** Admin · **Source finding:** UXA-23
> **Coordinator note:** Pairs with #34 (session TTL). If TTL is enforced, this item is what keeps an expired session from losing the form.

- **Severity:** Low | **Effort:** M | **Confidence:** Confirmed for the redirect target. Needs-verification for how often a 401 hits mid-edit, which depends on Supabase token refresh. | **Overlaps:** §10.17 (session management decision)
- **Location:** `src/app/admin/(panel)/layout.tsx:79`; `src/lib/admin/auth.ts:55,214-220`
- **Problem:** On a 401, every page shows the raw text "Unauthorized admin request." with no sign-in action. The panel layout always calls `requireAdminPageSessionOrRedirect('/admin')`, so after re-authenticating the owner lands on the dashboard rather than the product or order they were editing. Combined with UXA-11, the work in progress is lost.
- **Fix (implementation steps):**
  1. `useAdminMutation` (UXA-19) maps a 401 to a dialog: "Your session expired. Sign in again in a new tab, then click Retry". It opens `/admin/login?next=<current path>` in a new tab and keeps the form intact.
  2. Pass the real path to the guard by reading `x-pathname` from the proxy or `next/headers`, or move the guard into a client-aware redirect.
- **Tests / acceptance criteria:** Unit test for `parseAdminResponse(401)` → `{ kind: 'reauth' }`. Manual: revoke the session, click Save, sign in through the new tab, Retry succeeds, and the edits are intact.
- **Risks / notes:** Passing the pathname touches the auth-critical proxy (see OCT-20's note). Coordinate with the security agent.

<a id="item-74"></a>
### #74 — Dead-end copy and orphaned surfaces
- **Priority:** P3 · **Rank:** 74/76 · **Lens:** Admin · **Source finding:** UXA-25
> **Coordinator note:** `CommissionQueueTracker.tsx` deletion is done in #3 (it is also an RLS-bypass consumer and a lint error).

- **Severity:** Low | **Effort:** S | **Confidence:** Confirmed | **Overlaps:** none
- **Location:** `homepage/page.tsx:61,64,68`; `catalog/products/[id]/page.tsx:828-830`; `src/app/admin/(panel)/pricing/page.tsx:12-16`; `src/components/admin/CommissionQueueTracker.tsx` (never imported)
- **Problem:** The homepage section descriptions send the owner to modules that don't exist: "managed in the Gallery module", "managed in the Catalog module" (there is no collections editor) and "managed in the Settings module" (there is no testimonials editor). The pricing placeholder advertises "server-side pricing preview checks" that have no UI. `CommissionQueueTracker` (a realtime queue with NFC data) is dead code, even though it is the closest thing to a production queue the owner needs (UXA-21).
- **Fix (implementation steps):** Reword the copy to "Content comes from the database; not editable in the panel yet". Delete or adopt `CommissionQueueTracker` as part of the dashboard queue, and delete the placeholder page (UXA-18 step 1).
- **Tests / acceptance criteria:** Contract test: homepage meta copy contains no "managed in the Gallery module".
- **Risks / notes:** None.

<a id="item-75"></a>
### #75 — Smaller keyboard and screen-reader gaps in the interactive pieces
- **Priority:** P3 · **Rank:** 75/76 · **Lens:** Admin · **Source finding:** UXA-27
> **Coordinator note:** The unnamed `<Select>` part overlaps OCT-20; coordinate with that entry.

- **Severity:** Low | **Effort:** S | **Confidence:** Confirmed (code). Needs-verification for focus behaviour in a browser. | **Overlaps:** §9.7 / OCT-20 (names), which covers names, not these
- **Location:** `homepage/page.tsx:1067-1090`; `builder/page.tsx:1603-1634,2235-2243`; `AdminShell.tsx:215-229`
- **Problem:**
  - The homepage "Move up" button disables itself when its tile reaches the top, so keyboard focus drops to `<body>`.
  - The builder's process-type toggles are `button`s with no `aria-pressed`, so their state is only the inner "ON/OFF" text.
  - The option-value ✕ has no accessible name.
  - The notification bell has no `aria-expanded` / `aria-controls`.
- **Fix (implementation steps):**
  1. After a move, focus the moved tile's opposite-direction button (use refs keyed by `item.key`), or keep the button enabled as a no-op.
  2. Add `aria-pressed={isAssigned}`.
  3. Add `aria-label` to the ✕ (also covered in UXA-9).
  4. Give the bell `aria-expanded={notificationsOpen}` and point `aria-controls` at the panel id.
- **Tests / acceptance criteria:** Extend `src/components/admin/admin-a11y.contract.test.ts`: `aria-pressed` in the builder process toggle, and `aria-expanded` on the bell.
- **Risks / notes:** None.

---

<a id="item-76"></a>
### #76 — Formatting and time zones are inconsistent
- **Priority:** P3 · **Rank:** 76/76 · **Lens:** Admin · **Source finding:** UXA-26
> **Coordinator note:** Reuse the `SHOP_TIME_ZONE` setting and `shop-day.ts` helper introduced in #39.

- **Severity:** Low | **Effort:** S | **Confidence:** Confirmed | **Overlaps:** §9.17 (UUID card titles, custom requests only)
- **Location:** `src/lib/admin/notifications.ts:48,98`; `orders/page.tsx:303,351,403`; `catalog/products/[id]/pricing/page.tsx:348,403`; `builder/page.tsx:1514,1886`; `catalog/pricing/page.tsx:438`
- **Problem:**
  - Statuses render as raw snake_case (`ready_to_ship`, `awaiting_payment`) on Orders and in custom-request filters.
  - Money formatting varies: "delta 5" against "delta $5.00", and "percent 10".
  - The notification body formats the quote expiry with `toLocaleString()` *on the server* (UTC, server locale, no zone label), while list dates use the browser's locale.
  - Order rows lead with full UUIDs.
- **Fix (implementation steps):** Add `src/lib/admin/format.ts` with `formatMoney(n)` (`Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`), `formatStatus(s)`, `formatShortId(id)` (8 characters, monospace) and `formatDateTime(iso)` with an explicit `timeZoneName: 'short'`. Store ISO in notification metadata and format on the client.
- **Tests / acceptance criteria:** Unit tests for `format.ts`. Contract test: admin pages contain no local `function asMoney(`.
- **Risks / notes:** None.

---

## Appendix A — Checked and found sound (don't re-audit these)

Consolidated from all five reviews. Each was verified in code by at least one reviewer.

- **Admin API gate.**
  - All 36 route files and 82 handlers under `/api/admin` call `requireAdminApiSession` as their first statement, with an `!auth.ok` guard.
  - The order inside the gate is CSRF first (exact Origin/Referer plus constant-time double-submit), then the JWT claim, then an allow-list re-check (`is_active`, `revoked_at`) by primary key with the service role.
  - It fails closed, including on database errors. The coverage table is in Appendix C.
- **Admin MFA (`963e97f`).** Both admin gates (`requireAdminApiSession` and the page gate) require `aal2`. `/admin/mfa` has its own gate (role plus allow-list, no AAL check), so a non-admin never reaches the challenge. Exception: the dev helper (#10).
- **Edge gate (`src/proxy.ts`).**
  - Every `/admin*` and `/api/admin*` path is gated. Only `/admin/login` and `/admin/not-authorized` are exempt.
  - If the session refresh throws, the gate fails closed and returns a response shaped for the caller (OCT-1 fix present).
  - Next 16.3.4 is not affected by CVE-2025-29927.
- **JWT handling.**
  - `getClaims()` validates `exp` and the signature (JWKS), and falls back to `getUser()` for HS* tokens.
  - The admin role is read only from `app_metadata`, never `user_metadata`.
- **Allow-list tooling.** Migration 066 enables RLS with no policies and revokes anon/authenticated. Grant and revoke keep the claim and the row consistent. (See #11 for the email-lookup weakness.)
- **Customer resource access.**
  - `/orders/[id]` requires `guest_tracking_token` (`randomUUID`).
  - `/custom-orders/[id]` (page and API) requires `customer_access_token` (`randomBytes(24)`, 60-day expiry).
  - Export download requires request id + token + design id + expiry, or the admin gate.
- **Server-side price authority** for base, variant, bulk tiers, promo and bundle math, and shipping. Shipping is re-quoted from Shippo at a server-derived weight clamped to 0.01–150 lb, and an address plus a verified rate is required. The gaps are only what the engine doesn't model (#5) and rounding (#35).
- **Promo allocation math.** `allocateCents`/`applyOrderPercent` use integer cents with largest-remainder distribution and are tested. Percentages are clamped, fixed amounts capped, and each line keeps at least 1¢. Promo and bundle tables are not anon-readable.
- **Webhook signatures.**
  - Square: HMAC over the configured notification URL plus the raw body, `timingSafeEqual` after a length check, failing closed when the key, URL or header is missing.
  - Shippo: also timing-safe and fail-closed (the header scheme still needs a live check, #21).
  - The dedupe insert is atomic on its primary key; only its *timing* is wrong (#4, #21).
- **Inventory RPCs (061)** use `FOR UPDATE`, are idempotent, and refuse to release paid orders. They are correct; they are just never called (#12).
- **Admin order transition table** and paid-gating are sound, apart from the `cancelled` transition (#12, #23). `send_quote` uses a conditional status update and consistent cents rounding.
- **Customer artwork upload.**
  - Checks MIME type, extension and magic bytes, caps size at 15 MB, and stores under a random UUID folder in a private bucket.
  - The upload token is bound to the path, design-asset ownership is re-checked, and the design-document schema is strict.
  - The `customer-artwork` and `design-artifacts` buckets are private; `design-artifacts` is service-role only.
- **SECURITY DEFINER functions** all set an empty `search_path` and use schema-qualified bodies. (The EXECUTE-grant problem is #3.)
- **RLS** is enabled on every PII and money table per the migrations. Legacy customer policies were dropped, and storefront settings are narrowed to three keys.
- **Filter injection.** The only built-up PostgREST filter is `/api/search`'s `.or()`, whose input is stripped of `,.()%_\`. Everything else uses `.eq`/`.in`. Search returns only public fields of active products.
- **Rate-limit IP derivation.** `X-Forwarded-For` is trusted only on Vercel or with `TRUST_PROXY`. Limits fail closed by default, and the RPC is atomic (064 primary key).
- **Unsubscribe tokens** are HMAC-signed with a required secret of 32+ characters and checked with `timingSafeEqual`.
- **Email bodies** escape user fields. Subjects go through Resend's JSON API, so there is no header injection.
- **CSP.** The nonce is 122-bit. `unsafe-inline` is never allowed for scripts, and `unsafe-eval` is dev-only. `object-src 'none'`, `base-uri 'self'` and `form-action 'self'` are set. The `rrs_csrf` cookie is SameSite=Strict, and `Origin: null` is rejected.
- **Logging.** `safeLogError` redacts JWTs and keys, and public routes return generic errors (see #16 for what it drops).
- **No N+1 query patterns** in `queries/products.ts` or the admin catalog route. Indexes exist for the main lookups.
- **Storefront positives.**
  - Cart persistence normalises defensively.
  - The newsletter form is the model to copy.
  - Skip links work on every route.
  - Header nav has `aria-current`, and the mobile drawer returns focus on close.
  - There is a global `prefers-reduced-motion` reset.
  - `ProductMediaGallery` is keyboard-operable.
  - The homepage issues one `Promise.all` and is CMS-ordered.
  - `pdf-lib` is server-only, and fonts load through `next/font`.
  - Legal pages exist and are reachable from the footer.

## Appendix B — Source finding ID → work item

Use this to resolve source IDs (SA/SD/UXS/UXA/REL) mentioned inside item text. Prefixes: **SA** = security (auth/session), **SD** = security (payments/data), **UXS** = storefront UX, **UXA** = admin UX, **REL** = reliability/integrity/privacy.

| Source | Item(s) | Source | Item(s) | Source | Item(s) |
|---|---|---|---|---|---|
| REL-1 | [#2](#item-2) | REL-2 | [#4](#item-4) | REL-3 | [#12](#item-12) |
| REL-4 | [#5](#item-5) | REL-5 | [#8](#item-8) | REL-6 | [#14](#item-14) |
| REL-7 | [#13](#item-13) | REL-8 | [#19](#item-19) | REL-9 | [#35](#item-35) |
| REL-10 | [#15](#item-15) | REL-11 | [#37](#item-37) | REL-12 | [#38](#item-38) |
| REL-13 | [#39](#item-39) | REL-14 | [#40](#item-40) | REL-15 | [#9](#item-9), [#16](#item-16) |
| REL-16 | [#21](#item-21) | REL-17 | [#62](#item-62) | SA-1 | [#10](#item-10) |
| SA-2 | [#3](#item-3) | SA-3 | [#11](#item-11) | SA-4 | [#3](#item-3), [#65](#item-65) |
| SA-5 | [#34](#item-34) | SA-6 | [#6](#item-6) | SA-7 | [#16](#item-16) |
| SA-8 | [#66](#item-66) | SA-9 | [#67](#item-67) | SA-10 | [#68](#item-68) |
| SA-11 | [#28](#item-28) | SA-12 | [#69](#item-69) | SD-1 | [#5](#item-5) |
| SD-2 | [#4](#item-4) | SD-3 | [#3](#item-3) | SD-4 | [#2](#item-2) |
| SD-5 | [#3](#item-3) | SD-6 | [#19](#item-19), [#20](#item-20) | SD-7 | [#12](#item-12) |
| SD-8 | [#15](#item-15) | SD-9 | [#5](#item-5) | SD-10 | [#8](#item-8), [#36](#item-36), [#40](#item-40) |
| SD-11 | [#4](#item-4), [#21](#item-21) | SD-12 | [#64](#item-64) | SD-13 | [#65](#item-65) |
| SD-14 | [#9](#item-9), [#16](#item-16) | SD-15 | [#62](#item-62), [#69](#item-69) | UXA-1 | [#7](#item-7) |
| UXA-2 | [#6](#item-6) | UXA-3 | [#14](#item-14), [#15](#item-15), [#28](#item-28) | UXA-4 | [#24](#item-24) |
| UXA-5 | [#25](#item-25) | UXA-6 | [#12](#item-12), [#23](#item-23) | UXA-7 | [#22](#item-22) |
| UXA-8 | [#27](#item-27) | UXA-9 | [#26](#item-26) | UXA-10 | [#41](#item-41) |
| UXA-11 | [#42](#item-42) | UXA-12 | [#39](#item-39) | UXA-13 | [#43](#item-43) |
| UXA-14 | [#44](#item-44) | UXA-15 | [#45](#item-45) | UXA-16 | [#46](#item-46) |
| UXA-17 | [#47](#item-47) | UXA-18 | [#48](#item-48) | UXA-19 | [#49](#item-49) |
| UXA-20 | [#50](#item-50) | UXA-21 | [#51](#item-51) | UXA-22 | [#72](#item-72) |
| UXA-23 | [#73](#item-73) | UXA-24 | [#34](#item-34) | UXA-25 | [#3](#item-3), [#74](#item-74) |
| UXA-26 | [#76](#item-76) | UXA-27 | [#75](#item-75) | UXS-1 | [#17](#item-17) |
| UXS-2 | [#18](#item-18) | UXS-3 | [#29](#item-29) | UXS-4 | [#5](#item-5) |
| UXS-5 | [#13](#item-13) | UXS-6 | [#19](#item-19), [#30](#item-30) | UXS-7 | [#31](#item-31) |
| UXS-8 | [#32](#item-32) | UXS-9 | [#33](#item-33) | UXS-10 | [#5](#item-5), [#53](#item-53) |
| UXS-11 | [#52](#item-52) | UXS-12 | [#54](#item-54) | UXS-13 | [#12](#item-12), [#55](#item-55) |
| UXS-14 | [#56](#item-56) | UXS-15 | [#57](#item-57) | UXS-16 | [#58](#item-58) |
| UXS-17 | [#59](#item-59) | UXS-18 | [#40](#item-40) | UXS-19 | [#60](#item-60) |
| UXS-20 | [#61](#item-61) | UXS-21 | [#62](#item-62) | UXS-22 | [#63](#item-63) |
| UXS-23 | [#70](#item-70) | UXS-24 | [#71](#item-71) |  |  |

## Appendix C — Admin API coverage (from the auth review)

Key to the columns:
- **Gate:** `requireAdminApiSession` is the first statement and is followed by an `!auth.ok` guard.
- **Allow-list:** re-checked on every request.
- **CSRF:** enforced on non-GET methods.
- **RL:** rate limit on mutating methods.

| Route (`src/app/api/admin/…`) | Methods | Gate | Allow-list | CSRF | RL | Notes |
|---|---|---|---|---|---|---|
| abandoned-carts | GET, POST | ✅ | ✅ | ✅ | ❌ | POST sends up to 50 emails (#8) |
| back-in-stock | POST | ✅ | ✅ | ✅ | ✅ | |
| capacity-alerts | POST | ✅ | ✅ | ✅ | ✅ | |
| catalog | GET, PATCH, POST, PUT | ✅ | ✅ | ✅ | ✅ | |
| catalog/bundle-deals | GET, POST, PUT, DELETE | ✅ | ✅ | ✅ | ✅ | |
| catalog/categories | GET, POST, PUT, DELETE | ✅ | ✅ | ✅ | ❌ | |
| catalog/discounts | GET, POST, PUT, DELETE | ✅ | ✅ | ✅ | ✅ | |
| catalog/future-product-statuses | GET, POST | ✅ | ✅ | ✅ | ✅ | |
| catalog/future-products | GET, POST | ✅ | ✅ | ✅ | ✅ | |
| catalog/media | GET, POST, PUT, DELETE | ✅ | ✅ | ✅ | ✅ | |
| catalog/media/upload | POST | ✅ | ✅ | ✅ | ✅ | formData; SVG sanitized |
| catalog/options | GET, POST, PUT, DELETE | ✅ | ✅ | ✅ | ✅ | |
| catalog/options/values | POST, PUT, DELETE | ✅ | ✅ | ✅ | ✅ | |
| catalog/pricing-preview | POST | ✅ | ✅ | ✅ | ✅ | read-only compute (#5) |
| catalog/process-types | GET, PUT | ✅ | ✅ | ✅ | ✅ | |
| catalog/processes | GET, POST, PUT, DELETE | ✅ | ✅ | ✅ | ✅ | |
| catalog/products/[id] | GET, PUT | ✅ | ✅ | ✅ | ❌ | full-replace PUT (#7) |
| catalog/promo-codes | GET, POST, PUT, DELETE | ✅ | ✅ | ✅ | ✅ | |
| catalog/stats | GET | ✅ | ✅ | n/a | n/a | |
| catalog/variants | GET, POST, PUT, DELETE | ✅ | ✅ | ✅ | ✅ | |
| custom-requests | GET | ✅ | ✅ | n/a | n/a | |
| custom-requests/[id]/artwork | GET | ✅ | ✅ | n/a | own 50/h | 15-min signed URLs |
| custom-requests/recovery | POST | ✅ | ✅ | ✅ | ✅ | |
| finance | GET | ✅ | ✅ | n/a | n/a | (#39) |
| homepage/sections | GET, PATCH | ✅ | ✅ | ✅ | ✅ | |
| homepage/sections/[key] | PATCH | ✅ | ✅ | ✅ | ✅ | |
| homepage/upload | POST | ✅ | ✅ | ✅ | ✅ | unsanitized SVG (#64) |
| inventory | GET, POST, PUT, PATCH | ✅ | ✅ | ✅ | ✅ | |
| labor | GET, POST | ✅ | ✅ | ✅ | ✅ | |
| notifications | GET, PATCH | ✅ | ✅ | ✅ | ✅ | GET runs the idempotent sync |
| orders | GET, PATCH | ✅ | ✅ | ✅ | ✅ | |
| schedule | GET, POST, PATCH, DELETE | ✅ | ✅ | ✅ | ❌ | |
| search | GET | ✅ | ✅ | n/a | n/a | |
| settings | GET, PATCH | ✅ | ✅ | ✅ | ✅ | TTL field is dead (#34) |
| shipping | GET, PATCH | ✅ | ✅ | ✅ | ✅ | |
| shipping/debug | GET | ✅ | ✅ | n/a | n/a | echoes raw error message |
| **Outside `/api/admin`:** `/api/custom-orders/[id]` | PATCH | ✅ | ✅ | ✅ (UI never sends the token, #6) | ✅ | no edge gate; not in the contract test |
| `/api/designs/export` | POST | ✅ | ✅ | ✅ (#6) | ✅ | same |
| `/api/designs/exports/[id]/download` | GET | customer token, else gate | ✅ | n/a | own 60/h | audit rows written before auth (cosmetic) |

## Appendix D — Method and limitations

- **Code only.** The review read the code on `dev` @ `4aeb56f`, reconciled against `963e97f`. No `.env` was present, so no live Supabase, Square, Shippo or Resend calls were made, and the app was not run against data.
- **Migrations vs live database.** Database findings are read from `supabase/migrations`, which may differ from the live project (OCT-13). #1 gives the exact read-only SQL to confirm each one.
- **Live site.** `rubysrelicsstudio.com` currently serves a different, older storefront, and the `*.vercel.app` deployment returned 403. Nothing in this codebase could be checked rendered. Storefront and admin UX items marked Needs-verification say what to check in the UI_AUDIT harness.
- **Execution.** Two findings were confirmed by running repo modules from a scratch script outside the repo:
  - #5: the pricing-engine option bypass;
  - #64: the SVG sanitizer depth bypass.
  #66 (redirect sanitizer) was confirmed by transpiling and executing the real module.
- **Reconciliation.** After the review, `dev` advanced to `963e97f`. The coordinator diffed that commit against every item, re-ran the baseline checks on it, and updated #9, #10, #11, #34 and #63 (see §0.8). The new MFA code was not audited in depth.
- **Repo untouched.** Apart from adding this file, the repo working tree was not modified.
