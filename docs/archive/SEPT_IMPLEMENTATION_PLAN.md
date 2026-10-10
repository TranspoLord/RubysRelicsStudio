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

## Batch execution log (October — open issues live in `OCT_IMPLEMENTATION_PLAN.md`)

- **Batch 1 — 2026-09-30 (§7.1 + §7.6, ✅ shipped).** The CSP analytics origin and the
  `middleware.ts` → `proxy.ts` migration, deliberately landing together because they are the same file and
  the same header. The policy and the nonce contract moved into a unit-tested `src/lib/security/csp.ts`;
  `src/proxy.ts` keeps the handler (exported as `proxy`) and `config.matcher`. Tests:
  `src/lib/security/csp.test.ts` (12 cases) + `src/proxy.test.ts` (8 cases). Suite **34 files / 228 tests →
  36 files / 248 tests**, `npm run type-check` clean, `npm run build` clean with no deprecation warning, and
  the headers verified against a running production server. Issues found while implementing are in
  `OCT_IMPLEMENTATION_PLAN.md` (OCT-1 was fixed in this batch).
- **Batch 2 — 2026-09-30 (§8.2 + §9.2 + §9.3 + §9.6, ✅ shipped).** Landmarks and the consent banner: the
  panel content column is `main#main-content` (so §9.3's skip link finally has a target), the rail is a
  labelled `nav` with `aria-current` resolved by **longest match** (`src/lib/admin/module-nav.ts`), and the
  banner is storefront-only (`shouldShowCookieBanner()` in `src/lib/cookie-consent.ts`) with the theme's
  dark-on-gold primary CTA, 44 px touch targets and `scroll-padding-bottom` so it cannot bury a focused
  field. Tests: `module-nav.test.ts` (9), `cookie-consent.test.ts` (4), `theme.test.ts` (3, incl. a computed
  contrast ratio), plus source-contract guards `admin-shell.contract.test.ts` (3) and
  `cookie-banner.contract.test.ts` (5) built on the new `src/lib/testing/source-contract.ts`. Suite
  **36 files / 248 tests → 41 files / 272 tests**, `type-check` and `build` clean, `eslint` clean on every
  touched file, and a production server re-checked (`/` 200 with `main#main-content` and 0 nonce-less
  scripts, `/admin` 307, `/api/admin/orders` 401). §9.4 was deliberately **not** touched here even though the
  same box was edited — its fix needs measurement, so it stays in Batch 5.
- **Batch 3 — 2026-09-30 (§7.3, ✅ shipped).** Homepage-section writes can no longer silently no-op: one
  helper (`src/lib/homepage/section-write.ts`) asks for the written rows back, creates the missing row
  (`upsert` on `section_key`, no schema change), reports `created`, and turns a 0-row match that cannot be
  created into a **500 + failure audit**. The section key list and the default order for a new row moved to
  `src/lib/homepage/sections.ts` (`shop_all_preview` 45, `future_products_notify` 105) so a new row cannot
  inherit `sort_order = 0`. Tests: `section-write.test.ts` (8) + `sections.test.ts` (6) + §7.3 cases in both
  route suites. Suite **41 files / 272 tests → 43 files / 294 tests**, type-check/eslint/build clean. Live
  evidence (`supabase db query --linked`, read-only): 16 rows, both target keys absent. §7.4/§7.5 were
  deliberately **not** taken here — they need live DB writes and a taxonomy read.
- **Batch 4 — 2026-09-30 (§8.1 + §8.3 + §9.5 + §9.12, ✅ shipped).** The contrast layer, in the theme so both
  surfaces change once: the disabled CTA **stops the gradient** instead of the label (explicit surface +
  `alpha(parchment, 0.62)` label = 5.6:1) and `MuiIconButton` shares that floor; the semantic palette pins
  `contrastText` (MUI's 3:1 auto-derivation was painting white on `warning` — the `Pending` chips) and adds a
  text-safe `light` tone per semantic, with `textError`/`outlinedError` routed through it; and 151 sub-floor
  text colours across 45 files were raised to one enforced floor by a **number-only** sweep (1:1 line diffs).
  Tests: `theme.test.ts` grew to 14 cases (composited ratios + "the old value failed" assertions) and
  `contrast-floor.test.ts` (3) enforces the floor across `src/` with a planted-offence case. Suite
  **43 files / 294 tests → 44 files / 308 tests**, type-check/build clean, and the 16 eslint problems in the
  touched files were proven to sit on **0** changed lines. `OCT-IMPLEMENTATION_PLAN` files the one thing this
  batch could not verify here (§8.1's `aria-describedby` caption link — a component change, not a token).
- **Batch 5 — 2026-09-30 (§8.7 + §9.7 + §9.10 + §9.11, ✅ shipped; §9.4 deferred).** A11y structure and names:
  all 13 `subtitle1|2` sites now declare `component` (MUI was emitting `h6`s, incl. a price under a card `h3`);
  the 17 visibility switches, four tile-editor icon buttons, the global search field and 14 filter selects got
  accessible names; the header label and document title now follow the active module; and the five `h1`-less
  routes gained one while 10 `h6` sections became `h2` (no more `h1` → `h6` skips). Tests: `module-nav.test.ts`
  (+3), `admin-a11y.contract.test.ts` (14, incl. repo-wide source scans for stray `subtitle` headings and
  unnamed `IconButton`s), and a shared `listSourceFiles()` helper now used by the contrast scan too. Suite
  **44 files / 308 tests → 45 files / 325 tests**, type-check/build clean, 0 lint problems on changed lines
  (18 baseline problems, 0 on my lines). **§9.4 was deliberately not attempted:** its acceptance test is a
  layout measurement, and at the time of this batch the harness had not been stood up (it was in Batch 7 —
  see OCT-19's correction).
- **Batch 6 — 2026-09-30 (§7.2 + §7.4 + §7.5 + §7.10 + §3.4, ✅ shipped; two items PARTIAL).** The
  homepage/CMS batch: `sort_order` is now **real** (a new pure `orderHomepageSections()` with all four safety
  rules, and `page.tsx` loops over a key→element map instead of a fixed JSX sequence — with the old order
  pinned by tests using the live row values, in place of the un-runnable audit.json diff); the announcement
  banner is **CMS-driven** (no `STATIC_FALLBACK`, so clearing `is_active` actually removes it, which also
  deletes the 404 CTA instance); a generated favicon **and** OG image ship and were verified live over HTTP
  (200 / image/png / 979 bytes / PNG magic); and the Shop All Preview + Future Products Notify editors are
  rendered, so §3.4's dead handlers are now reachable and persist (thanks to §7.3).
  Tests: `section-order.test.ts` (11), `homepage-page.contract.test.ts` (10). Suite **45 files / 325 tests →
  47 files / 346 tests**, type-check/build clean, 0 lint problems on changed lines (18 baseline).
  **Two items deliberately left PARTIAL:** §7.4's admin panel + duplicate active row (OCT-22) and §7.5's
  unverified Footer slug (OCT-23) — both because they need a DB write or a live read I could not get
  (`db query --linked` hung twice), and I would rather leave a filed gap than repoint a link on a guess.
- **Batch 7 — 2026-09-30 (§7.7–§7.15, ✅ shipped; §7.15 data ships as SQL).** The storefront pass, executed
  **with the audit's own harness** — and the first batch whose claims are measured rather than argued:
  - §7.8 hero CTAs now go to `/custom-orders` + `/shop/ready-made` (were both `/shop`) with a correctly-named
    `hero_cta_clicked` event; §7.11 collage hrefs are **relative** (0 absolute URLs, was 2), tiles are
    **named**, and the 4 empty placeholder slots no longer render; §7.9's no-op toggle is gone and the
    emptied-grid empty state was **proven by clicking**; §7.12's `overline` floor lifted sub-12px nodes
    **11 → 1**; §7.13 measured hero **742.72 → 693.08** (mobile) / **978.55 → 800.63** (tablet); §7.14's
    query limits raised; §7.7's validator now normalises off-brand accents and reports them.
  - **Evidence:** `%TEMP%\rrs-shots7\` (before) and `%TEMP%\rrs-shots8\` (after) — tiled captures +
    `audit.json` at 1440/834/390, plus DOM probes (hydration, filter click, accessible names). Harnesses were
    throwaway `.tmp-*.mjs` files, deleted in teardown; `.tmp-*` is now gitignored (UI_AUDIT.md §10).
  - **Harness outcome worth knowing:** hydration reported `true` at all three viewports, `overflow` stayed
    **0** everywhere, and the baseline matched the recorded audit (mobile 9077 vs the audit's 9073), so the
    before/after comparison is sound.
  - Tests: 47 files / 348 tests (was 45/325), type-check/build clean. Two earlier claims in these docs were
    **wrong and are corrected**: the browser *is* present (see OCT-19), and the plan's "no browser" notes are
    struck.
- **Batch 8 — 2026-10-01 (§9.4 + §8.5's admin scope, ✅ shipped; the admin half of the harness now runs).**
  The first **admin-authenticated** capture — the thing that unblocks every remaining panel claim (§9.7/§9.11
  leftovers, OCT-20/21):
  - **A dev-only sign-in helper** (`src/app/api/dev/session/route.ts`, guards in `src/lib/dev/dev-signin.ts`):
    `auth.admin.generateLink({ type: 'magiclink' })` (service role, so **no email is sent**) → `verifyOtp` on
    the cookie-bound server client, so the session is written exactly the way `/auth/callback` writes one. It
    signs in **only** an account already active on `exp_admin_users` (§10.1), never creates or promotes one,
    and returns no token, secret or key — the session lands in cookies. Three independent gates (`NODE_ENV`,
    `VERCEL`/`VERCEL_ENV`, `ADMIN_DEV_SIGNIN_ENABLED`) plus a loopback check make it `404` like a missing
    route anywhere else. `UI_AUDIT.md` §15 is rewritten around it; the dead dev-token method (and its
    HKDF/`deriveBits` trap) is kept as *history*, not instructions.
  - **§9.4 fixed and measured.** The cause was the section-card grid's `repeat(2, 1fr)`: a `1fr` track is
    `minmax(auto, 1fr)`, so each card's `whiteSpace: 'nowrap'` description (~590 px) forced 1191 px tracks
    inside a 1060 px column, pushing the panel to 1241.34 px. `repeat(2, minmax(0, 1fr))` →
    **`/admin/homepage` 140 → 0 px** at 1440 (0 at 834/390 too). One wrong lever en route (pinning the
    *page-root* grid) measured **worse** — 158 px — and was reverted; `min-width: 0` on the grid items fixed
    nothing. Recorded in `UI_AUDIT.md` §15.7 as the diagnostic pattern.
  - **§8.5's admin scope done** — no sub-12px text remains anywhere the capture reaches: `AdminShell` module
    descriptions (0.7rem = 11.2px, on all 23 routes), the `/admin` StatCard labels (0.72rem), the homepage
    editor's tile-editor captions (0.68/0.72rem), plus **3 latent** shell sites that only render with
    notification bodies/links or an open search modal. Sub-12 nodes **12 → 0** on every route and **31 → 0**
    on `/admin/homepage`.
  - **Evidence:** `%TEMP%\rrs-admin2\` — 18 captures (6 routes × 3 viewports) + `audit.json`, with
    `audit-before.json` kept so the before/after diff is reproducible. Throwaway harnesses
    (`.tmp-admin-capture.mjs`, `.tmp-probe-admin.mjs`) deleted in teardown.
  - Tests: **49 files / 370 tests** (was 47/348), type-check/build clean, eslint 0 on every changed file.
  - **§8.5 stays open for the storefront:** 49 `fontSize` string sites in `src/` are still below 0.75rem
    (24 in `shop/categories/[slug]`, 4 in `ProductConfigurator`), so the floor sweep needs the same treatment
    on the customer-facing pages.
- **Batch 9 — 2026-10-01 (§1.5 + §8.4 + §8.5 storefront + §8.9, ✅ shipped).** The remaining storefront
  floor + the security dependency bump, all measured or machine-guarded:
  - **§1.5 npm audit** — the single `@xmldom/xmldom` high had grown to **4 vulns incl. a critical** `next`
    RCE in `next/og` `ImageResponse` (live here — `/opengraph-image.tsx`). `npm audit fix` resolved all four
    with in-range bumps (`next` 16.3.4→16.3.8, `axios`→1.20.0, `@xmldom/xmldom`→0.9.12, `brace-expansion`
    dev-only); only `package-lock.json` changed and `npm run audit` now exits 0.
  - **§8.5 storefront floor sweep** — every remaining `0.6–0.74rem` `fontSize` in `src/` raised to the
    12px floor: **26 files, ~50 sites** (badges, counters, eyebrows, helper captions, table cells).
    Enforced repo-wide by `MIN_TEXT_SIZE_REM = 0.75` + `src/theme/font-floor.test.ts`. **Measured** on
    `/`, `/shop`, `/shop/all`, `/shop/ready-made` at 1440/834/390: overflow **0**, sub-12px **0**, no
    height inflation.
  - **§8.4 inline-link targets** — the `Cookie policy` link (84×17) and the announcement CTA (107×16) now
    meet the 24px target (`display: 'inline-block'`, `py`, `minHeight: 24`); guarded by contract tests.
  - **§8.9 wordmark forced-colours** — both wordmarks declare `color: brandTokens.forgeGold` so
    forced-colours mode renders gold, not UA link blue; guarded by `wordmark.contract.test.ts`.
  - Tests: **52 files / 378 tests** (was 49/370), type-check/build clean on `next` 16.3.8.
- **Batch 10 — 2026-10-01 (§2.10, ✅ shipped).** Sitemap, robots.txt and JSON-LD structured data, the
  first "no evidence in the repo" SEO surface:
  - **`src/app/sitemap.ts`** (dynamic) — static storefront routes + live categories/products (from
    `getAllActiveProducts()`, deduped category slugs) + resource docs, all absolute against `getSiteUrl()`.
  - **`src/app/robots.ts`** — disallows `/admin`, `/api`, `/auth`, `/sign-in`, `/cart`, `/checkout`,
    `/orders`, `/custom-orders/`; points at `/sitemap.xml`.
  - **JSON-LD** — `Product` + `BreadcrumbList` on the PDP, `BreadcrumbList` on category + resource pages,
    via pure builders (`src/lib/seo/structured-data.ts`) and `src/components/seo/JsonLd.tsx`.
  - **Live-verified:** `/sitemap.xml` (10 static + 2 category + 3 product + 10 resource URLs), `/robots.txt`,
    and the sippy-cup PDP emitting exactly two `<script type="application/ld+json">` tags (`Product`,
    `BreadcrumbList`). Tests: **55 files / 389 tests** (was 52/378), type-check/build clean.
  - **Note:** local URLs resolve to `http://localhost:3000` (the documented `getSiteUrl()` dev fallback);
    production will use `NEXT_PUBLIC_SITE_URL`.
- **Batch 11 — 2026-10-01 (§9.9 + §9.13–§9.17 + OCT-20 + OCT-21 + OCT-24, ✅ shipped).** The admin-panel
  polish + CMS-ordering pass:
  - **§9.9** — the module rail is a `Drawer` below `md` (was ~906 px of chrome above content on phones); the
    trigger shows the current module, and the list is one shared `moduleNavItems` (3 contract cases).
  - **§9.13–§9.17** — five static info/warning `Alert`s are `role="status"` (not assertive `alert`); seven
    catalog back-links gained `aria-label` + `justifySelf: 'start'`; `/admin/finance`'s labor card gained a
    "No labor recorded yet." empty state; the custom-requests toolbar CTA no longer wraps; request cards are
    titled by customer name (not a raw UUID).
  - **OCT-20** — all 16 remaining unnamed `<Select>`s named (plus a repo-wide guard), and the admin `<title>` is
    server-rendered per module segment (`adminModuleMetadata()` / `ADMIN_MODULES` in
    `src/lib/admin/admin-modules.ts`, 11 `layout.tsx` files — the proxy was not touched).
  - **OCT-21** — one `AdminPageHeading` (`h1`, 24 px) replaced 23 pages' divergent h1 sizes.
  - **OCT-24** — `sort_order` is finally settable (`saveHomepageSectionOrder()` + `PUT
    /api/admin/homepage/sections` + ↑/↓ controls on `/admin/homepage`).
  - **Tests: 58 files / 423 tests**, type-check/build/eslint clean.
  - **Still open after Batch 11:** OCT-13 (migration-history baseline), OCT-22 (announcement-banner switch +
    duplicate row), OCT-23 (footer slug), OCT-26 (copy decisions), OCT-27 (collage alt text), plus the items
    consolidated under `OCT_IMPLEMENTATION_PLAN.md` → "Open items carried from SEPT".

## Summary (2026-09-16 audit; §7 added 2026-09-19; §8, §9 and §10 added 2026-09-24)

> Counts are **as of 2026-10-01, post-Batch-11**. Open items (🟡/❌) are cross-referenced to
> `OCT_IMPLEMENTATION_PLAN.md` — the OCT-20/21/24 residuals have shipped; the rest live in that plan's
> "Open items carried from SEPT" and its OCT-13/22/23/26/27 entries.
>
> **Added 2026-10-08:** this plan and the review are now **archived** — both live in `docs/archive/`
> (`SEPT_IMPLEMENTATION_PLAN.md`, `REMEDIATION_PLAN_2026-10-06.md`), because every open item was confirmed
> tracked in `OCT_IMPLEMENTATION_PLAN.md` (that plan's §2 "Open items carried from SEPT", §4 and §5). The
> review's cross-reference into that plan is its §4; §5 is the batch plan; **§6 is the Product Design Studio
> epic** — this plan's §4.1–§4.4 designer debt is absorbed there. The review's §0.1 records the convention
> that completed items are logged here (in the batch log below) and new discoveries become `OCT-n` entries.

| Section | ✅ Done | 🟡 Partial | ❌ Not done | Other |
|---|---|---|---|---|
| 1. Security & deployment | 3 | 0 | 2 | 1 obsolete |
| 2. Retention & notification | 7 | 3 | 4 | 1 obsolete |
| 3. Future-products / homepage | 6 | 3 | 3 | — |
| 4. Product designer / 3D | 0 | 2 | 2 | — |
| 5. General hygiene | 2 | 0 | 0 | — |
| 6. Live DB follow-ups | 1 | 0 | 2 | 1 corrected, 2 informational |
| 7. Storefront UI (added 2026-09-19) | 12 | 3 | 0 | 4 informational |
| 8. Storefront UI, 2nd pass (added 2026-09-24) | 8 | 0 | 1 | — |
| 9. Admin panel UI (added 2026-09-24) | 16 | 0 | 0 | 1 obsolete, 1 unverified area |
| 10. Admin auth switch: MFA → Google OAuth (added 2026-09-24) | 16 | 1 | 0 | — |
| **Total** | **71** | **12** | **14** | **11** |

Highest-value open items: **the admin panel's blocking redirect is fixed** — the Edge verifier had been
deriving a different session-signing key than the signer, so *no* login could reach `/admin` (§9.1) — which
leaves the following as the top work: the `/admin/homepage` editor scrolling sideways at every viewport
(§9.4), the panel's nameless switches/selects
(§9.7), the section-ordering refactor that finally makes `sort_order`
real (§7.2), `npm audit` high CVE (§1.5), the migration-history baseline (§1.1/§6.1 — blocks any future
`db push`), and the dead `ip` fallback removal (§1.4/§6.3). **Updated 2026-09-30 (Batch 1): §7.1 and §7.6
are ✅ DONE** — the CSP now allowlists the analytics loader origin in dev and prod (unblocking §3.11), and
`src/middleware.ts` is `src/proxy.ts` with the Next 16 `proxy` export, so the deprecation warning is gone.
The policy and the nonce contract moved into a unit-tested module (`src/lib/security/csp.ts`), and the new
`src/proxy.test.ts` pins both the export name and the decoration of every branch — that suite found a
latent bug in the deny branch, filed as OCT-1 in `OCT_IMPLEMENTATION_PLAN.md`. **Updated 2026-09-30 (Batch
2): §8.2, §9.2, §9.3 and §9.6 are ✅ DONE** — the consent banner is storefront-only (so it can no longer sit
over the panel's module rail), its `Accept` label is the theme's dark-on-gold `primary.contrastText` asserted
*numerically* in `src/theme/theme.test.ts`, every banner action is a 44 px touch target on phones, the panel
has `main#main-content` (which is what makes "Skip to main content" work on all 23 routes), and the module
rail is a labelled `nav` with `aria-current` resolved by longest match. **Updated 2026-09-30 (Batch 3): §7.3
is ✅ DONE** — every homepage-section write now proves a row was written and creates the missing one through
one helper (`src/lib/homepage/section-write.ts`), so the Shop All Preview / Future Products editors can
persist once §3.4 renders them; the live table's 16 rows and the two absent keys were confirmed with
`supabase db query --linked`. **Corrected 2026-09-30 (Batch 7): a browser *is* available** —
`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` — and the audit harness was built and used in
Batch 7, so the "no browser" notes in earlier batch entries are struck (see OCT-19). **Updated 2026-09-30 (Batch 4): §8.1, §8.3, §9.5 and §9.12 are ✅ DONE** — the
disabled-CTA state stops the gold gradient instead of the label (with the label at 5.6:1), 151 sub-floor text
colours were raised to one enforced floor (`MIN_MUTED_TEXT_ALPHA`, guarded by `contrast-floor.test.ts`), the
semantic palette now pins `contrastText`/text-safe tones so the `Pending` chips and destructive buttons are
readable, and `MuiIconButton` shares the disabled floor. One caveat that affects the remaining UI items: **this
environment has no Edge/Chrome binary**, so the audit's CDP/pixel harness cannot be re-run here and pixel- or
layout-verified items need a preview check (OCT-19). **Updated 2026-09-30 (Batch 5): §8.7, §9.10 are ✅ DONE
and §9.7/§9.11 are 🟡 PARTIAL** — no `Typography` can emit a stray `h6` any more (scan-enforced), the panel's
switches/search/tile buttons and the named filter selects are labelled, the header label and document title
follow the active module, and the panel no longer skips `h1` → `h6`; what remains is 16 unnamed selects
(OCT-20) and the `h1` size variance (OCT-21). §9.4 stays open on purpose: its acceptance test is a layout
measurement and there is no browser in this environment. **Updated 2026-09-30 (Batch 6): §3.4, §7.2 and §7.10
are ✅ DONE, with §7.4 and §7.5 🟡** — the homepage order is CMS-driven at last (`sort_order` decides what
renders where, all four safety rules tested), a favicon + OG image ship and were fetched live (200 /
`image/png`), and the Shop All Preview / Future Products Notify editors exist, so their save handlers are no
longer dead code. §7.4/§7.5 are partial only where the work is a database write or an unverifiable live read
(OCT-22/OCT-23): the banner is already data-driven and its 404 CTA is gone, but the duplicate
`exp_announcement` row and the Footer's slug still need a verified answer. One further item outranks that list on **risk**
rather than user impact: **§10** retires the whole bespoke admin-auth stack — shared key, emailed MFA, custom
HMAC session cookie, plus §1.2's seeds, §1.4 and §1.6 — in favour of Google OAuth with an admin allow-list.
Until it lands, the panel keeps a shared secret, an audit log that cannot name the actor, and a "Sign out" that
does not revoke. **Updated 2026-09-26: the cutover has landed** (§10.1–§10.7 ✅) — the panel authenticates
with Supabase Auth, every panel action is attributed to a named admin, and the shared key plus emailed MFA are
off the request path entirely (their endpoints are deleted in §10.8–§10.12). What remains of §10 is removal
and hygiene, not exposure. **Updated 2026-09-26 (final): §10 is done** — 14 of 15 items ✅, §10.13 🟡 only
because the Vercel environment variables still need removing, so the retired stack exists neither in code nor
in the database. What remains are its two open decisions (§10.16 second factor, §10.17 session management).

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
   ✅ **DONE / OBSOLETE (2026-09-26).** Those seeds existed only for the custom admin session, which is
   deleted (§10.13): they are gone from `.env`, `.env.example` and `src/test-setup.ts`, so there is nothing
   left to set or verify. The other half of this item — `NEXT_PUBLIC_SITE_URL` — is now **set locally**
   (`http://localhost:3000`), which is what makes the Google `redirectTo` return to the right host; before it
   was set, a local sign-in could be handed to the production Site URL. It still needs setting to the
   production origin in Vercel, where values stay unverifiable from the repo. §10.13 tracks that residual.
3. Add route-level regression tests for the Square checkout promo application and the new
   required-shipping validation (only pure helpers are unit-tested today). ❌ **NOT DONE.**
   `src/app/api/square/checkout/route.test.ts` does not exist, and there are **no** test files
   anywhere under `src/app/api/square/`.
4. Remove the dead legacy `ip`-column fallback in `src/lib/admin/mfa-store.ts` now that the
   live `admin_mfa_codes` table uses `challenge_token`. ✅ **DONE — closed by deletion (2026-09-26).** The
   file went with the whole MFA stack (§10.8) and the `ip` column went with the table (§10.12), so there is
   nothing left to repair.
5. Verify `npm audit --audit-level=high` passes locally (CI workflow exists). ✅ **DONE (2026-10-01, Batch 9).**
   At the time this was filed there was **one** high advisory (`@xmldom/xmldom`); by Batch 9 the audit had
   grown to **four** (3 high + 1 critical), and `npm audit fix` resolved all of them with in-range,
   non-breaking bumps (only `package-lock.json` changed, `package.json` untouched):
   `next` **16.3.4 → 16.3.8** (critical RCE in `next/og` `ImageResponse` — live here, since
   `/opengraph-image.tsx` uses it), `axios` 1.18.1 → 1.20.0 (transitive via `square`), `@xmldom/xmldom`
   0.9.10 → 0.9.12, `brace-expansion` 1.1.18/5.0.9 → 1.1.21/5.0.12 (dev-only). `npm run audit` now exits 0
   (`found 0 vulnerabilities`), and type-check / 378 tests / build all green on the new `next`.
6. **Sign out clears the cookie but never revokes the session row, so a copied token survives
   logout.** ✅ **DONE — closed by §10.10 (2026-09-26).**
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
   **Closed:** the custom session is gone entirely. `AdminShell` signs out through Supabase's `signOut()`,
   which revokes the refresh token, and the panel's authority is the `exp_admin_users` row re-checked on
   every request by `requireAdminApiSession`. Nothing reads `rr_admin_session` any more, so a copied one
   grants nothing — the "Sign out that does not revoke" defect no longer has a mechanism to exist in.

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
10. Structured data / SEO completion (Shop, category, PDP, Resources). ✅ **DONE (2026-10-01, Batch 10).**
    `src/app/sitemap.ts` (dynamic: static routes + live categories + products + resource docs, absolute URLs
    from `getSiteUrl()`), `src/app/robots.ts` (disallows `/admin`, `/api`, `/auth`, `/sign-in`, `/cart`,
    `/checkout`, `/orders`, `/custom-orders/`), and JSON-LD structured data — `Product` + `BreadcrumbList`
    on the PDP, `BreadcrumbList` on category and resource pages — built by pure helpers in
    `src/lib/seo/{site,structured-data}.ts` and rendered by `src/components/seo/JsonLd.tsx`. Tests:
    `site.test.ts` + `structured-data.test.ts` + `json-ld.contract.test.ts` (11 cases). **Live-verified:**
    `/sitemap.xml` enumerates 10 static + 2 category + 3 product + 10 resource URLs; `/robots.txt` correct;
    the sippy-cup PDP emits `Product` + `BreadcrumbList` (absolute storage image URL, `MadeToOrder` offer).
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
15. Multi-carrier shipping adapter plan + phased implementation. ✅ **OBSOLETE — CLOSED (2026-10-01, owner
    decision: "stay Shippo").** Shippo (already a multi-carrier aggregator) is wired via
    `src/lib/shippo/client.ts`, so a discrete "adapter layer" is redundant — Shippo *is* the adapter.
    Nothing to build.

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
    ✅ **DONE (2026-09-30, Batch 6).** The page had `shopAllPreview` / `futureProductsNotify` state, load
    logic and both `handleSave*` handlers — and rendered **no JSX** for either, so the handlers were dead code.
    **Added:** two editor cards (Shop All Preview: heading, subheading, products shown, show-filters and
    visibility switches; Future Products Notify: heading, CTA label, subheading, visibility), each with its own
    save button wired to the existing handler, an inline `Alert` for success/failure, and `aria-label`s on every
    field (§9.7's standard). Every input is bounded (`maxLength`, `min`/`max` 1–50 on the product count) to match
    the route's own validation.
    **This item's prerequisite is satisfied:** §7.3 (Batch 3) is ✅, so a save now *persists* — the route
    verifies the written row and creates `shop_all_preview` / `future_products_notify` when they are missing
    (neither exists in the live table), which is exactly the "editor that looks like it saves and silently
    discards input" trap the item warned about.
    Guards: `src/lib/homepage/homepage-page.contract.test.ts` asserts both panels render, both handlers are
    invoked from an `onClick` (no dead handler), and the new fields are named.
    **Residual:** the panel copy is mine, not the owner's — worth a wording pass, and a visual check needs the
    browser this environment lacks (OCT-19).
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
    🟡 **PARTIAL (2026-09-30, Batch 7).** The prerequisite (§7.1's CSP block) was fixed in Batch 1 — verified
    live: the captures report **0 console messages and 0 blocked requests**, where the audit's baseline
    expected the `va.vercel-scripts.com` CSP violation on every load.
    **Wired now:** the grid's three existing helpers are actually called —
    `homepageProductFilterApplied` on each visibility toggle, `homepageProductViewAllClicked` on "View All",
    and `homepageFutureProductsLinkClicked` on "Future Products" — plus a new `heroCtaClicked` for §7.8.
    **Still open:** `FutureProductsNotifyCard` is unchanged (its form already posts `source:
    'homepage_notify_card'` server-side, but no client event), and nothing has been checked in the Vercel
    dashboard, so "events are recorded" is proven only to the extent that the script now loads.
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
   - ~~`alter table public.admin_mfa_codes drop column if exists ip;`~~ — **moot as of 2026-09-26:** the
     whole `admin_mfa_codes` table was dropped by §10.12, so only the `exp_stripe_webhook_events` drop
     remains here. Renumber it to land *after* §10.12 rather than claiming `065` up front.
3. Remove the dead legacy `ip`-column fallback in `src/lib/admin/mfa-store.ts` (also listed in
   §1 item 4) once the column is dropped. ✅ **DONE — closed by deletion (2026-09-26):** the file and the
   column it fell back to both no longer exist.
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

1. **The CSP blocks the Vercel Analytics script — all analytics are currently dark.** ✅ **DONE
   (2026-09-30, Batch 1).** The policy was inlined in `src/middleware.ts` with
   `script-src 'self' 'nonce-…' https://vercel.live`, while the script is served from
   `https://va.vercel-scripts.com` (confirmed in the installed package —
   `@vercel/analytics/dist/react/index.js:103` returns `…/v1/script.debug.js`, which was also the
   dev-console violation in all 24 captures), so the violation fired on every page load.
   **Fix:** the policy moved to `src/lib/security/csp.ts` (`buildCspHeader()`), which allowlists the
   origin in **both** branches through `CSP_SCRIPT_ORIGINS`; `applyCspToResponse()` now writes the
   `Content-Security-Policy` header, the `x-nonce` header and the `rrs_csp_nonce` cookie from one
   value, so a call site cannot decorrelate them. `src/lib/security/csp.test.ts` (12 cases) asserts
   the origin in dev *and* prod, asserts the `vitals.vercel-insights.com` beacon is still allowed
   (loading the loader without the beacon would drop every event), pins the nonce/cookie contract and
   the hardening directives, and guards against a source list emitted without its directive name.
   **Verified live** on a production build (`next start`): `GET /` returns
   `script-src 'self' 'nonce-…' https://vercel.live https://va.vercel-scripts.com`, and the same
   response's `<body nonce>` matches its `x-nonce` header with **0** script tags left without a
   nonce. **§3.11 is unblocked** (events can now be recorded; nothing calls them yet).
2. **Homepage section order is code-driven; `sort_order` is never read.** ✅ **DONE (2026-09-30, Batch 6).**
   `src/app/page.tsx` no longer renders a fixed JSX sequence: it builds a key→element map and loops over
   `orderHomepageSections(sections)` (new `src/lib/homepage/section-order.ts`), so the admin's `sort_order` now
   decides what appears where. **All four safety rules shipped exactly as specified** and each is unit-tested:
   (a) a row-less key stays visible at its default order (`shop_all_preview` 45, `future_products_notify` 105),
   (b) equal `sort_order` breaks deterministically by default order then key (asserted to be map-order
   independent, so a refresh cannot reorder the page), (c) `hero` is pinned first even when the CMS buries it,
   (d) an empty/failed map degrades to the full default order rather than a blank page.
   **Acceptance test, adapted:** the audit proposed diffing `audit.json` before/after, which needs the CDP
   harness this environment lacks (OCT-19) — so equivalence is asserted instead from the **live** `sort_order`
   values measured on 2026-09-30: `section-order.test.ts` pins the resulting sequence to the exact order the old
   JSX had, and pins the visible subset. `hero_collage` is correctly excluded from the render set (it is the
   hero's *content* row, read by `getHeroCollageConfig()`), which the test also states.
   **Residual:** there is still no admin UI that *sets* `sort_order` (the CMS panel exposes visibility and
   content only), so ordering is honoured but editable only in SQL — filed as OCT-24.
3. **Homepage-section writes silently no-op for keys without a DB row.** ✅ **DONE (2026-09-30,
   Batch 3).** Every writer used `.update().eq('section_key', …)` and looked only at `error`, so a save for a
   key with no row reported success (and audited **success**) while storing nothing. **Confirmed live** with
   `supabase db query --linked` on 2026-09-30: `exp_homepage_sections` holds **16** rows and **neither**
   `shop_all_preview` **nor** `future_products_notify` is among them, so both keys were affected. **Fix:**
   all five `[key]` writers and the batch writer now go through one helper,
   `saveHomepageSection()` (`src/lib/homepage/section-write.ts`), which (a) asks for the written rows back
   (`.select()`) so "no row matched" is observable, (b) creates the row when none matched — `upsert(…,
   { onConflict: 'section_key' })`, exactly as this item proposed, so still **no schema change and no
   migration** — and (c) reports `created` so the response (`{ok:true, created}`) and the audit entry
   distinguish update from create. A 0-row match that cannot be created is now a **500 + failure audit**.
   **Two deliberate safety decisions:** `sort_order` is written **only** on the create path (an update must
   never overwrite the admin's ordering — §7.2), and a visibility-only toggle never sends `content`, so it
   cannot wipe a section's content. The section key list moved to `src/lib/homepage/sections.ts` (one source
   of truth for both routes) together with the default order for a newly created row — `shop_all_preview`
   **45**, `future_products_notify` **105**, this item's own values — so a brand-new row cannot inherit the
   column default `0` and jump to the top of the homepage. Tests: `src/lib/homepage/section-write.test.ts`
   (8) + `sections.test.ts` (6) + new cases in both route suites (43 files / 294 tests green, type-check and
   build clean). **Residual:** the end-to-end PATCH needs an authenticated admin session, which this
   environment does not have — the proof is the mocked-chain route tests plus the live "row is absent"
   evidence above. **No longer blocking: §3.4 and items 9 and 15 below can now create their rows.**
4. **The announcement banner cannot be turned off.** 🟡 **PARTIAL (2026-09-30, Batch 6).** Two of the three
   layers are fixed in code:
   - `src/app/page.tsx` no longer renders it unconditionally — it renders only when `getActiveAnnouncement()`
     (which filters `is_active = true`) returned a row;
   - `AnnouncementBanner.tsx` no longer does `data ?? STATIC_FALLBACK`: with no data, or no `message`, it
     renders nothing.
   So clearing `exp_announcement.is_active` now genuinely removes the banner, which is the behaviour the item
   asks for ("the intended switch is `exp_announcement.is_active`").
   **Still open, and both are outside "change code":** (i) the admin homepage page has no announcement panel,
   so the switch is SQL-only — filed as OCT-22; (ii) the live table holds **two identical active rows** and the
   newest-wins `limit(1)` query hides it — a data cleanup that needs a write, so it stays filed rather than
   done (OCT-22), consistent with this project's "no batch writes to the hosted DB without an explicit ask"
   rule (OCT-18).

High:

5. **The banner and footer CTA point at a non-existent category (404).** 🟡 **PARTIAL — and the premise needs
   re-verification (2026-09-30, Batch 6).** Two things changed:
   - **The banner half is closed by deletion.** The offending instance was `STATIC_FALLBACK`'s `cta_href`, which
     §7.4's fix removed with the fallback itself, so no code path can render that link any more.
   - **The item's reasoning conflates key and slug.** `exp_taxonomy.slug` for the drinkware category in the repo
     is `engraved-drinkware` (`supabase/seed/001_homepage_seed.sql:50` — key `engraved_drinkware`, slug
     `engraved-drinkware`), and `/shop/categories/[slug]` resolves by **slug**, so the href is only a 404 if the
     live row was later replaced. It is the *key* (`engraved_drinkware` vs `drinkware`) that differs, not
     necessarily the slug.
   **Not done, deliberately:** I could not read the live taxonomy to settle it — `supabase db query --linked`
   hung twice (~5+ min each, OCT-18) — so I did **not** repoint `Footer.tsx:16` on an unverified premise. That
   is the last code occurrence, pinned by a contract test that fails if another appears, and the one-line query
   that settles it is filed as OCT-23. **The DB value** (`exp_announcement.cta_href`) likewise stays filed — a
   write needs an explicit ask.
6. **Migrate `middleware.ts` → `proxy.ts` (Next 16 deprecation).** ✅ **DONE (2026-09-30,
   Batch 1).** The rename was applied to the file itself (`git mv src/middleware.ts src/proxy.ts`) and
   the handler is now exported as `proxy` — the name Next 16's validator requires (verified in
   `node_modules/next/dist/build/analysis/get-page-static-info.js:303`: the file must export `proxy` or
   a default; a `middleware`-named export fails the production build with error E903). **Preserved
   exactly:** the nonce contract (`x-nonce` response header + `rrs_csp_nonce` cookie, both read at
   `src/app/layout.tsx:74-76`), `config.matcher`, and the `CSP_NONCE_COOKIE` re-export. **One change
   worth recording:** a proxy runs on the **Node.js** runtime by default where middleware ran on Edge
   (`next/dist/build/entries.js:231-234` → `onServer()`); everything the file uses is
   runtime-agnostic, and the real decision is still made per request server side. **Verified:** build
   log shows `ƒ Proxy (Middleware)` with **no** deprecation warning; `npm run type-check` clean;
   `src/proxy.test.ts` (8 cases) pins the `proxy` export name, the matcher and the branch matrix; live
   on a production build — `/admin` → `307 /admin/login`, `/api/admin/orders` → `401
   {"error":"Unauthorized"}`, `/admin/login` and `/admin/not-authorized` → `200`, and **all five**
   responses carry the CSP header, `x-nonce` and the nonce cookie. The codemod
   (`npx @next/codemod@canary middleware-to-proxy`) was not used; the manual rename keeps the diff
   reviewable. Same file, same header as item 1, as the plan required.
7. **Brand-palette drift in section accents.** ✅ **DONE in code (2026-09-30, Batch 7); the data half
   ships as SQL.** The API no longer accepts free-form hex: `[key]/route.ts` now holds a `BRAND_HEXES`
   allow-list built from `brandTokens` and **normalises** on write — an off-brand `glow_color` becomes the
   brand accent and an off-brand `gradient` is dropped (so the component's own brand gradient applies), with
   every substitution reported in the response as `normalised` and recorded in the audit entry. Normalise
   rather than reject, deliberately: a hard failure would block saving `quick_picks` while its stored values
   are still off-brand, which is the "don't break a working feature" rule. Covered by two new route tests
   (off-brand → normalised + reported; brand → untouched). **The stored values** (`#C084FC` violet,
   `#6B9E6B` green, `#6A7AC4` indigo, `#2ABCD4` cyan, `#8B4FBE` purple, plus the ready-made page's `#5A9A3A`
   eyebrow) are recoloured by `supabase/verification/2026-10-01_homepage_content_fixes.sql` — written and
   previewed, **not run** (no batch writes to the hosted DB). The violet-chip contrast note is handled: the
   chip's colour is data, and the accent token it should use is now enforced.
8. **Hero CTA redundancy and a mislabeled analytics event.** ✅ **DONE (2026-09-30, Batch 7).** The hero
   rendered "Shop the Hoard" (filled) **and** "Browse Shop" (outlined), both pointing at `/shop`, while the
   copy above promises "Upload your artwork or choose from our ready-made designs" — so neither intent was
   offered, and the first button fired `Analytics.categoryClicked('all','shop')`.
   **Verified by capture before the fix:** both CTAs measured `/shop` (`224x56` and `188x58`).
   **Fixed:** the pair is now `Start a Custom Order` → `/custom-orders` (273.7×56) and `Shop Ready-Made` →
   `/shop/ready-made` (233.1×58) — the two intents the copy actually advertises — and each fires a new,
   correctly-named `Analytics.heroCtaClicked('custom_order' | 'ready_made')` (`hero_cta_clicked`). The hero
   still carries the `TODO` to source copy from the `hero` CMS row; that is a content decision, tracked
   separately as OCT-26.
   `src/components/home/HeroSection.tsx:150-172` renders "Shop the Hoard" (filled) **and**
   "Browse Shop" (outlined), both pointing at `/shop`, while the copy directly above promises
   "Upload your artwork or choose from our ready-made designs" — neither intent is offered. The
   first button also fires `Analytics.categoryClicked('all', 'shop')`, mislabelling a hero click
   as a category click. Separately, `HeroSection.tsx:15` still carries the `TODO` to move hero
   copy into admin-managed content (the `hero` row already exists in `exp_homepage_sections`).
9. **Shop All filter defaults and a missing empty state.** ✅ **DONE (2026-09-30, Batch 7).** No
   `shop_all_preview` row exists, so the component defaults still win (`product_count: 6`,
   `show_filters: true`). Two fixes, both **verified against the live DOM**:
   - **Each toggle now renders only when its bucket has products** (`hasReadyMade` / `hasCustomizable`), so
     "Show ready-made" is no longer a permanent no-op. Probe evidence: the DOM contains
     `["Show customizable"]` and **no** `Show ready-made` label.
   - **A post-filter empty state** explains an emptied grid and offers a way out. Probe evidence, by actually
     clicking the switch: `{ clicked: true, cardsBefore: 15, emptyState: true, browseEverythingLink: true,
     cardsAfter: 12 }` — all three grid cards disappeared and "No products match these filters … browse
     everything" appeared (the remaining 12 links are footer/shortcut/order-path links, not grid cards).
   The pre-filter `return null` guard is untouched (it still correctly hides the whole section when the
   catalogue is empty).
   **Bonus, same file:** §3.11's three ready-made analytics helpers are now **called** —
   `homepageProductFilterApplied` on each toggle, `homepageProductViewAllClicked` on "View All",
   `homepageFutureProductsLinkClicked` on "Future Products" — see §3 item 11.
10. **No favicon and no OG image.** ✅ **DONE (2026-09-30, Batch 6).** There was no `public/`, no
    `src/app/icon.*` and no OG image, so a share rendered as a bare link and no icon was advertised.
    **Fix:** `src/app/icon.tsx` and `src/app/opengraph-image.tsx`, both generated at build time with
    `ImageResponse` (this item's own suggestion) from brand tokens, so nothing waits on artwork.
    **Verified live, not assumed:** on a production server `GET /icon` returns **200**, `content-type: image/png`,
    **979 bytes**, PNG magic bytes, and the homepage HTML carries both the `rel="icon"` link and the OG image
    reference; the build registers `/icon` and `/opengraph-image` as static routes.
    **Two precise caveats:** `/favicon.ico` itself is still not served (the link tag is the authoritative
    mechanism, and the middleware matcher excludes that path by design) — a file at that exact path is a
    separate, optional step. And the item's `sitemap.ts` half belongs to §2.10, which remains open.

Medium:

11. **Hero collage renders 4 invisible placeholder tiles and absolute production URLs.** ✅ **DONE
    (2026-09-30, Batch 7).** All three parts, **verified by capture**:
    - **Absolute production URLs → 0.** Both real tiles were fetched as
      `https://rubysrelicsstudio.vercel.app/shop/categories/...`; the component now reduces any absolute URL
      to its path (`toLocalHref()`), and the after-capture shows the same two tiles as
      `/shop/categories/apparel/sublimated-custom-t-shirt` and `/shop/categories/stickers/custom-sticker-sheet`
      — same geometry (297×301, 255×247), so the real images still render and clicks stay on-origin.
    - **Nameless tiles → named.** The links carry `aria-label` (`image.alt || 'View product'`), and the
      wrapper's `aria-hidden="true"` — which had hidden focusable links from AT — was removed; only the
      decorative placeholder cards are `aria-hidden` now. Probe evidence: `tileNames: ["View product", …]`.
      **Data follow-up:** the label falls back to `View product` because the CMS `alt` is empty for both
      images; filling those in is filed as OCT-27.
    - **Placeholders.** The container now renders the **real** images when there are ≥2 of them, so the 4
      empty slots no longer render as blanks at all; when placeholders are used they show their intended
      subject as a caption (≥12 px) instead of an unlabelled emoji. (Contrast was already raised to
      `alpha(parchment, 0.62)` by the Batch 4 sweep.)
    **Still true and unchanged:** the collage is `lg`-only, so tablet/mobile get no imagery — real photos are
    the eventual fix (OCT-27).
12. **Eyebrow labels are hard-coded and `overline` sits below the 12px floor.** ✅ **DONE for the type
    floor (2026-09-30, Batch 7); the CMS half is filed.** `theme.ts` set the `overline` variant to `0.7rem`
    (11.2px), so **one theme edit** lifted every site: it is now `0.75rem` (12px).
    **Verified by capture:** the homepage's sub-12px nodes went **11 → 1** at all three viewports
    (desktop/tablet/mobile), and all **11** overline eyebrows now measure **12px**. The single remainder is
    the 9.6px `Studio` wordmark, which is the known artifact from the audit (`background-clip: text` +
    transparent fill — it is never painted; its forced-colours fix is §8.9).
    **Still open, and genuinely separate:** the eyebrow *strings* are hard-coded and
    `ShortcutSection` reuses `ariaLabel` as the visible eyebrow, so one string does accessibility and
    editorial duty; "Shop preview" still reads as internal jargon. That needs the shared `SectionHeading` +
    `content.eyebrow` field (validator + admin editor) — filed as OCT-26, together with the §8.5 badge tier
    (8 files still use `0.65rem` for badges/counters), which is a separate sweep.
13. **Mobile hero wastes ~200px of vertical space.** ✅ **DONE (2026-09-30, Batch 7), with the honest
    number.** `minHeight` is now `{ xs: 'auto', sm: '72vh', md: '90vh' }`, `py` is `{ xs: 6, sm: 8, md: 14 }`,
    the trust row moved to 12px and the scroll cue from `opacity: 0.4` to `0.62`.
    **Measured before → after (same harness, same data):** hero height **742.72 → 693.08** at 390×844 and
    **978.55 → 800.63** at 834×1112; page height **9077 → 8990** (mobile) and **7135 → 6972** (tablet);
    desktop unchanged at 810 (the `md: 90vh` stage is intentional).
    **So the reclaim is ~50px on a phone, not the ~200px the item hoped for** — because the hero is now
    *content*-sized, and its content (h1 + promise + NSFW line + two CTAs + trust row) is ~693px on its own.
    The remaining lever is copy/structure (a shorter promise, a single CTA row), not CSS; that is a wording
    decision, filed with OCT-26. `overflow` stayed 0 at every viewport, and the page still hydrates.
14. **Homepage section queries under-fetch their own content.** ✅ **DONE (2026-09-30, Batch 7).**
    `src/app/page.tsx` now calls `getPublishedGallery(12)` (12 gallery rows exist) and
    `getVisibleTestimonials(6)` (6 testimonial rows exist), so both sections render fully on the day they are
    re-enabled instead of half-empty. **Not visually verifiable today:** both sections are `is_visible=false`
    in the live table, so the capture shows no difference — the change is a query-limit fix, confirmed by
    reading the two call sites.

Content/data-only decisions (no deploy required):

15. **Homepage content toggles, pending items 2/3 for anything order-related.** 🟡 **PARTIAL (2026-09-30,
    Batch 7) — the SQL is written, not run.** Everything here is a *data* change, and no batch in this
    project writes to the hosted database (OCT-18), so it ships as a reviewable script you run:
    **`supabase/verification/2026-10-01_homepage_content_fixes.sql`**, with a preview `SELECT` before each
    statement. It covers: hide `quick_picks`; enable `faq_preview` (8 `exp_faq` rows exist for
    `section='homepage'`); insert the missing `shop_all_preview` row at **45** and `future_products_notify`
    at **105** so the grid follows "Three Ways to Claim Your Treasure" (§7.2's registry values); repoint the
    banner CTA only if `engraved-drinkware` turns out not to be a live slug (§7.5); deactivate the duplicate
    active `exp_announcement` row (§7.4); recolour the drifted shortcut accents (§7.7); and set the missing
    `exp_taxonomy.emoji` values (`wood_goods`, `pet_products`) plus a distinct `signs_and_decor` glyph
    (🪵 is shared with `wood_basswood`, which is why a slate product reads as wood).
    **Ordering note:** run the §7.7 recolor *before* relying on the brand allow-list, or the next
    `quick_picks` save will normalise its own stored values (harmless, but it reports `normalised` entries and
    changes the colours).

Informational (no action yet):

- The NSFW line at `HeroSection.tsx` (`alpha(forgeGold, 0.65)` + italic) was deliberate brand positioning
  — suggestive work is welcome — but it was styled like a compliance disclaimer, sitting directly under the
  value proposition at every breakpoint. **Batch 7 changed the styling, not the wording:** it is now
  full-strength `forgeGoldLight` (≈5:1 instead of 3.53:1), no longer italic, and it links to
  `/resources/faq` ("How that works"). A wording decision is still open (OCT-26).
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

1. **The disabled state of the primary CTAs is illegible *and* looks enabled.** ✅ **DONE (2026-09-30,
   Batch 4).** The mechanism was exactly as filed: `MuiButton-containedPrimary` + `disabled` left
   `opacity: 1` while the theme's gradient kept painting and MUI's own disabled rule only touched
   `background-color`/`color` (30 % white) — composited, ≈1.4:1 at the light end of the gold. **Fix, in the
   theme rather than at ~15 call sites:** `MuiButton.styleOverrides.containedPrimary['&.Mui-disabled']` now
   stops the **gradient** (`background: 'none'`), paints an explicit surface (`BG_ELEVATED`), uses the muted
   label floor (`alpha(parchment, 0.62)` → **5.6:1** on that surface, computed in
   `src/theme/theme.test.ts`) and keeps the shape with an inset ring instead of the saturated fill; the root
   token sets `opacity: 1` plus the muted label for every variant, and `outlinedPrimary` gets the same pair.
   Because the rule lives on the variant, it reaches `Add to Cart`, `Pay with Square`,
   `Checkout with Square`, `Submit Request`, `Clear Cart` and `Calculate Shipping` without touching them.
   **Asserted, not eyeballed:** the theme test resolves the alpha over the actual surface (the compositing
   step the pixel audit had to do) and also asserts the *old* pairing is under 2:1, so the measurement stays
   in the repo. **Residual, and it is a real gap:** the plan also asked to link the 12px explanation caption
   to the button with `aria-describedby`. That is a per-component change on the PDP (`ProductConfigurator`)
   and is **not** done here — see `OCT_IMPLEMENTATION_PLAN.md` → OCT-19, because it belongs with the
   `ProductConfigurator` edit rather than the token layer.
2. **The cookie `Accept` button is white on gold (2.81:1) on every page — and the banner covers
   the checkout form.** ✅ **DONE (2026-09-30, Batch 2).** `CookieBanner.tsx` hard-coded
   `color: '#fff'` on `background: brandTokens.forgeGold` while the theme already defines the correct
   `primary.contrastText` (`#0C0A07`). **Fix:** the `Accept` button is now a plain
   `variant="contained" color="primary"` with no colour override, so the gradient, hover state and
   label all come from the theme; the two text actions moved onto tokens too (`parchmentMuted`
   instead of a stray `#999`). The colour is now asserted **numerically** in `src/theme/theme.test.ts`
   — the label equals `primary.contrastText` and clears 4.5:1 against the lightest gradient stop, while
   the old white-on-gold pair is asserted to be under 3:1 — so "never white on gold" is a test, not a
   convention. **Touch targets:** all three actions share one `bannerActionSx` (`minHeight` 44 px on
   phones), guarded by `src/components/common/cookie-banner.contract.test.ts`. **Overlap: mitigated,
   not eliminated** — while the bar is up the component sets `scroll-padding-bottom: 104px` on
   `<html>`, so scrolling/focusing a field can no longer land underneath it; the bar is still
   `position: fixed`, so it does visually overlay the last strip of the page. Reserving layout height
   instead would change the storefront's bottom spacing everywhere, so it stays a deliberate tradeoff
   (recorded in `OCT_IMPLEMENTATION_PLAN.md` → OCT-4).
3. **The muted-text floor is systemic (2.72–4.36:1), and it is the instruction text.** ✅ **DONE
   (2026-09-30, Batch 4).** As filed, `alpha(parchment, 0.35…0.5)` was the de-facto helper-text tier
   (0.35 = 2.72:1 … 0.5 = 4.36:1) at 10.4–12px, so no large-text allowance applied. **Fix:** one floor,
   `alpha(parchment, 0.62)` — this item's own first option — applied by a **mechanical, number-only sweep**
   of every sub-floor *text* colour: **151 sites across 45 files**, each file a 1:1 line diff (the ≥0.62
   values, and every low-alpha *border*/background tint the design depends on, are untouched). The floor is
   now enforced, not just applied: `MIN_MUTED_TEXT_ALPHA` lives in `theme.ts` and
   `src/theme/contrast-floor.test.ts` walks `src/` and fails on any new `color: alpha(parchment, < 0.62)`
   (plus any text painted in a surface-only colour), with a planted-offence case so the scan cannot pass
   vacuously. `theme.test.ts` proves the composited ratio on all four surfaces (≥5.6:1 worst case) and keeps
   the old 0.4 value on record as failing.
   **Chip half — split, deliberately:** the red label the item nominates (`#E0706F`) is now a real theme
   token (`error.light` / `brandTokens.rubyRedText`) and the 7 literal `#CF4040` **text** uses (the
   configurator's required-asterisk glyphs and the designer's upload error) moved onto it — `#CF4040` as
   text was 3.48:1 on a card. The **violet** chip (`#B98BE0`/`#C084FC`) is a *taxonomy/CMS* value
   (§7.7), so it stays a data change in Batch 6; nothing in `src/` holds that hex.
   Cross-refs unchanged: §7.7 and the NSFW line in §7's informational block remain the fix sites for the
   data-driven accents.

High:

4. **Two inline links sit below the 24px minimum target.** ✅ **DONE (2026-10-01, Batch 9).** The banner's
   `Cookie policy` link (84×17) and the announcement CTA `Shop Drinkware` (107×16) now render as
   `display: 'inline-block'` with vertical padding and `minHeight: 24`, lifting both to the 24px target
   (SC 2.5.8) without re-flowing the sentence. The footer column (17px rows on a **35px pitch**) already
   passed through the spacing exception and is untouched. Guarded by `cookie-banner.contract.test.ts` and
   `announcement-banner.contract.test.ts`.
5. **The sub-12px type tier is wider than the eyebrows.** ✅ **DONE (2026-10-01, Batches 8 + 9).** Extends
   §7.12: besides the `overline` (0.7rem), 8 files used `0.65rem` (10.4px) for badges and counters
   (`ShopOrderPaths.tsx:100`, `app/shop/page.tsx:235`, `FreshFromTheForge.tsx:122,137`,
   `MaterialsTeaser.tsx:156`, `ProcessStrip.tsx:145`, `shop/categories/[slug]/page.tsx:340`,
   `Header.tsx:231`). The sweep turned out to be **larger than the item named**: Batch 8 cleared the
   admin panel (module descriptions, StatCard labels, tile-editor captions) and Batch 9 swept every
   remaining `0.6–0.74rem` `fontSize` in `src/` — **26 files, ~50 sites** (badges, counters, eyebrows,
   helper captions, table cells) — up to the 12px floor.
   **Enforced, not just applied:** `MIN_TEXT_SIZE_REM = 0.75` lives in `theme.ts`, and
   `src/theme/font-floor.test.ts` walks `src/` and fails on any new `fontSize: '0.NNrem'` below it
   (with a planted-offence case). **Measured (same harness):** overflow **0** and sub-12px nodes **0**
   at all three viewports on `/`, `/shop`, `/shop/all` and `/shop/ready-made`, with no page-height
   inflation (homepage mobile 8990 → 8998 px).

Medium:

6. **The hero-collage tiles have no accessible name.** ✅ **DONE (2026-09-30, Batch 7 §7.11 — recognised
   late, 2026-10-01).** The item asked for exactly what §7.11 shipped: each real tile is now an `<a>` with
   `aria-label={image.alt || 'View product'}` (its only child is the `<img>`, so the name no longer reads as
   "link"), the stored absolute `href`s are reduced to relative paths by `toLocalHref()`, and placeholder
   slots are `aria-hidden`. Verified by Batch 7's capture: **0 absolute off-origin hrefs** and the tiles
   announced by name. **Remaining (data, not code):** the live CMS rows still carry `alt: ""`, so the name
   falls back to "View product" — that is OCT-27's one-row data change, not a code gap.

Low:

7. **Stray `h6` headings and level skips from MUI's `subtitle` mapping.** ✅ **DONE (2026-09-30,
   Batch 5).** `<Typography variant="subtitle1|2">` renders `<h6>` unless `component` is set, so the homepage
   product grid emitted a **price** as `h6` directly under the card's `h3`. **All 13 sites** the item lists
   (exactly as enumerated — `HomepageProductGrid.tsx:191`, `ResourcesTeaser.tsx`, `FaqPreview.tsx`,
   `FreshFromTheForge.tsx`, `CartPageView.tsx`, `SearchModal.tsx` ×2, `ProductDesigner.tsx` ×2, the builder
   ×4) now declare `component="span"`, applied by a mechanical pass and **enforced repo-wide** by
   `src/components/admin/admin-a11y.contract.test.ts`, which scans `src/` for any `variant="subtitle1|2"`
   without a `component` (with a planted-offence case so the scan cannot pass vacuously).
   **One sub-claim does not reproduce:** the item also says "six footer-region link labels are headings too".
   In the current tree `Footer.tsx` uses no `subtitle` variant at all — its only heading-like element is the
   `component="h3"` wordmark — so there was nothing to fix there. If that observation came from the
   footer-region of a *page* (not `Footer.tsx`), it needs the audit's route list to re-locate; noted rather
   than guessed.
8. **Mobile funnel length.** ❌ **NOT DONE.** At 390×844 the homepage is **9,073px** (≈10.7
   screens, 9 sections, 65 focusables) with the "Want early access?" notify form as the **ninth**
   section — roughly nine swipes to the highest-intent action on the page, which has a working API
   behind it. The PDP is 3,997px with `Add to Cart` far below the fold. Consider moving the notify
   card above the "browse by craft" grid on `<md`, trimming the 3-up starter row on small screens,
   and a sticky `Add to cart — $13.00` bar on `<md`.

9. **The `Ruby's Relics` wordmark declares no `color`, so forced-colours mode drops the gold fill.** ✅ **DONE
   (2026-10-01, Batch 9).** `Header.tsx` and `Footer.tsx` paint the wordmark with `background-clip: text` +
   `WebkitTextFillColor: 'transparent'`, so its computed `color` fell back to the UA default link blue
   (**2.10:1**, flagged in all 24 captures) — harmless in normal mode because it is never painted, but in
   Windows High Contrast / forced-colours the fill is dropped and the wordmark rendered default blue. Both
   wordmarks now declare `color: brandTokens.forgeGold`. Guarded by
   `src/components/layout/wordmark.contract.test.ts` (asserts the colour lives on the same element as the
   transparent fill, in both files).

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

2. **The storefront cookie banner renders inside the panel and covers the module rail.** ✅ **DONE
   (2026-09-30, Batch 2).** `CookieBanner` lives in the root layout (`app/layout.tsx:92`), so it was
   `position: fixed; bottom: 0; zIndex: 2000` over *every* admin page: at 1440×900 its rect was
   `top 813 / height 87` and `elementFromPoint` on the "Abandoned Carts" and "Homepage" module links
   returned the banner's own paragraph — two of twelve modules unclickable until a *storefront* consent bar
   was dismissed. Its `Accept` button measured **1.67:1** and all three buttons were 31 px. **Fix:** the
   banner now asks `shouldShowCookieBanner(pathname)` (new, pure, in `src/lib/cookie-consent.ts`, 4 test
   cases) and returns `null` for `/admin` and everything under it — the panel can no longer be covered,
   because the bar is not rendered there. The colour and touch sizing are shared with §8.2 and fixed in the
   same change (`variant="contained" color="primary"` + `bannerActionSx`), so the 1.67:1 label and the 31 px
   targets are gone with it.
3. **"Skip to main content" has no target on any panel page.** ✅ **DONE (2026-09-30, Batch 2).** The root
   layout's `SkipToMain` points at `#main-content` (`SkipToMain.tsx:10`), which existed on every storefront
   page and on **none** of the 23 panel pages. The shell's content column is now
   `component="main" id="main-content"`, so the first focusable element on every panel page finally goes
   somewhere (WCAG 2.4.1) *and* the missing landmark is supplied in the same attribute — which is why this
   shipped with §9.6. (`/admin/login` and `/admin/not-authorized` already had `main#main-content` via their
   own views, so the whole `/admin` tree is now covered.) Guard:
   `src/components/admin/admin-shell.contract.test.ts`.
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
   ✅ **DONE (2026-10-01, Batch 8) — and the cause was not the one this item predicted.** The 2026-09-24
   counts above were real, but `minWidth: 0` / `overflowWrap: 'anywhere'` were the wrong levers *here*:
   `min-width: 0` on the grid **items** changed the overflow by **0 px**. The cause was the section-card
   grid's `repeat(2, 1fr)` — a `1fr` track is `minmax(auto, 1fr)`, so it cannot shrink below its items'
   min-content, and each card's `whiteSpace: 'nowrap'` description is ~590 px of text. Two tracks therefore
   resolved to **1191 px** inside a 1060 px column and the panel painted **1241.34 px** wide. Fix:
   `repeat(2, minmax(0, 1fr))` (`homepage/page.tsx`) — the same shape `finance/page.tsx` and `AdminShell`'s
   content column already use.
   **Measured before → after (same harness, same data, `%TEMP%\rrs-admin2\`, `audit-before.json` kept):**
   `/admin/homepage` **140 → 0 px** at 1440, and **0** at 834/390; every other captured route 0 throughout.
   One wrong attempt is worth recording: pinning the *page-root* grid measured **worse** (158 px), because
   the inner card grid still painted 1241 px while only an ancestor's box shrank. The admin half of the
   harness needed the Batch 8 dev-only sign-in helper — OCT-28, now resolved.

High:

5. **The panel's whole muted-text tier fails contrast, plus the status chips and destructive buttons.**
   ✅ **DONE (2026-09-30, Batch 4).** Every sub-finding had one of two code-level causes, and both are fixed
   in the theme:
   - **The muted tier** (`alpha(parchment, 0.52)` module descriptions at 4.06:1, `parchmentMuted` stat labels
     at 3.46:1): covered by §8.3's single floor — the sweep raised all 151 sub-floor text colours to
     `alpha(parchment, 0.62)`, so `AdminShell`'s module descriptions (measured against the sampled card
     backdrop `(27,21,15)`) now sit well above 4.5:1, and the guard test keeps them there. The same change
     covers the panel exactly as the item predicted ("one theme/token change covers both surfaces").
   - **The chips and destructive buttons** (`Pending` **1.84:1**, `Delete` **2.5:1**): MUI was deriving
     `contrastText` for `warning`/`error`/`success`/`info` with a 3:1 threshold, which is why a filled
     `Chip color="warning"` painted **white** on `#C97B22` (3.31:1 — the two `Pending` chips in
     `/admin/abandoned-carts` and `Locked` in `/admin/schedule`). The palette now pins `contrastText`
     explicitly for all four semantics (`warning` → `#0C0A07` at 5.97:1, the rest white at ≥4.7:1) and adds a
     **text-safe `light` tone** per semantic for outlined/text use (`error.main` is only 3.48:1 as text on a
     card), with `textError`/`outlinedError` button overrides routed through it — so the destructive *text*
     buttons in the catalog pages are readable without touching each site.
   **Also in this item's spirit:** `Delete`'s white-on-`#CF4040` is 4.71:1 and passes; the sub-4.5 number in
   the audit came from the *outlined/text* rendering, which is what the `light` tones now fix.
   **Residual:** the item's "banner labels 4.15–4.28:1" sub-finding is not attributed to a specific element in
   the findings doc, and this environment has no browser (see `OCT_IMPLEMENTATION_PLAN.md` → OCT-19), so it
   needs a re-measure rather than a guess. Filed there rather than claimed here.
6. **No `main`, no `nav`, no announced current page.** ✅ **DONE (2026-09-30, Batch 2).** Landmarks used to
   measure `header 1 / aside 1 / section 1 / main 0 / nav 0 / footer 0` on all 69 captures, the 12 module
   links sat in an unnamed `aside` with **no `aria-current`**, and the active state — colour-only
   (`borderColor rgba(196,146,26,0.45)`, `backgroundColor rgba(196,146,26,0.12)`) — **vanished** on nested
   catalog routes because the check was `pathname === mod.href`. **Fix:** the rail is
   `component="nav" aria-label="Admin modules"`, each link carries
   `aria-current={active ? 'page' : undefined}`, and the active module is resolved by a new pure helper,
   `resolveActiveAdminHref()` in `src/lib/admin/module-nav.ts` (`src/lib/admin/module-nav.test.ts`, 9 cases).
   **Deviation from the item's suggested fix, deliberate:** the plan proposed
   `pathname === href || pathname.startsWith(href + '/')`, but `/admin` is itself a module, so that rule lights
   up Dashboard *and* the real module on every panel route. The shipped rule is **longest match** — the active
   module is the longest href the path equals or is nested under — which keeps `/admin/catalog/products/<id>`
   on Catalog and `/admin/orders` on Orders. The `main` half of this item is §9.3's one-attribute fix. Guard:
   `src/components/admin/admin-shell.contract.test.ts` (asserts the landmarks, `aria-current`, the helper
   import, and that the old `pathname === mod.href` comparison cannot come back).
7. **Nameless controls everywhere.** ✅ **DONE (2026-09-30 Batch 5 + 2026-10-01 Batch 11).** Fixed in this batch:
   - **the 17 `MuiSwitch-input` toggles** on `/admin/homepage` — one `inputProps={{ 'aria-label': `${meta.title} — show on homepage` }}` on the single switch rendered per `SECTION_ORDER` key *is* the 17 controls. `inputProps` is deliberate: a bare `aria-label` lands on MUI's root span, while the audit's finding was about the `<input>` itself.
   - **the four 26×26 reorder/hide/remove icon buttons** in the tile editor, now `Move tile N up` / `down` / `Hide|Show tile N` / `Remove tile N` (`Tooltip` is a description, not a name).
   - **the header search input** (one fix covering all 23 routes) — `aria-label="Search orders, products and custom requests"`.
   - **14 filter selects** — the item's named scope: orders ×4, catalog products ×2, inventory ×3, finance ×2, catalog pricing ×2, product detail ×1 (the last reached anyway while adding its `h1`).
   **Remaining — 16 of the panel's 30 `<Select>` elements** still have no accessible name, enumerated exactly so the next pass is mechanical: `catalog/products/new/page.tsx:174`; `catalog/products/[id]/page.tsx:699,744`; `catalog/products/[id]/builder/page.tsx:1056,1422,1492,1720,1786,1967,2049`; `catalog/products/[id]/pricing/page.tsx:323,372`; `custom-requests/page.tsx:437`; `schedule/page.tsx:406,604`; `shipping/debug/page.tsx:145`. Tracked as `OCT_IMPLEMENTATION_PLAN.md` → OCT-20 (they are outside this item's named files, and a guard test for selects would fail until all 16 land).
   The item's count note stands: **17** is structural (one bare `<Switch>` per `SECTION_ORDER` key), not 15.
8. **No regression test for the §9.1 key contract.** ✅ **OBSOLETE — CLOSED (2026-10-01, Batch 8).**
   The test this asked for would sign a payload the way `session.ts` did and assert the Edge verifier accepts
   it. §10.5/§10.10 deleted that signing implementation *entirely* — there is no longer a second signing
   implementation to keep in step, which retires the §9.1 bug class outright (a Supabase JWT has one
   implementation). Writing a test for deleted code would be worse than no test, so the item is marked
   OBSOLETE rather than DONE. Decision recorded in `OCT_IMPLEMENTATION_PLAN.md` → OCT-10 (resolved).

Medium:

9. **On a phone the panel spends 906 px on chrome before content.** ✅ **DONE (2026-10-01, Batch 11).** At 390×844 the sticky
   `header` is 118 px and the module rail was 788 px, so the content `section` started at **y = 943** — all 12
   modules stacked above the page below `md`. The rail is now hidden below `md` (`display: { xs: 'none', md: 'block' }`)
   and rendered in a left `Drawer` instead, opened by a button in the content area that shows the current module
   (`"Open modules menu — currently {activeModuleLabel}"`). The module list is extracted to a single
   `moduleNavItems` variable shared by the sidebar and the Drawer so the two cannot drift apart. Guarded by three
   new source-contract cases in `admin-a11y.contract.test.ts` (rail hidden below md, one `Drawer` + single-source
   list, trigger named with the current module).
10. **One `<title>` for 23 routes, and a hard-coded header label.** ✅ **DONE (2026-09-30, Batch 5).**
    **Header label:** the sticky bar now renders `{activeModuleLabel ?? 'Admin Dashboard'}`, resolved by
    `activeAdminModuleLabel()` (`src/lib/admin/module-nav.ts`, 3 new test cases) — the *same* helper that marks
    the active rail entry, so the bar and the rail cannot disagree.
    **Title:** the shell sets `document.title = "<Module> | Ruby's Relics Studio"` on every route change, so
    tabs/history/bookmarks are now distinguishable — which is the concrete symptom the item filed.
    **Resolved (2026-10-01, Batch 11):** the title is now server-rendered per module segment too —
    `ADMIN_MODULES` + `adminModuleMetadata()` in `src/lib/admin/admin-modules.ts` feed 11 `layout.tsx` files
    (plus the dashboard `page.tsx`), so the pre-hydration `<title>` matches the post-hydration one and the
    root default no longer flashes. The admin tree is still `noindex, nofollow`. See `OCT_IMPLEMENTATION_PLAN.md`
    → OCT-20 for the record.
    Guard: `src/components/admin/admin-a11y.contract.test.ts` asserts the header is derived (and that a literal
    "Admin Dashboard" cannot return) and that exactly one resolver call exists.
11. **Heading structure is absent or inconsistent on 23/23 routes.** ✅ **DONE (2026-09-30 Batch 5 + 2026-10-01 Batch 11).**
    **Fixed:** the five routes with no `h1` now declare one on their own title text —
    `/admin/schedule` and `/admin/abandoned-carts` (`variant="h5" component="h1"`),
    `/admin/shipping/debug` (`component="h2"` → `"h1"`), product detail and product pricing (a new `h1` above
    the editor). And every level skip is closed: the **10** `variant="h6"` sections in
    `/admin/homepage` (×4), product detail (×2), product pricing (×2) and `/admin/shipping/debug` (×2) now set
    `component="h2"`, so nothing jumps `h1` → `h6` any more. Root cause of those `h6`s was §8.7 — ✅ fixed
    above, and `product detail starts at h6` is therefore resolved as well.
    **Not done — the sizing half:** the `h1` still renders at 30 / 24 / 20 px across routes (each page
    overrides `fontSize` inline, so a theme edit cannot unify it). That is a consistency nit rather than a
    WCAG failure and it is a *visual* claim I cannot verify here, so it is filed as
    `OCT_IMPLEMENTATION_PLAN.md` → OCT-21 instead of half-fixed. Guard for the levels:
    `src/components/admin/admin-a11y.contract.test.ts` (asserts the five `h1`s and that no bare `h6` returns).
12. **Disabled actions still look like the live gold action.** ✅ **DONE (2026-09-30, Batch 4).** Both halves of
    the item:
    **(a) the token** — `Apply to 0 selected` (`/admin/inventory`) kept the gold `background-image` with a
    30 %-white label at `opacity: 1`, and `Add Media` / `Upload file` were 30 %-white on a card. §8.1's
    `&.Mui-disabled` token now covers both surfaces: `MuiButton` (all variants, incl. the
    `containedPrimary` gradient stop and the 5.6:1 muted label) and the new
    `MuiIconButton.styleOverrides.root['&.Mui-disabled']` for the icon-only actions. One theme edit, no
    call-site changes, and the ratios are asserted in `src/theme/theme.test.ts`.
    **(b) the label** — the audit's own recommendation ("say *why* a control is disabled rather than only
    restyling it") is now implemented on `/admin/inventory`: the button reads
    `Apply to 0 selected — select rows first` at zero selection, instead of a near-invisible
    "Apply to 0 selected".

Low:

13. **Empty states and notices are emitted as duplicated `role="alert"`.** ✅ **DONE (2026-10-01, Batch 11).** Each string
    renders twice (`No orders matched the current filters.`, both inventory messages, the Shippo test-mode
    notice, the shipping-debug warning), so an assertive live region interrupts twice for static content —
    render once, as plain text or `role="status"`.

Follow-ups filed on the 2026-09-24 re-read (same evidence set, source-verified):

14. **(High, a11y) Nine catalog routes ship a nameless icon-only back link — and on six of them it is a
    full-width target.** ✅ **DONE (2026-10-01, Batch 11).** `catalog/{products,categories,processes,future-products,`
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
15. **(Low) `/admin/finance`'s "Labor Stage Breakdown" card has no empty state.** ✅ **DONE (2026-10-01, Batch 11).**
    `finance/page.tsx:400-420` renders the card heading and then an unconditional `finance.laborByStage.map(...)`
    — no `length === 0` branch, unlike its two siblings (`:370` guards `itemContributions` with "No contribution
    rows for this range.", and the recent-labor card is guarded as well). With zero labor rows the card is a
    silent blank box: in the 2026-09-24 capture it collapses to its title (~70 px) while `Item Contribution View`
    beside it shows title + column headers + empty-state line (~115 px). This is the single exception to
    Part 2 §1.3's honest empty states. Fix: a `laborByStage.length === 0` branch in the muted tier
    (`alpha(parchment, 0.55)`, ≥12px per §9.5's floor).
16. **(Low) `/admin/custom-requests`: the primary toolbar CTA wraps to three lines.** ✅ **DONE (2026-10-01, Batch 11).** The
    toolbar is a 4-control `Stack` (`custom-requests/page.tsx:426`) and the "Run Recovery Reminders" button
    (`:454-460`) sets no `whiteSpace: 'nowrap'` / `minWidth`, so at 1440 px it renders as "Run / Recovery /
    Reminders" on three lines, ≈93 px tall beside 53 px siblings
    (`01-custom-requests-00-desktop-tile-01.png`). Its label also swaps to "Sending reminders..." while
    running, so the toolbar's height changes mid-action. Fix: `whiteSpace: 'nowrap'` + a `minWidth`, or shorten
    the label and carry the count elsewhere.
17. **(Low) `/admin/custom-requests`: request cards are titled with a raw UUID.** ✅ **DONE (2026-10-01, Batch 11).**
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

**Status: ✅ COMPLETE except one environment step and two decisions.** §10.8–§10.12 and §10.14–§10.15
landed on 2026-09-26, so of the fifteen build/removal items **fourteen are ✅ and one (§10.13) is 🟡** — its
repository half is done, and only the corresponding Vercel environment variables are outstanding (they need
dashboard access). The retired stack is gone in code *and* in the database: the file set was deleted (MFA
store, three endpoints, challenge page, custom session module, its two routes, the deprecated `AALGuard`,
`fingerprint.ts`), and `admin_mfa_codes` (1 row), `exp_admin_sessions` (28 rows) and
`cleanup_expired_mfa_codes()` were dropped after a JSON copy-out to `%TEMP%`. Verified after the removal:
`grep -ril "mfa" src/` returns only documentation of the removal, `npm run type-check` clean, **34 files /
228 tests** green, `npm run build` succeeds with `/admin/login` and `/admin/not-authorized` the only admin
entry routes, `npm run lint` unchanged at its 9 pre-existing errors, and `npm run test:security:rls` passes.
Still open: §10.16 (is a *second* factor wanted at all?) and §10.17 (per-session management).

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

8. **§10.8 Delete the MFA code store and its endpoints.** ✅ **DONE** — deleted 2026-09-26. `src/lib/admin/mfa-store.ts`
   (66 matching lines: `createMFACode:107`, `verifyMFACode:80`, stored-code hashing keyed off
   `MFA_CODE_HASH_KEY_SEED:33`), `src/app/api/admin/send-mfa/route.ts` (Resend email delivery + a
   `verifyAdminSessionToken(sessionToken, adminKey, false)` pre-check at `:30`),
   `src/app/api/admin/verify-mfa/route.ts` (re-mints a second session token with `mfaFlag='1'`),
   `src/app/api/admin/mfa-debug/route.ts` (a production-reachable endpoint that probes the MFA table and
   reports env presence), and `src/app/api/admin/verify-mfa/route.test.ts` (13 MFA references). Also delete
   `src/lib/fingerprint.ts` — its header states it exists "for MFA verification" (`:2`) and its only consumer
   is the MFA page. §1.4 (dead `ip` fallback) is closed by deletion rather than by repair.
   **Deleted (2026-09-26):** the five files above, `src/lib/fingerprint.ts`, and the empty
   `src/app/api/admin/debug-totp/` directory a TOTP experiment had left behind. One correction while
   deleting: `mfa-debug` was **not** production-reachable — `route.ts:30-37` returned `403` whenever
   `isProd()`, so its exposure was dev/preview only. `grep -ril "mfa" src/` now returns only this
   documentation, the "no longer exempt" assertions in `edge-gate.test.ts`, and the unrelated
   `failClosed` comment at `lib/rate-limit.ts:87`.
9. **§10.9 Delete `/admin/mfa-challenge`.** ✅ **DONE** — deleted 2026-09-26, together with its Edge exemption (the exemption list is now just `/admin/login` + `/admin/not-authorized`, asserted by `edge-gate.test.ts`). `src/app/admin/mfa-challenge/page.tsx`
   (197 lines: `send-mfa` at `:57`, `verify-mfa` at `:85`, fingerprint collection at `:28`, countdown,
   `router.push('/admin')` at `:105`), its middleware exemption (`middleware.ts:180`) and the
   `redirect('/admin/mfa-challenge?next=…')` target in `auth.ts:124`. Nothing else links to it once §10.4 and
   §10.6 land.
10. **§10.10 Delete the custom admin session system.** ✅ **DONE** — deleted 2026-09-26. `src/lib/admin/session.ts` in full:
    `ADMIN_COOKIE_NAME:6`, `SESSION_VERSION='v2':10`, `createAdminSessionToken`, `verifyAdminSessionToken:117`,
    `revokeAdminSession`/`revokeOtherAdminSessions`/`listAdminSessions:188-246`, `extractJtiFromToken:251`,
    `extractMfaFlagFromToken:263`, `getAdminSessionMaxAgeSeconds:270`, and the HKDF seeding from
    `SESSION_SIGNING_KEY_SEED` / `SESSION_HASH_KEY_SEED`; plus `src/lib/admin/session.test.ts`. Then
    `/api/admin/session`: preferably delete the route and point `AdminShell.tsx:155` at the Supabase client's
    `signOut()`, because that is what finally makes the panel's "Sign out" a real revocation (§1.6); keeping
    it as a thin wrapper is the alternative. Delete `/api/admin/sessions` outright — it lists and revokes
    `exp_admin_sessions` rows and has **no UI caller** (only its own file matches: `sessions/route.ts:47,66`),
    so it is dead authenticated surface.
    **Deleted:** `src/lib/admin/session.ts` (+ `session.test.ts`), `src/app/api/admin/session/`
    (+ its test), `src/app/api/admin/sessions/`, the three orphaned helpers in `lib/admin/auth.ts`
    (`getExpectedAdminKey`, `hasValidAdminKey`, `extractAdminSessionToken`), and `AdminShell`'s
    sign-out now calls the Supabase client's `signOut()` — **which closes §1.6**: signing out
    revokes the refresh token instead of merely blanking a cookie. `/api/admin/session` was kept
    *out* of the Edge exemption list in the same change, so no unauthenticated path to it remains.
11. **§10.11 Delete the deprecated client guard.** ✅ **DONE** — `src/components/admin/AALGuard.tsx` deleted 2026-09-26; it had 16 matching lines, was imported nowhere, and still shipped a client-side `fetch('/api/admin/session')` guard. No client-side guard that makes an auth decision remains.
    (16 matching lines) is self-declared `@deprecated` and imported nowhere (`:1-9`) yet still ships a
    client-side `fetch('/api/admin/session')` guard and a `/admin/mfa-challenge` push (`:39,47,89`). Any
    client-side guard that survives should read `useAuth()` for display only and never make an auth decision.

### 10.12–10.15 — Database, config & docs

12. **§10.12 Drop the MFA and custom-session tables.** ✅ **DONE** — dropped live 2026-09-26. One migration dropping
    `admin_mfa_codes` (created `040_admin_mfa_codes.sql:5`, extended by `041_admin_mfa_challenge_token.sql:11-23`)
    together with its `cleanup_expired_mfa_codes()` function (`040:29-38`), and `exp_admin_sessions`
    (`045_admin_sessions.sql:10`, defensively re-created in `048_missing_schema_fixes.sql:103` and
    `049_Migration_1.sql:1250`). Live row counts measured 2026-09-26, before anything is dropped:
    **`admin_mfa_codes` = 1 row, `exp_admin_sessions` = 28 rows** (re-check immediately before the `DROP`; the
    session count grows on every login until §10.10 lands). Then update `docs/Database.md`, which is the
    canonical schema reference and still documents both tables.
    **Executed:** the rows were copied out first (JSON, outside the repo — `%TEMP%\rrs-admin-auth-tables-backup-2026-09-26.json`),
    then `drop table if exists public.admin_mfa_codes`, `drop table if exists public.exp_admin_sessions`
    and `drop function if exists public.cleanup_expired_mfa_codes()` were run through `db query --linked`.
    Verified afterwards: **0** of the two tables remain, the function is gone, `pg_cron` is not installed
    (so no scheduled job referenced it), and no FK pointed at either table. Both `docs/Database.md`
    sections were removed with the tables. Note: migration `040`/`041`/`048`/`049` still *create* these
    objects — that is the historical record and stays; dropping them is a manual step until §1.1's
    migration history is baselined.
13. **§10.13 Environment and test-seed cleanup.** 🟡 **PARTIAL** — the repository half is done
    (2026-09-26); the Vercel half is outstanding. Remove `ADMIN_LOGIN_KEY`,
    `ADMIN_MFA_EMAIL`, `MFA_CODE_HASH_KEY_SEED`, `SESSION_SIGNING_KEY_SEED`, `SESSION_HASH_KEY_SEED` and
    `ALLOW_LEGACY_ADMIN_SESSION_FALLBACK` from `.env`, `.env.example`, the Vercel environments (all three) and
    the `src/test-setup.ts` seeds. `ADMIN_TOTP_SECRET` is *already* stale: it is set in `.env` but nothing
    reads it (there is no `debug-totp` route — only `mfa-debug`), so delete it too. This closes the seed half
    of §1.2, leaving only that item's `NEXT_PUBLIC_SITE_URL` gap — which the Google OAuth `redirectTo` needs
    anyway, so fix both together.
    **Done:** all seven variables removed from `.env` (local) and the five that appeared there removed
    from `.env.example`, whose admin section now points at the allow-list instead;
    `src/test-setup.ts` reduced to an empty setup entry point; `scripts/generate-totp-secret.js` deleted
    (it was the only remaining producer of `ADMIN_TOTP_SECRET`, which is why that variable looked
    orphaned-but-not-quite in the §10 review). **Outstanding:** the same variables still exist in the
    three Vercel environments — that needs dashboard access (`npx vercel env rm <name> production`), and
    until it happens production keeps inert secrets. `NEXT_PUBLIC_SITE_URL` is now set locally and still
    needs to be set to the production origin in Vercel.
14. **§10.14 Dependency sweep.** ✅ **DONE** — `bcryptjs` removed 2026-09-26. `bcryptjs` (`package.json:29`) has **zero** usages in `src/`
    or `scripts/` (verified by grep) — it was the password hasher for the customer accounts removed in
    `042_remove_customer_accounts.sql`, so this switch is the moment to drop it. Re-run
    `npm audit --audit-level=high` afterwards; §1.5's `@xmldom/xmldom` high advisory is separate and remains.
    **Verified:** `npm uninstall bcryptjs` removed it from `package.json` and the lockfile, and
    `git grep -i bcrypt` returns nothing. `npm run audit` still reports exactly one high advisory
    (`@xmldom/xmldom`, 4 GHSA entries) — unchanged, as expected, and still tracked by §1.5.
15. **§10.15 Test-suite rework (ships with §10.3–§10.5, not after).** ✅ **DONE** — the additions landed
    2026-09-26 and the deletions followed in the same commit as the code they covered.
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
    **Deleted with their code (2026-09-26):** `session.test.ts`, `verify-mfa/route.test.ts` and
    `session/route.test.ts`. Tests went out with the code they covered, which is why they were not deleted
    in the earlier commit. Suite after the removal: **34 files / 228 tests, green**, with
    `auth-route-pattern.test.ts` still passing and still asserting that every route using
    `requireAdminApiSession` checks `!auth.ok`.

### 10.16–10.17 — Deferred decisions

16. **§10.16 Do we want a second factor at all?** ✅ **DONE (2026-10-01, owner decision: mandatory TOTP,
    manual secret key, no QR).** Built end-to-end:
    - **Claim layer** — `AuthClaims.aal` + `hasAal2()` (`src/lib/auth/claims.ts`), so the JWT's `aal` claim is
      the single source of truth.
    - **Gate** — `requireAdminApiSession` returns `401 { code: 'mfa_required' }` and
      `requireAdminPageSessionOrRedirect` redirects to `/admin/mfa` for any admin at `aal1`; a new
      `requireAdminPageMfaSessionOrRedirect` gates the challenge page itself (role + allow-list, no AAL) so it
      cannot loop. The Edge gate stays role-only — the authoritative AAL check lives in Node only, keeping the
      §9.1 "two divergent implementations" risk out of it.
    - **Page** — `/admin/mfa` + `AdminMfaView`: enrol (show the base32 **secret as text**, no QR, confirm a
      code) or challenge (just the code) via `supabase.auth.mfa.*`.
    - **Harness** — `escalateToAal2()` + `generateTotpCode()` (RFC 6238-verified) let `/api/dev/session` mint
      an `aal2` session (enrol once → challenge → verify with a generated code), so the visual-audit harness
      keeps working under mandatory MFA.
    - **Recovery** — `scripts/reset-admin-mfa.mjs` (`npm run admin:reset-mfa`) deletes enrolled factors with
      the service role, so a lost authenticator cannot permanently lock the owner out.
    - Tests: claims (9), TOTP RFC vectors (5), gate matrix (22, incl. aal1 → 401/redirect and the MFA-page
      gate), escalate (4) + a 502 escalation-failure route case. **Suite 57 files / 406 tests, type-check /
      build / eslint clean.**
    - **Not yet live-verified** (needs the owner to enrol on a real sign-in): the enroll→challenge round trip
      and the helper's `aal2` minting against Supabase. The gate is code-complete but the first real sign-in
      after deploy is the true smoke test.
17. **§10.17 Is per-session management needed?** ✅ **DONE (2026-10-01, owner decision: "sign out everywhere
    except this device is enough").** Built the smallest form of it: `AuthProvider` now exposes
    `signOutOthers()` → `supabase.auth.signOut({ scope: 'others' })` (revokes every refresh token except the
    current one), and `AdminShell`'s header has a "Sign out other sessions" button wired to it — no
    session-list UI, which the owner explicitly did not want. Guarded by
    `src/components/auth/auth-provider.contract.test.ts`.

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

*(OCT #67, 2026-10-10.)* Clearing `is_active` alone is **not** enough for a break-glass removal, because the
claim keeps refreshing: the edge gate reads only the claim, and client-side navigation skips the `(panel)`
layout's DB check, so the dashboard's RSC payload stays reachable for as long as the token keeps rotating —
unbounded, not just for one access-token lifetime. A break-glass removal is therefore three steps:

1. `npm run admin:revoke -- <google-email>` — deactivates the allow-list row **and** clears
   `app_metadata.role`, so the edge gate stops admitting the account.
2. Delete the live sessions with the service role:
   `delete from auth.sessions where user_id = '<auth.users.id>';` (a refresh token keeps its `aal2` level, so a
   session that survives the revoke is still an MFA-satisfied admin credential).
3. Confirm: the account's `/admin` request lands on `/admin/not-authorized` and `/api/admin/*` answers `401`.
   Server pages that read data call `requireAdminPageSessionOrRedirect()` themselves (OCT #67), so no route
   depends on the layout having run.

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


