# October Implementation Plan — issues & todos

Companion to `SEPT_IMPLEMENTATION_PLAN.md`. **This file carries issues and todos only**; shipped work and
status changes belong in the September plan (which is the single source of truth for open work). Items are
numbered `OCT-n`, and each names the batch it belongs to.

Execution model: the September plan is executed in small, test-covered batches. Batch 1 (§7.1 + §7.6) is
recorded in `SEPT_IMPLEMENTATION_PLAN.md` → "Batch execution log".

---

## 1. Issues found during execution (Batches 1–2)

### Batch 1

### OCT-1 — `/api/admin/*` answered `307` instead of `401` whenever the session refresh threw. **FIXED (Batch 1).**

- **Where:** `src/proxy.ts` (formerly `src/middleware.ts`), admin deny branch.
- **What happened:** `decision` was initialised to `'redirect-login'` and the `catch` around
  `refreshSupabaseSession()` only logged, so when Auth was unreachable (or Supabase env was unset) an API
  request fell through with the *page* decision and got `307 → /admin/login` with an empty body — while
  `decideAdminEdgeAccess(null, '/api/admin/orders')` would have said `unauthorized-api`. §10.5's own
  verification checklist asserts `401 {"error":"Unauthorized"}` for `/api/admin/*`, so the failure path
  contradicted the documented contract: fail-closed, but not fail-*shaped*, and unparseable for any client.
- **Fix:** the `catch` now calls `decideAdminEdgeAccess(null, pathname)` (fail closed *and* in the
  caller's shape), and logs through `safeLogError` (SEC-026) instead of bare `console.error`.
- **Coverage:** `src/proxy.test.ts` → "fails closed, and in the caller's shape, when Auth is unreachable
  (OCT-1)" asserts `401` + the JSON body for an API path and `307 → /admin/login` for a page, both with the
  CSP decorations intact.
- **Residual risk:** none known. The branch still cannot distinguish "no session" from "Auth down" in the
  response — deliberately, so the denial shape is uniform.

### OCT-2 — the extracted CSP builder dropped the `script-src` directive name. **FIXED before commit (Batch 1).**

- **What happened:** the first version of `buildCspHeader()` emitted the script source list without its
  directive name (`default-src 'self'; 'self' 'unsafe-eval' 'nonce-…' …`). Browsers ignore a part with no
  directive name, so `script-src` would have fallen back to `default-src 'self'` and Next.js's own inline
  bootstrap scripts would have been blocked on **every** route — the exact "presents as an unhydrated page"
  failure mode §7.6 warned about, and invisible to `tsc`.
- **How it was caught:** the new `src/lib/security/csp.test.ts` failed on its first run (5 of 11 cases)
  before `src/middleware.ts` was touched.
- **Guard now in place:** a dedicated case ("emits well-formed directives — every source list keeps its
  directive name") plus a lookup helper that throws when `script-src` is absent, rather than silently
  comparing against `undefined`.
- **Lesson for later batches:** extract + test the pure piece *before* deleting the old implementation, so
  the failure surfaces in the test file and not in a browser console.

### Batch 2

### OCT-3 — the panel had no `main` landmark and no announced current module. **RESOLVED (Batch 2).**

- **Filed as:** §9.3 + §9.6 in the September plan; items 3 and 6 of the admin-panel pass.
- **Fixed:** the shell's content column is `component="main" id="main-content"` (which is also the target
  `SkipToMain` has always pointed at — the two halves were one attribute), the rail is
  `component="nav" aria-label="Admin modules"`, and each link sets `aria-current={active ? 'page' : undefined}`.
- **Plan deviation, deliberate:** the item proposed `pathname === href || pathname.startsWith(href + '/')`
  for the active test. Because `/admin` is itself a module, that rule marks Dashboard *and* the real module on
  every panel route. Shipped instead: `resolveActiveAdminHref()` (`src/lib/admin/module-nav.ts`) resolves the
  active module by **longest match**. 9 unit cases incl. `/admin/catalog/products/<id>/builder` → Catalog,
  `/admin/orders` → Orders (not Dashboard), trailing slashes, nested-module preference and empty input.
- **Verification:** `src/lib/admin/module-nav.test.ts` (9), `src/components/admin/admin-shell.contract.test.ts`
  (3 — landmarks, `aria-current`, helper import, and that the old comparison cannot return), type-check +
  build clean, live `/` still serves `main#main-content` with 0 nonce-less scripts.
- **Residual:** the panel's own pages cannot be captured in this environment (no authenticated session since
  §10 removed the dev-token method), so the shell markup is verified by contract test + build rather than by a
  live DOM probe. Re-run the audit's `UI_AUDIT.md` §15 harness where an admin session is available.

### OCT-4 — the consent banner rendered inside the panel and its `Accept` label failed contrast. **RESOLVED (Batch 2).**

- **Filed as:** §9.2 (panel) and §8.2 (storefront) — one defect, two blast radii.
- **Fixed:** (a) the banner now asks `shouldShowCookieBanner(pathname)` and returns `null` for `/admin`
  and everything under it, so the 87 px bar can no longer sit over the module rail; (b) the `Accept` button is
  a plain `variant="contained" color="primary"` — no colour override — so its label is the theme's
  `primary.contrastText` (`#0C0A07`), and the two text actions moved off the stray `#999` onto
  `parchmentMuted`; (c) all three actions share `bannerActionSx` (`minHeight` 44 px on phones) instead of
  measuring 31 px; (d) while the bar is up it sets `scroll-padding-bottom: 104px` on `<html>`, so a field can
  no longer be scrolled/focused *underneath* it.
- **Verification:** `src/lib/cookie-consent.test.ts` (4 — incl. `/administrator` and `/shop/admin` negatives),
  `src/components/common/cookie-banner.contract.test.ts` (5), and `src/theme/theme.test.ts` (3), which
  computes the ratio: the label vs the lightest gradient stop is ≥4.5:1 and the old white-on-gold pair is
  asserted to be **under 3:1**, so the measurement lives in the suite instead of in a screenshot.
- **Residual — read this before calling the overlap fixed:** (d) mitigates the overlap, it does not remove it.
  The bar is still `position: fixed`, so it visually covers the last strip of the page; what is fixed is that
  focus/scroll can no longer land under it. Reserving layout height instead would change the storefront's
  bottom spacing on every page, so it is a deliberate tradeoff — a future audit should decide whether the
  pixel-level overlap still matters. §8.2's own text records the same caveat.

---

## 2. Open issues / todos, by batch

### Batch 2 — shipped; one testing decision recorded

- **OCT-5 (decision taken) — no jsdom harness; pure predicates + source-contract guards instead.**
  There is no render harness in this repo (`vitest` runs `environment: 'node'` with
  `include: ['src/**/*.test.ts']`), and Batch 2's changes are attributes on an MUI component that no
  node-environment test can render. Options were (a) add jsdom + a React render harness, (b) assert source
  contracts and extract the decisions into pure functions. **Chose (b)** — it matches how this codebase
  already guards non-renderable behaviour (`src/lib/admin/auth-route-pattern.test.ts` reads route sources) and
  adds no dependency; the new shared helper `src/lib/testing/source-contract.ts` keeps those guards honest by
  stripping comments before a negative assertion.
  **What this still cannot do, and what must change before it bites:**
  - **pixel-level contrast** (Batch 4's §8.1/§8.3/§9.5/§9.12) cannot be verified this way — the numbers in the
    plan came from live sampling. The theme test computes ratios from *values*, which catches a wrong token but
    not a wrong composite (e.g. `opacity` over a gradient). Batch 4 should either stand up the CDP capture
    harness described in `UI_AUDIT.md` or accept a manual browser pass, and say which in the plan.
  - **§9.4's acceptance test is a layout measurement** (`scrollWidth − clientWidth`): decide the measuring tool
    *before* attempting that item, because a source-level "fix" cannot be shown to work.
  - **the authenticated panel cannot be probed here** (the §10 cutover removed the dev-token method), so panel
    DOM claims need either a preview deployment + a real admin session or the audit harness.

### Batch 3 — shipped

### OCT-6 — homepage-section writes silently no-opped for keys with no DB row. **RESOLVED (Batch 3).**

- **Filed as:** §7.3 (Critical, data integrity). The plan's diagnosis was exact: `.update().eq('section_key', …)`
  in five `[key]` branches plus the batch path, none of them asking for the written rows back, and PostgREST
  reports no error when an update matches nothing.
- **Live evidence (read-only, `supabase db query --linked`, 2026-09-30):** `exp_homepage_sections` holds 16 rows
  and **neither** `shop_all_preview` **nor** `future_products_notify` is among them — the two keys whose saves
  returned `{ok:true}` with a success audit entry and stored nothing.
- **Fixed:** one write path, `saveHomepageSection()` (`src/lib/homepage/section-write.ts`):
  `update().eq().select('section_key')` → if 0 rows came back, `upsert(…, { onConflict: 'section_key' })` with
  the section's default order → if *that* returns no row, a **failure** (500 + failure audit). Callers now
  answer `{ok:true, created}` and the audit entry records `created`.
- **Two extra safety rules, both from reading §7.2 ahead:** `sort_order` is never written on the update path
  (it would undo an admin's ordering), and a visibility-only toggle never sends `content` (it would wipe it).
  Both are regression-tested.
- **Supporting artifact:** `src/lib/homepage/sections.ts` — the section key list (previously duplicated inside
  both routes, and they had already drifted from nothing but a comment) plus
  `DEFAULT_HOMEPAGE_SECTION_ORDER`, which is also the value table §7.2 needs. New rows cannot inherit
  `sort_order = 0` and jump to the top of the homepage.
- **Verification:** 43 files / 294 tests green (was 41/272), `type-check` clean, `build` clean, `eslint` clean.
  New coverage: `section-write.test.ts` (8), `sections.test.ts` (6), and §7.3 cases in both route suites
  (create-on-missing-row, `created:false` on update, 500 + failure audit when nothing is written, and
  "0-row match is not a success").
- **Residual:** the end-to-end PATCH still needs an authenticated admin session, which this environment does
  not have, so the proof is the mocked-chain route tests plus the live absence check. No production write was
  performed — deliberately.
- **Follow-on now unblocked:** §3.4 (Shop All Preview / Future Products editors) and §7.9's own defaults work.

- **OCT-7 — §7.4 + §7.5 announcement banner. SUPERSEDED by Batch 6 (`OCT-10b`); the code half is done.**
  The banner is now CMS-driven (no `STATIC_FALLBACK`) and renders only on an active row. The parts that remain
  are the ones requiring a database write or a live read, split out as **OCT-22** (admin switch + the duplicate
  active row) and **OCT-23** (verify the Footer's drinkware slug before repointing it).

### Batch 4 — shipped

### OCT-8 — disabled CTAs, the muted-text floor and the semantic chips all failed contrast. **RESOLVED (Batch 4).**

- **Filed as:** §8.1 (disabled primary CTAs), §8.3 (muted-text floor), §9.5 (the panel's muted tier, `Pending`
  chips, destructive buttons), §9.12 (disabled actions still looking live).
- **The unifying insight:** all four had *two* causes only — a token that was too dim, and a **composite** the
  audit could only see in pixels (`opacity` over a still-painting gradient; MUI deriving `contrastText`).
  Fixing both in the theme meant one change per cause instead of ~20 per-site edits.
- **Fixed:**
  - `MuiButton...containedPrimary['&.Mui-disabled']` → `background: 'none'`, `backgroundColor: BG_ELEVATED`,
    label `alpha(parchment, 0.62)`, inset ring, hover neutralised; root token `opacity: 1` + muted label;
    `outlinedPrimary` aligned; new `MuiIconButton` disabled floor (§9.12).
  - `MIN_MUTED_TEXT_ALPHA = 0.62` + a mechanical sweep of **151** sub-floor text colours in **45** files.
  - `error`/`warning`/`success`/`info` now carry explicit `contrastText` and a text-safe `light`;
    `textError`/`outlinedError` use it; `brandTokens.rubyRedText` replaced the 7 literal `#CF4040` text uses.
  - `/admin/inventory`'s disabled bulk button now states the precondition (`— select rows first`).
- **Evidence:** `src/theme/theme.test.ts` (14 cases) resolves alpha over the real surface and asserts the
  old pairings fail; `src/theme/contrast-floor.test.ts` (3) fails on any new sub-floor text colour. ESLint on
  the 59 touched files reports 16 problems, **none on a line this batch changed** (checked mechanically).
- **Residuals, filed rather than glossed:**
  - **Contrast was verified as *computed* composites, not sampled pixels.** (An earlier version of this entry
    blamed a missing browser — that was **wrong**, see OCT-19's correction.) The values are right by
    construction, but a pixel pass would confirm the composite end-to-end; OCT-25 tracks that follow-up.
  - §8.1's `aria-describedby` caption link is a `ProductConfigurator` change and is **not** done (OCT-19).
  - §9.5's "banner labels 4.15–4.28:1" is unattributed in the findings doc and needs a re-measure (OCT-19).
  - The violet chip (`#B98BE0`/`#C084FC`) is a *taxonomy/CMS* value, so it stays a data change with §7.7 — which
  did not make it into Batch 6 (that batch took §7.2/§7.4/§7.5/§7.10/§3.4); it moves to Batch 7.

- **OCT-8 (High) — §8.1 + §9.12 + §8.3 + §9.5:** the disabled primary CTA keeps the gold gradient with a
  30 %-white label (≈1.4–1.8:1) and still looks enabled on every PDP/cart/checkout plus `/admin/inventory`;
  the muted tier is systemic (`alpha(parchment, 0.35…0.52)` = 2.72–4.06:1) and is the *instruction* text on
  both surfaces. Both are one theme/token change — verify with an automated contrast pass rather than by
  eye, because the gradient short-hand makes `background-color` report as transparent (the audit harness has
  to sample pixels; see `docs/archive/UI_AUDIT_FINDINGS.md` §0).

### Batch 5 — shipped

### OCT-9 — the panel's a11y structure pass (§9.4 + §9.7 + §9.10 + §9.11 + §8.7). **RESOLVED except the items split out below.**

- **Fixed:** 13 `subtitle1|2` sites now declare `component="span"` (MUI was emitting `h6` — a price under a
  card's `h3`); the 17 homepage visibility switches (one `inputProps` aria-label on the mapped `<Switch>`), the
  four tile-editor icon buttons, the global search field and 14 filter selects now have accessible names; the
  header label and `document.title` follow the active module via one shared helper; five `h1`-less routes
  gained an `h1` and ten `h6` sections became `h2`, so no admin page skips `h1` → `h6`.
- **Guard:** `src/components/admin/admin-a11y.contract.test.ts` (14 cases) — including two repo-wide source
  scans (no bare `subtitle` variant anywhere; no unnamed `IconButton`) and planted-offence cases so a scan
  cannot pass vacuously. A shared `listSourceFiles()` now lives in `src/lib/testing/source-contract.ts` and the
  Batch 4 contrast scan uses it too.
- **Deliberately not attempted, now done elsewhere:** §9.4, whose acceptance test is a layout measurement.
  Batch 7 proved the harness *can* measure it; Batch 8 stood up the missing **admin-authenticated** session
  (the dev-only sign-in helper) and then fixed and measured it — §9.4 is ✅ **DONE (2026-10-01)**.
- **Split out rather than silently dropped:** the 16 remaining unnamed `<Select>` elements and the SSR metadata
  question (OCT-20), and the `h1` size variance (OCT-21).

### OCT-20 (Medium) — 16 panel `<Select>` elements still have no accessible name, and admin titles are client-side only.

- **Selects:** the panel has 30; 14 were named in Batch 5 (that item's named scope). The remaining **16**, exactly
  as located: `catalog/products/new/page.tsx:174`; `catalog/products/[id]/page.tsx:699,744`;
  `catalog/products/[id]/builder/page.tsx:1056,1422,1492,1720,1786,1967,2049`;
  `catalog/products/[id]/pricing/page.tsx:323,372`; `custom-requests/page.tsx:437`; `schedule/page.tsx:406,604`;
  `shipping/debug/page.tsx:145`. **Note the counts move** — that list is line-based, so re-derive it with the
  same scan before starting, and add the guard test *after* the last one is fixed (a guard that fails today is
  a guard someone switches off).
- **SSR metadata:** `document.title` is set client-side (the panel mixes 13 client pages with server pages, and
  a client component cannot export `metadata`). User-visible tabs/bookmarks are fixed; the pre-hydration title
  is still the root default. The SSR-authentic routes are either a `layout.tsx` per admin segment exporting
  `metadata` (~20 small files) or a `generateMetadata()` in the panel layout fed by a pathname header from the
  proxy — the second touches the auth-critical proxy (§10.5), which is why it was not done speculatively.

### OCT-21 (Low, visual) — the admin `h1` renders at 30 / 24 / 20 px depending on the route.

- Each page overrides `fontSize` inline (`variant="h4"` / `"h5"`), so no theme edit can unify them. It is a
  consistency nit, not a WCAG failure, and it is an **admin-route** visual claim — **now measurable**: Batch 8
  stood up the admin capture (OCT-28) and the first pass confirms the variance (`/admin/homepage` and
  `/admin` lead with `variant="h4"` headings while `/admin/orders`, `/admin/inventory`,
  `/admin/catalog/products` and `/admin/abandoned-carts` lead with `h5`-class ones). Best fix: a single
  `AdminPageHeading` component (or a theme variant) and delete the per-page overrides, making the result one
  visible change to check.
### Batch 6 — shipped

### OCT-10b — the homepage/CMS batch (§7.2 + §7.4 + §7.5 + §7.10 + §3.4). **RESOLVED except the three items split out below.**

- **§7.2 (Critical) — `sort_order` is real.** New pure `orderHomepageSections()`
  (`src/lib/homepage/section-order.ts`) implements all four documented safety rules, and `src/app/page.tsx`
  now builds a key→element map and loops over the ordered result instead of a hard-coded JSX sequence. The
  audit's acceptance test (diff `audit.json` before/after) was replaced with a runnable equivalent: the test
  asserts the **live** row values produce exactly the old JSX order, and that the visible subset is unchanged.
- **§7.4 / §7.5 — the banner is CMS-driven.** `STATIC_FALLBACK` is gone, so an inactive or absent row renders
  nothing, and the 404 `cta_href` instance went with it. What remains of both items is a DB write and an
  unverifiable live read (OCT-22/OCT-23 below).
- **§7.10 — favicon + OG image**, generated at build time with `ImageResponse` and **verified over HTTP**
  (200 / `image/png` / 979 bytes / PNG magic bytes). This was the only item in the batch verifiable
  end-to-end without a browser, so it was actually fetched rather than assumed.
- **§3.4 — the two missing editors are rendered**, which also un-deadens two handlers that had been sitting
  unused since the page was written; §7.3 (Batch 3) is what makes their saves persist.
- **A judgement worth recording:** twice in this batch a test of mine failed and both times the *test* was
  wrong, not the code — (i) I forgot that safety rule (a) makes every renderable key present, so partial-map
  tests have to assert *relative* order; (ii) my own explanatory comment quoting the old CTA href tripped a
  positive-scan assertion until it was comment-stripped (OCT-2's lesson, again). Both are recorded because
  they are the recurring failure modes of this repo's source-scan technique.

### OCT-22 (Medium) — the announcement banner has no admin switch, and the live table holds two identical active rows.

- **Admin switch:** the banner's authority is `exp_announcement.is_active`, and the panel's homepage page has
  no announcement panel at all (`ALL_SECTION_KEYS` deliberately excludes `announcement`), so turning the
  banner off is SQL-only today. Needs a small panel plus a route that PATCHes `exp_announcement`
  (message, CTA label/href, `is_active`) — and a **row selector**, since the table can hold more than one row.
- **Duplicate rows (data):** the live table holds **two identical active rows** and `getActiveAnnouncement()`
  resolves that with `order('created_at').limit(1)`, so the extra row is invisible until someone edits the
  "wrong" one. Cleanup needs a `DELETE` — deliberately **not** done (OCT-18's read-only rule).
- Both belong in one batch, because the panel has to handle the multi-row reality anyway.

### OCT-23 (Low) — verify the Footer's drinkware slug before repointing it.

- `Footer.tsx:16` links to `/shop/categories/engraved-drinkware`. The repo's seed says that slug **is** the
  drinkware category's slug (`supabase/seed/001_homepage_seed.sql:50` — key `engraved_drinkware`, slug
  `engraved-drinkware`), while §7.5's text assumed it 404s because the *key* differs. One read-only query
  settles it:
  `npx supabase db query --linked "select slug, key from exp_taxonomy where type='category' order by sort_order"`
  — which hung twice in this environment (OCT-18). Until it runs, the link stays as-is, and a contract test in
  `src/lib/homepage/homepage-page.contract.test.ts` pins it as the *only* remaining occurrence, so a second one
  cannot appear unnoticed.

### OCT-24 (Medium) — nothing can *set* `sort_order` yet.

- `orderHomepageSections()` honours the column, but the CMS panel exposes visibility and content only, so
  reordering a section still means editing SQL. The fix is a reorder control (up/down or drag) on
  `/admin/homepage` plus a route that writes `sort_order` — and that write must go through
  `saveHomepageSection()` (Batch 3) so it creates a row when the key has none; otherwise ordering a row-less
  key such as `shop_all_preview` would silently no-op exactly as §7.3 described.
### Batch 7 — shipped (and the visual audit now actually runs)

### OCT-25 — the storefront batch (§7.7–§7.15). **RESOLVED**, with the data half shipped as SQL.

- **The harness works, and this batch is measured rather than argued.** Built `.tmp-capture.mjs` /
  `.tmp-probe.mjs` / `.tmp-report.mjs` straight from `UI_AUDIT.md` §4–§7 (headless Edge over CDP, `pngjs`
  tiling, `audit.json` + DOM probes, zero new dependencies), captured the homepage at 1440/834/390 **before**
  (`%TEMP%\rrs-shots7\`) and **after** (`%TEMP%\rrs-shots8\`), and deleted the harnesses in teardown.
  `.tmp-*` is now gitignored.
- **Baseline sanity check that makes the comparison valid:** the "before" run reproduced the recorded audit
  (mobile pageHeight **9077** vs the audit's **9073**), hydration was `true`, and `horizontalOverflow` was
  **0** at every viewport.
- **Measured deltas:** sub-12px text nodes **11 → 1** (the survivor is the never-painted 9.6px wordmark);
  hero height **742.72 → 693.08** (mobile) and **978.55 → 800.63** (tablet); page height **9077 → 8990** and
  **7135 → 6972**; absolute off-origin hrefs **2 → 0**; hero CTAs `both /shop` → `/custom-orders` +
  `/shop/ready-made`; overline eyebrows **11.2px → 12px**; the emptied-grid empty state **proven by clicking**
  the toggle in the live DOM.
- **Two of my own mistakes, both caught by the harness and worth recording:** (i) my first read of the "after"
  capture concluded *both* filter toggles had vanished — they had not; the switch labels simply are not
  sampled by any `audit.json` field, and the DOM probe showed `Show customizable` present and `Show ready-made`
  correctly absent. (ii) An earlier source-level assumption about "six footer heading labels" turned out to be
  *real* but different from the doc's description — the footer column headings are `h3` at 11.2px, which the
  overline edit has now lifted to 12px.
- **Guardrail for the next pass:** the audit's own caveats (§0 of the findings doc) apply to my numbers too —
  gradient fills report a transparent `background-color`, and the text sampler skips elements with element
  children. Treat a raw flagged count as a lead, not a finding.

### OCT-26 (Medium, wording/product decisions) — copy and content that code should not decide.

- **Hero copy** still carries the `TODO` to source from the `hero` CMS row (`HeroSection.tsx`); §7.13's
  remaining hero height is *content*, not CSS, so the lever is a shorter promise / a single CTA row.
- **The NSFW line** is now legible (full-strength gold, no italic, links to `/resources/faq`) but the wording
  is still the owner's call.
- **Eyebrow strings** — the "Shop preview" eyebrow is now content-managed (#6, 2026-10-01):
  `HomepageProductGrid` reads `content.eyebrow` (empty = hidden) and the Shop All Preview editor gained an
  "Eyebrow (optional)" field, plumbed through the `shop_all_preview` validator. `ShortcutSection`'s separate
  `ariaLabel`-as-eyebrow remains, but `quick_picks` is now hidden (§7.15), so it is moot unless re-enabled —
  at which point it wants the same `content.eyebrow` treatment rather than a hard-coded string.
- **§8.5's badge tier** (8 files at `0.65rem` = 10.4px) is a separate mechanical sweep, not part of §7.12.
  **RESOLVED (Batch 9)** — swept to the 12px floor across 26 files and enforced by `font-floor.test.ts`.

### OCT-27 (Low, data) — the collage has no real alt text, and no imagery below `lg`.

- The two hero-collage images carry `alt: ""`, so the new `aria-label` falls back to `View product`; filling
  the CMS `alt` values is a one-row data change (the SQL file has the pattern).
- The collage is `lg`-only, so tablet and mobile get no product imagery at all — a design decision needing
  real photos.

### OCT-28 (Low, docs) — `UI_AUDIT.md` §15 is stale and its "no browser" premise is corrected. **RESOLVED (2026-10-01, Batch 8).**

- §15's dev-token method described a credential that no longer exists (§10 deleted `rr_admin_session`, the
  signing seed and the legacy fallback), so the section could not be followed. **§15 is rewritten** around a
  dev-only sign-in helper (`GET /api/dev/session` → `generateLink` + `verifyOtp`, so a *real* Supabase
  session lands in cookies), with the preconditions, the failure-mode table, the admin capture rules, the
  guardrails and the teardown all updated. The old mechanism is kept as **history** (why it cannot be
  rebuilt) rather than instructions.
- **The "preview deploy" alternative was rejected**, and the reason is recorded: a preview is publicly
  reachable, so an endpoint that mints admin sessions must refuse there; the helper's gates (`NODE_ENV`,
  `VERCEL`/`VERCEL_ENV`, `ADMIN_DEV_SIGNIN_ENABLED`, loopback) enforce exactly that.
- §15.7 now also records the diagnostic pattern that §9.4 needed (a `1fr` grid track cannot shrink below its
  items' min-content) and the two dead ends tried on the way.

### Batch 8 — shipped (2026-10-01; the admin half of the harness now runs)

### OCT-29 (High, admin) — §9.4's sideways scroll was a `1fr` grid track, not the cause the item named. **RESOLVED.**

- **What it actually was.** `/admin/homepage` measured `scrollWidth − clientWidth` = **140 px** at 1440. The
  section-card grid used `gridTemplateColumns: { sm: 'repeat(2, 1fr)' }`; a `1fr` track is `minmax(auto, 1fr)`,
  so it cannot shrink below its items' min-content, and each card's `whiteSpace: 'nowrap'` description is
  ~590 px. Two tracks resolved to **1191 px** inside a 1060 px column → the panel painted **1241.34 px**.
  `repeat(2, minmax(0, 1fr))` → **140 → 0 px** (and 0 at 834/390). Same shape `finance/page.tsx` and
  `AdminShell`'s content column already use.
- **The item's named levers were wrong here, and that is worth keeping.** §9.4 predicted `minWidth: 0` on the
  shell grid children + `overflowWrap: 'anywhere'`. Measured: `min-width: 0` on the grid **items** changed the
  overflow by **0 px**, and the shell content column *already* had `minmax(0, 1fr)` from Batch 2.
- **A wrong attempt that was caught by measuring, not by reasoning.** My first fix pinned the *page-root*
  grid to `minmax(0, 1fr)`. It measured **worse** (158 px): the root capped the panel's box while the inner
  card grid still painted 1241 px, and the nowrap text had also just been made bigger (§8.5). Reverted.
- **Diagnostic method to reuse (recorded in `UI_AUDIT.md` §15.7):** list elements with
  `scrollWidth > clientWidth + 1`, then read the computed `grid-template-columns` — a single resolved track
  wider than its container is the signature. `width: min-content` on grid items is unreliable (the track
  governs the box).
- **Prerequisite that made it measurable:** the panel's session is Google OAuth (§10), so Batch 8 added the
  dev-only sign-in helper — see OCT-28. Without it this stayed unmeasurable and the item could not honestly
  be closed.
- **Evidence:** `%TEMP%\rrs-admin2\` (6 routes × 3 viewports + `audit.json`, `audit-before.json` kept).
### Batch 9 — shipped (2026-10-01; storefront floor + the dependency bump)

### OCT-30 (High, security) — the single `@xmldom/xmldom` advisory became four, including a critical `next`. **RESOLVED (Batch 9).**

- §1.5 was filed with **one** high (`@xmldom/xmldom`). By Batch 9 `npm audit` reported **four** — 3 high +
  1 **critical**: `next` (RCE in `next/og` `ImageResponse`, range 16.2.0–16.3.5), `axios` (prototype
  pollution / SSRF gadgets, transitive via `square`), `brace-expansion` (dev-only DoS), and the original
  `@xmldom/xmldom`.
- **Why the `next` one mattered here specifically:** Batch 6 shipped `/opengraph-image.tsx` using
  `ImageResponse`, so the repo genuinely exercised the vulnerable API rather than just depending on it.
- **Fix:** `npm audit fix` — all four were in-range, non-breaking bumps (`next` 16.3.4→16.3.8,
  `axios` 1.18.1→1.20.0, `@xmldom/xmldom` 0.9.10→0.9.12, `brace-expansion` 1.1.18/5.0.9→1.1.21/5.0.12).
  Only `package-lock.json` changed; `package.json` ranges already admitted the fixed versions. Verified:
  `npm run audit` exits 0, type-check / 378 tests / build green on the new `next`.
- **Note for the next security pass:** `brace-expansion` is the only dev-only one of the four — the other
  three ship in the production bundle, so `npm audit --omit=dev` was the check that proved the *prod* surface
  is clean too.

### Cross-cutting / not yet batched

- **OCT-10 (decision) — §9.8 is now obsolete, close it. RESOLVED (2026-10-01, Batch 8).** §9.8 is now marked
  ✅ **OBSOLETE** in the September plan (the item asked for a regression test guarding a second session
  signing implementation, and §10.5/§10.10 deleted that implementation). Recorded rather than silently
  dropped, exactly as this entry asked.
- **OCT-11 (Low, doc hygiene) — §7–§9 link to a moved document:** `UI_AUDIT.md` is still at the repo root,
  but the evidence doc the items cite now lives at `docs/archive/UI_AUDIT_FINDINGS.md`. Either update the
  references (several sections, incl. §7's "re-run the harness" pointer and §8's severity table) or move the
  findings doc back next to `UI_AUDIT.md`. Re-verification instructions pointing at a path that no longer
  exists are worse than no instructions.
- **OCT-12 (Todo) — §1.5 `npm audit` high:** `@xmldom/xmldom` is a direct dependency (`^0.9.10`) with a
  high-severity advisory range; confirm what consumes it (it is not obviously reachable from the app
  surface), then bump inside the range or drop it, and re-run `npm run test:security`. Keep this in a batch
  of its own so the lockfile diff stays reviewable.
- **OCT-13 (Todo, blocking) — §1.1/§6.1 migration history:** `supabase_migrations.schema_migrations` does
  not exist live, so `db push` would replay `001`→`NNN` and fail mid-chain. Needs `npx supabase login` +
  `migration repair --status applied …`, then `migration list --linked`. §6.2's dead-object cleanup
  (`065_*.sql`) must be numbered *after* the §10.12 drops, not as `065`.
- **OCT-14 (Todo, verification) — `.env` is present in this working tree** with real
  Supabase/Resend/Square values. Confirm whether Vitest loads it into `process.env` (the new
  `src/proxy.test.ts` mocks the session layer, so it is deterministic either way). If it does load, at least
  one existing test may be reading ambient configuration — that would make the suite environment-dependent,
  which is worth knowing before trusting a red/green result.
- **OCT-15 (Low) — the theme stores its CTA label colour twice.** `theme.ts` declares
  `palette.primary.contrastText: '#0C0A07'` **and** repeats the literal in
  `MuiButton.styleOverrides.containedPrimary.color`, so a palette change can silently split the two.
  `src/theme/theme.test.ts` now pins them equal, which converts "silently split" into a failing test — but the
  duplicate should become a shared constant when Batch 4 edits the theme anyway (it adds the
  `&.Mui-disabled` branch in the same style-overrides object).
- **OCT-16 (Low, Batch 7) — `CONTENT_SECTION_KEYS` is declared but never read.**
  `src/app/api/admin/homepage/sections/[key]/route.ts` still declares
  `CONTENT_SECTION_KEYS = {quick_picks, process_picks, hero_collage, shop_all_preview,
  future_products_notify}` and nothing consumes it: the route dispatches with explicit `sectionKey ===` checks.
  The behaviour happens to match the set, so this is dead documentation rather than a live bug — but it will
  read as enforced policy to the next person editing the route. Either delete it (with the §7.3 write path it
  no longer carries information) or enforce it with a test that every key in the set takes the content branch
  and every other key is visibility-only. Noticed while rewiring the five writers in Batch 3.
- **OCT-17 (Low, hygiene) — `supabase/.temp/cli-latest` is tracked in git.** Running any
  `npx supabase …` command rewrites this CLI version-check cache, so a read-only `db query --linked` (all
  Batch 3 needed) produced a spurious diff (`v2.117.0` → `v2.118.0`). It was reverted, but the next person
  running the CLI will hit it again. §6 of the September plan states "`supabase/.temp` and `.env` are
  gitignored", which is **not** true for this file — either `git rm --cached` it and confirm the ignore rule,
  or correct that line in §6. A cache file in version control is noise at best and a merge conflict at worst.
- **OCT-18 (info) — this environment can read the live database.** The Supabase CLI is authenticated here, so
  `npx supabase db query --linked "select …"` works (used in Batch 3 to confirm the two missing section rows).
  Keep it read-only: no batch has written to the hosted project, and none should without an explicit ask.
  *(Caveat observed during Batch 4: one such read hung for over five minutes before returning — treat the tool
  as slow-and-occasionally-flaky, not as something to build a batch's critical path on.)*
- **OCT-19 — pixel/layout verification. ⚠️ CORRECTED 2026-09-30 (Batch 7): my earlier claim was WRONG.**
  I reported "no browser binary on this machine" in Batch 4 and it propagated into the September plan. It is
  **false**: `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` and Chrome both exist, and the
  audit's own harness (headless Edge over CDP + `pngjs`, zero new dependencies) was built and used in Batch 7 —
  see the Batch 7 record below and `UI_AUDIT.md` §2. What went wrong is worth keeping: the first check ran the
  browser path through a nested `powershell -Command` invocation that mangled the arguments, and I treated one
  failed probe as an environment fact instead of re-checking. **The lesson is the one this plan keeps
  relearning: verify a negative with a second method before recording it as a limitation.**
  **What is genuinely blocked, and why:**
  - **The admin panel cannot be captured at all** — and this part *is* real. `UI_AUDIT.md` §15's dev-token
    method depends on the custom `rr_admin_session` HMAC token, `SESSION_SIGNING_KEY_SEED` and
    `ALLOW_LEGACY_ADMIN_SESSION_FALLBACK`, all of which §10 deleted. The panel's credential is now a Supabase
    Google-OAuth session, so an authenticated capture needs either a real Google sign-in in the harness or a
    preview deploy + a session cookie. **`UI_AUDIT.md` §15 is stale and should be rewritten** (filed as OCT-28).
  - **Storefront capture works** — proven in Batch 7 at 1440/834/390 (`%TEMP%\rrs-shots7\` and `rrs-shots8\`).
    So §9.4's `scrollWidth − clientWidth` is measurable for the storefront, but its four affected routes are
    *admin* routes, which is the blocker above.
  - **Still weaker than pixels in one place:** the Batch 4 contrast work was verified with *computed*
    composites (`theme.test.ts` resolves alpha over the real surface). Batch 7 could now sample pixels for the
    same claims, so a follow-up pass can turn those into measured values — filed as OCT-25.
  - **§8.1's `aria-describedby`** (the 12px caption that explains *why* the CTA is disabled — 3.16:1 today,
    which the floor sweep has since raised): a `ProductConfigurator` edit, deliberately left out of the token
    batch. Needs a DOM-shaped test, i.e. the same harness problem.
  - **§9.5's "banner labels 4.15–4.28:1"** is not attributed to an element in the findings doc, so it needs a
    re-measure rather than a guess — listed here so it is not silently dropped.
  **Recommendation:** treat "browser-dependent verification" as a first-class dependency, exactly like the
  migration-history baseline (§1.1). If a preview deploy + a browser is available to you, say so and I will
  write the probe as a script that runs against it; otherwise Batch 5 should not claim visual fixes.

---

## 3. TODO: per-batch verification recipe (used in Batches 1–3 — reuse it)

Run all of these before calling a batch done. The last one is the only one that can catch a header/CSP or
landmark regression, and it is cheap:

```powershell
npm run type-check
npx vitest run                     # green suite; B1 → 36/248, B2 → 41/272, B3 → 43/294, B4 → 44/308,
                                   # B5 → 45/325, B6 → 47/346, B7 → 47/348, B8 → 49/370

# storefront visual audit (UI_AUDIT.md §4–§7) — works in this environment; see OCT-19
#   .tmp-capture.mjs <url> [outDir]   → tiles + audit.json (merge-safe per route|viewport)
#   .tmp-probe.mjs   <url> "@%TEMP%\expr.js"  → live-DOM questions (@file avoids PowerShell quoting)
#   .tmp-report.mjs  [audit.json]     → readable digest
# Artifacts outside the repo, harnesses deleted afterwards; `.tmp-*` is gitignored.
# The admin panel CAN now be captured too: enable ADMIN_DEV_SIGNIN_ENABLED=true locally and navigate the
# captured browser to GET /api/dev/session first (UI_AUDIT.md §15, Batch 8). It refuses in prod/Vercel.
npm run build                      # fails the build if the proxy export name is wrong (Next E903)
npx eslint <changed files>         # baseline noise: prove *your* lines are clean, don't assume —
                                   # compare eslint's reported lines against the diff hunks (Batches 4–5)
                                   # and lint *new* files explicitly, since `git diff` cannot see them

# read-only live database facts (the CLI is authenticated in this environment)
npx supabase db query --linked "select …"   # e.g. which section rows exist; never run a write here

# live header/landmark check against a real production server
Start-Process cmd.exe -ArgumentList '/c',"npx next start -p 3100 > `"$env:TEMP\rrs-start.log`" 2>&1" -WindowStyle Hidden
Start-Sleep -Seconds 16
curl.exe -s -D - -o NUL http://localhost:3100/            # CSP, x-nonce, rrs_csp_nonce
curl.exe -s -i http://localhost:3100/admin                # 307 -> /admin/login
curl.exe -s -i http://localhost:3100/api/admin/orders     # 401 {"error":"Unauthorized"}
# same-request nonce contract: header x-nonce must equal <body nonce>, 0 script tags without a nonce
Get-NetTCPConnection -LocalPort 3100 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

**For UI items, add on top of that** (see OCT-5 for why they are not covered by the suite): grep the built
client chunks to prove new client code actually shipped
(`Select-String -Path .next/static/chunks/*.js -Pattern '<yourNewMarker>' -List`), and for anything the panel
renders, remember `/admin` needs an authenticated session — which this environment does not have.

**Rules this recipe encodes, learned the hard way in Batches 1–3:**
- Never write to the live project from a batch. `db query --linked` is for *reading* facts (Batch 3 used it to
  prove the two section rows were absent); the write path is proven with mocked-client tests instead.
- A test that reads a component's source must strip comments first, or a negative assertion will trip over the
  comment that explains it (`src/lib/testing/source-contract.ts`).
- Declare mock parameters (`vi.fn((_values: Record<string, unknown>) => …)`) or `mock.calls` is typed as `[]`
  and the assertions need casts.


  check (`exp_taxonomy`) before picking the replacement slug — do not guess one from the repo.
