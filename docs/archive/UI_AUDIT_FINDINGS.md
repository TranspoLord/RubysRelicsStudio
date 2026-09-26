# UI Audit — Findings (storefront pass)

> Companion to `UI_AUDIT.md`, which is the **method**. This file is the **findings** (per §11 there).
> Evidence: `%TEMP%\rrs-shots4\` (homepage), `%TEMP%\rrs-shots5\` (shop, shop/all, future-products,
> custom-orders, cart), `%TEMP%\rrs-shots6\` (sippy-cup PDP, checkout) — **8 routes × 3 viewports = 24
> full-page captures**, each with an `audit.json`. Everything below was re-checked against the live DOM and
> the PNGs; where the automated numbers were wrong, the corrected value is stated instead.
>
> **Scope:** **Part 1 (below) is the public storefront.** **Part 2 is the authenticated admin panel** —
> `/admin` × 23 routes × 3 viewports = **69 captures**, evidence in `%TEMP%\rrs-admin\`. Still **not**
> covered: the product designer (customer-facing), Square's hosted checkout, email templates, and
> real-device rendering (iOS Safari / Android Chrome).
>
> **Superseded for tracking purposes (2026-09-24).** `SEPT_IMPLEMENTATION_PLAN.md` §7–§9 mirrors this document
> and is the **single source of truth** for statuses, counts and severities — where the two differ, the plan
> wins. Two counts were wrong here and are corrected in both files: **A4** affects **four** routes (not five),
> and **A9** counts **17** section switches (not 15 — `SECTION_ORDER` holds 17 keys with one bare `<Switch>`
> each, `src/app/admin/(panel)/homepage/page.tsx:30-48,507`, and the sweep's 15 was the outlier). This file
> remains the **evidence of record**: per-finding detail, the two measured route×viewport matrices
> (App. A / App. C) and the deliberate exclusions (App. B / App. D).

## 0. How to read the numbers (read this first)

Three instrumentation limits made the raw `audit.json` look worse than the site is. Each was resolved by
reading the real computed style from the live DOM and by pixel-sampling the capture PNGs:

1. **Gradient buttons report a transparent `background-color`.** `theme.ts:161` sets the primary fill with
   the `background:` **shorthand** (`background: linear-gradient(...)`), which resets `background-color` to
   `transparent`. The harness's contrast walker looks for the nearest ancestor with a non-transparent
   `background-color`, so for every gold CTA it fell through to the *section* background and reported dark
   text on dark: `Notify me` **1.06:1**, `Browse Shop` **1.03:1**. Screenshots and pixel sampling show both
   are gold `#C4921A`→`#E8B84A` with `#0C0A07` labels ≈ **7:1**. They pass and are not filed below.
2. **The contrast sampler only sees leaf elements with no element children** (`el.children.length === 0`),
   so **any button with an icon is skipped**. That is why `Add to Cart` — the most important button in the
   store, present in every PDP capture — never appears in the automated results while its sibling
   `Pay with Square` does. Finding **C1** came from the live DOM probe, not from the sweep.
3. **The tap-target counter is not WCAG-aware.** It lists everything under 24px without applying the
   SC 2.5.8 *spacing* exception. Measured properly (see **P2**) the mobile storefront is almost clean.

## 1. The Good

### 1.1 The structural floor is unusually solid — verified across all 24 captures
- **Zero horizontal overflow** on every route at every viewport (`hOverflow=0` at 1440 / 834 / 390) —
  including the 3,997px-tall mobile product configurator and the 9,073px mobile homepage.
- **Zero images missing `alt`, zero broken images**, and **zero buttons without an accessible name**.
- **Exactly one `header`, `main` and `footer` landmark per route** (`nav` = 2 where the breadcrumb adds one,
  `Breadcrumb.tsx:26`), `lang="en"`, a unique descriptive `<title>` per route (`Shop the Hoard | Ruby's
  Relics Studio`, `Cart | …`, `Checkout | …`), and every input on every route labelled
  (`inputs(8) unlabelled=0` on the homepage; no unlabelled inputs anywhere).

### 1.2 The design system is real, tokenised, and measurably consistent
- One brand ramp, declared once (`theme.ts:3–16`) and consumed through `brandTokens`: forge gold `#C4921A` /
  light `#E8B84A` / dark `#8A6510`, ruby `#9B1C1C`, parchment `#EDE0CC` on a `#0C0A07` void — with Cinzel for
  display and Inter for text wired through the theme's typography scale (`theme.ts:56–122`).
- Motion and focus are deliberate rather than default: a global `:focus-visible` ring (`2px solid #C4921A`,
  `outline-offset: 3px` — `globals.css:41`, `theme.ts:141`) with component-level reinforcement, plus
  `prefers-reduced-motion` guards on the button lift, card transitions and shortcut-card hover
  (`theme.ts:169`, `theme.ts:195`, `ShortcutSection.tsx:159`).
- The type scale is comfortable and honest: `body1` 16px/1.7, `body2` 14px/1.6, `h1`
  `clamp(2rem, 5vw, 3.5rem)` (measured 64px desktop / 51px tablet). It scales instead of snapping.

### 1.3 The homepage is a real narrative, and the conversion hierarchy works
Ten sections on desktop (nine on tablet/mobile) with a consistent rhythm — overline → `h2` → supporting
line → proof → **one** CTA — and a clear intent per section (`Bring Us Your Wild Idea` → one ruby
"Start a Custom Request"; `Want early access?` → one gold "Notify me"). The strongest hierarchy signal: the
hero CTA and the custom-request CTA are the only saturated, high-contrast fills above the fold, so the eye
lands where the business wants it.

## 2. Critical Fixes

### C1 — The disabled state of the highest-value buttons is illegible **and** looks enabled
**Evidence (live DOM, PDP `sippy-cup`, 1440×900):**

```
class            … MuiButton-contained MuiButton-containedPrimary MuiButton-sizeLarge
disabled         true        opacity 1        cursor default        box 552x56
color            rgba(255, 255, 255, 0.3)     ← the label
backgroundColor  rgba(255, 255, 255, 0.12)    ← painted *under* the gradient → invisible
backgroundImage  linear-gradient(135deg, #8A6510 0%, #C4921A 60%, #E8B84A 100%)   ← still painted
```

The gold gradient survives (MUI's disabled rule only sets `background-color`; the theme paints with
`background-image`), while the label drops to 30%-white. Composited over that gradient the label measures
**≈1.4:1 on the light end and ≈1.8:1 on the dark end** — the words "Add to Cart" are effectively invisible on
a button that still looks like the live primary action.

**Source.** `ProductConfigurator.tsx:447–451` guards fill *and* label with `isValid ? … : undefined`, so when
the configurator is invalid both fall back to MUI's dark-mode disabled defaults — which is where the
30%-white label comes from. The same theme-gradient + MUI-default combination governs `Pay with Square`
(`CheckoutPageView.tsx:402`), `Checkout with Square` (`SquareCheckoutButton.tsx:56`), `Submit Request`,
`Clear Cart` and `Calculate Shipping`; all of them read as washed-out gold in the captures.

**Why it matters.** This is the whole funnel — every product page, the cart, the checkout. The button reads
as clickable, is not, and cannot be read. Its only explanation is a 12px caption at **3.16:1**
(`ProductConfigurator.tsx:456`, `alpha(parchment, 0.4)`).

**Fix.**

1. `ProductConfigurator.tsx:447–451` — make the disabled state deliberate instead of a fallback, and stop the
   gradient rather than the label:

```tsx
disabled={!isValid}
sx={{
  py: 1.75, fontSize: '1rem', fontWeight: 700, letterSpacing: '0.06em',
  backgroundImage: isValid
    ? `linear-gradient(135deg, ${brandTokens.forgeGoldDark} 0%, ${brandTokens.forgeGold} 60%, ${brandTokens.forgeGoldLight} 100%)`
    : 'none',
  backgroundColor: isValid ? brandTokens.forgeGold : alpha(brandTokens.forgeGold, 0.28),
  color: isValid ? brandTokens.bgVoid : alpha(brandTokens.parchment, 0.72),
  border: isValid ? 'none' : `1px dashed ${alpha(brandTokens.parchment, 0.35)}`,
  '&:hover': { backgroundColor: isValid ? brandTokens.forgeGoldLight : undefined },
  '&.Mui-disabled': { color: alpha(brandTokens.parchment, 0.72) },
}}
```

2. Codify it once so no future button repeats it — add to `MuiButton.styleOverrides.root` (`theme.ts:151`):

```ts
'&.Mui-disabled': {
  backgroundImage: 'none',
  backgroundColor: alpha(PARCHMENT, 0.10),
  color: alpha(PARCHMENT, 0.55),
  border: `1px dashed ${alpha(PARCHMENT, 0.28)}`,
  opacity: 1,   // MUI does not dim it; the 0.12 / 0.30 defaults do all the damage
},
```

3. Say why, next to the button: give the caption at `ProductConfigurator.tsx:456` an `id`, add
   `aria-describedby` to the button, and raise the caption to ≥13px at `alpha(parchment, 0.62)`.

### C2 — Cookie "Accept" is white on gold (2.81:1) on every page — and the banner covers the checkout form
**Evidence (live DOM):** `Accept` → `color: rgb(255,255,255)`, `backgroundColor: rgb(196,146,26)`,
13px/500, box 95×31 → **2.81:1** against a 4.5:1 requirement. It is the lowest-contrast *visible* text on the
site and it appears in **24 of 24** captures, because the banner only dismisses permanently once a choice is
stored. `CookieBanner.tsx:125–139` hard-codes `color: '#fff'` on `background: brandTokens.forgeGold`.

**Also:** the banner is `position: fixed; bottom: 0; zIndex: 2000` (`CookieBanner.tsx:74–79`) and in the
`/checkout` desktop capture it **covers the Street / City / ZIP fields**. A consent bar hiding the payment
form is a real conversion risk.

**Fix**
- `CookieBanner.tsx:131` → `color: 'primary.contrastText'`. The theme already defines it as `#0C0A07`
  (**7.03:1**), and the hard-coded hex stops drifting from the palette.
- The three buttons measure **31px** tall (`Manage` 83×31, `Essential Only` 146×31, `Accept` 95×31) — add
  `sx={{ minHeight: { xs: 44, sm: 31 } }}` so they are thumb-sized on phones.
- Stop overlaying content below `sm`: use `sticky` instead of `fixed`, or reserve space with body padding.

### C3 — The muted-text floor is systemic (2.72–4.36:1), and it is the text that explains the store
The codebase uses `alpha(brandTokens.parchment, 0.35 … 0.5)` as its helper-text tier, which on `#0C0A07`
measures:

| alpha | contrast | examples |
|---|---|---|
| 0.35 | **2.72:1** | `At least one art piece is required`, `More optional slots for more art` (12px, configurator) |
| 0.40 | **3.16:1** | `Please fill in all required fields above` (`ProductConfigurator.tsx:456`), `Starting from` (`shop/categories/[slug]/page.tsx:340`), file-input `No file chosen` |
| 0.45 | **3.72:1** | `2 ITEMS` / `1 ITEM` counters (`app/shop/page.tsx:235`) |
| 0.46–0.50 | **4.35–4.36:1** | `Volume pricing` (`ProductConfigurator.tsx:371`), `3 products available` (`app/shop/page.tsx:307`), cart-empty copy, the four `/shop` trust captions |

All of it is 10.4–12px, so none of it qualifies for the large-text allowance, and none of it is decorative —
it is instruction, validation and quantity. The isolated badge case is the violet chip on `/shop`:
**`Unique Pieces` = 3.34:1** (`#8B4FBE` on `alpha('#8B4FBE', 0.15)`, `ShopOrderPaths.tsx:47–50`), while its
siblings in the same component pass (`Most Popular` = gold; `Ships Fastest` = `#5A9A3A`, measured **4.90:1**) —
so the pattern is sound and only the violet token is too dark for its tint. (Same palette drift already logged
as item 7 of `SEPT_IMPLEMENTATION_PLAN.md`.)

**Fix — one floor, applied as a sweep.** Replace every body-size `alpha(PARCHMENT, ≤0.5)` with
**`alpha(PARCHMENT, 0.62)` (≈5.9:1)**, or use the existing `parchmentMuted` token `#9E8A6A` (**5.93:1**), and
keep ≤0.5 for decorative rules and outlines only. For the two tinted chips keep the tint and lighten the text:
badge red → `#E0706F` (≈6.2:1), badge violet → `#B98BE0` (≈6.6:1).

Files: `ProductConfigurator.tsx:343,352,371,456`, `app/shop/page.tsx:235,307`,
`app/shop/categories/[slug]/page.tsx:340,490–491`, `ShopOrderPaths.tsx:47–50`,
`components/cart/CartProvider.tsx:384`, `CheckoutPageView.tsx:241`, `Footer.tsx:68`.

## 3. Actionable Polish

### P1 — The hero-collage tiles leave the site, and they are nameless links
The two `<a>` elements the harness flagged as having no text are the desktop hero collage tiles
(`HeroCollage.tsx:157–178`). Each `href` is an **absolute production URL** —
`https://rubysrelicsstudio.vercel.app/shop/categories/...` — and each contains only an `<img alt="">`, so the
link has no accessible name (WCAG 2.4.4 / 4.1.2) *and* on any non-production host it sends visitors to
production.
- Content: make the `homepage-tiles` hrefs relative in Supabase, or normalise in the component —
  `href={image.href.replace(/^https?:\/\/[^/]+/, '')}`.
- Code: give the anchor an explicit name — `aria-label={image.alt || 'View product'}` — because an accessible
  name that depends on an `alt` being emptied for decoration is fragile.

### P2 — Hit targets: the automated count is a false alarm, but two inline links deserve padding
Measured at 390×844, the only non-footer interactive elements under 24px tall are the **Cookie policy** link
inside the banner sentence (84×17) and — desktop/tablet only — the announcement CTA **Shop Drinkware**
(107×16; 172×34 once it wraps on mobile). The 23–26 "undersized" flags per route are almost entirely the
footer link column, which measures 17px tall at a **35px row pitch** (`Footer.tsx:61–75`) and therefore
**passes SC 2.5.8 via the spacing exception** — 24px circles 35px apart never intersect, and that is
comfortable rather than marginal.
- `AnnouncementBanner.tsx:78–90`: make the CTA `display: 'inline-flex', alignItems: 'center', minHeight: 24,
  px: 0.5`, or render it as an `outlined` `Button size="small"`.
- `CookieBanner.tsx:97–102`: same treatment for the inline `Cookie policy` link.
- Optional, and worth it on phones: `py: 0.5` on `Footer.tsx:68` takes the footer rows from 17px to 25px and
  removes the reliance on the spacing exception entirely.

### P3 — Kill the sub-12px type tier
Sub-12px text nodes per capture: **16 / 16 / 15** on the homepage, **12 / 12 / 11** on `/shop`, and 1–5
elsewhere. The tiers are `0.7rem` (11.2px — `overline`, `theme.ts:112`, used for every section eyebrow),
`0.65rem` (10.4px badges across 8 files: `ShopOrderPaths.tsx:100`, `app/shop/page.tsx:235`,
`FreshFromTheForge.tsx:122,137`, `MaterialsTeaser.tsx:156`, `ProcessStrip.tsx:145`,
`shop/categories/[slug]/page.tsx:340`, `Header.tsx:231`), `0.6rem` (9.6px — the header "Studio" subline at
`Header.tsx:153`, plus decorative ✓ glyphs) and `0.72rem` (11.5px trust captions).
- Raise `overline.fontSize` to `0.75rem` and the general floor to `0.7rem`; keep `0.65rem` only for the cart
  badge and other non-text counters. Uppercase plus wide tracking makes 10.4px *look* deliberate, but it is a
  squint on a laptop.

### P4 — Stop marking prices up as headings, and drop the stray `h6`s
The homepage product grid renders prices as `<h6>`: the audit reads `h3: Sippy Cup` immediately followed by
`6: $13.00` — a level skip, with a price presented as a heading. Cause: `<Typography variant="subtitle1">`
(`HomepageProductGrid.tsx:191`), because MUI's default variant mapping sends `subtitle1`/`subtitle2` to `<h6>`
when no `component` is given. **All 13 `subtitle1|2` usages in `src/` omit `component`** —
`HomepageProductGrid.tsx`, `ResourcesTeaser.tsx`, `FaqPreview.tsx`, `FreshFromTheForge.tsx`,
`CartPageView.tsx`, `SearchModal.tsx` (×2), `ProductDesigner.tsx` (×2), `admin/…/builder/page.tsx` (×4).
Add `component="span"` (or `"p"`); the price becomes
`<Typography variant="subtitle1" component="span">`. The same mapping explains the six footer-region `h6`s
(`Terms of Service`, `Privacy Policy`, `Returns & Refunds`, `Shipping Policy`, `Artwork Requirements`,
`Safety & Materials`) which are link text, not headings.

### P5 — Two small launch-hygiene items
- **Mobile length.** The homepage is **9,073px** at 390×844 — about 10.7 screens, 9 sections and 65
  focusables — and the "Want early access?" notify form is the **ninth** section, roughly nine swipes down
  (`FutureProductsNotifyCard.tsx`). It is the highest-intent action on the page and it has a working API
  behind it: consider moving it above the "browse by craft" grid on `<md` and trimming the 3-up "Quick hoard
  starters" intro on small screens. The PDP is equally long on mobile (3,997px) with `Add to Cart` far below
  the fold — a sticky `Add to cart — $13.00` bar under the header on `<md` is the standard fix.
- **Console noise.** Every capture logs a CSP violation for
  `https://va.vercel-scripts.com/v1/script.debug.js` (`script-src` does not allow that host) plus a 404 on a
  script request, so `<Analytics />` (`src/app/layout.tsx:87`) never loads in dev and the console is noisy
  enough to mask real errors. Allow the host for dev/preview only, or render `<Analytics />` only when
  `process.env.NODE_ENV === 'production'`.

## 4. Severity at a glance

| # | Finding | Severity | Reach | Effort |
|---|---|---|---|---|
| C1 | Disabled primary CTAs at 1.4–1.8:1 **and** they look enabled | High | every PDP, cart, checkout | S |
| C2 | Cookie `Accept` 2.81:1; banner overlays the checkout form | High | 100% of first-time visitors | XS |
| C3 | Muted-text floor 2.72–4.36:1; violet chip 3.34:1 | Medium-High | PDP, `/shop`, `/cart` | S (sweep) |
| P1 | Collage tiles: nameless links + absolute production hrefs | Medium | homepage (desktop) | S |
| P2 | Inline-link hit targets (2 elements) | Low | homepage / global | XS |
| P3 | Sub-12px type tier (10.4px badges, 11.2px overlines) | Low | site-wide | S |
| P4 | Prices and footer labels emitted as `h6` + level skips | Low | homepage + 8 files | S |
| P5 | Mobile page length; CSP/console noise | Low | mobile, dev console | M / XS |

## Appendix A — measured matrix (route × viewport)

`pageH` = full document height; `sub12` = text nodes under 12px; `noAlt` / `broken` = images; `tap<24` is the
raw un-WCAG-aware counter (see §0.3 and P2 — the footer column is what inflates it).

| route | viewport | pageH | hOverflow | focusables | sub12 | noAlt | broken | tap<24 |
|---|---|---|---|---|---|---|---|---|
| `/` | desktop 1440×900 | 5525 | 0 | 73 | 16 | 0 | 0 | 24 |
| `/` | tablet 834×1112 | 7133 | 0 | 66 | 16 | 0 | 0 | 23 |
| `/` | mobile 390×844 | 9073 | 0 | 65 | 15 | 0 | 0 | 23 |
| `/shop` | desktop | 2247 | 0 | 49 | 12 | 0 | 0 | 24 |
| `/shop` | tablet | 2876 | 0 | 44 | 12 | 0 | 0 | 23 |
| `/shop` | mobile | 3512 | 0 | 43 | 11 | 0 | 0 | 24 |
| `/shop/all` | desktop | 1470 | 0 | 41 | 5 | 0 | 0 | 25 |
| `/shop/all` | tablet | 2024 | 0 | 36 | 5 | 0 | 0 | 24 |
| `/shop/all` | mobile | 2700 | 0 | 35 | 4 | 0 | 0 | 25 |
| `/future-products` | desktop | 1686 | 0 | 41 | 2 | 0 | 0 | 23 |
| `/future-products` | tablet | 1787 | 0 | 36 | 2 | 0 | 0 | 22 |
| `/future-products` | mobile | 2211 | 0 | 35 | 1 | 0 | 0 | 23 |
| `/custom-orders` | desktop | 1746 | 0 | 46 | 2 | 0 | 0 | 24 |
| `/custom-orders` | tablet | 2352 | 0 | 41 | 2 | 0 | 0 | 23 |
| `/custom-orders` | mobile | 2866 | 0 | 40 | 1 | 0 | 0 | 24 |
| `/cart` | desktop | 1039 | 0 | 39 | 2 | 0 | 0 | 24 |
| `/cart` | tablet | 1148 | 0 | 34 | 2 | 0 | 0 | 23 |
| `/cart` | mobile | 1467 | 0 | 33 | 1 | 0 | 0 | 24 |
| `/shop/categories/drinkware/sippy-cup` | desktop | 2996 | 0 | 50 | 1 | 0 | 0 | 26 |
| `/shop/categories/drinkware/sippy-cup` | tablet | 3952 | 0 | 45 | 1 | 0 | 0 | 25 |
| `/shop/categories/drinkware/sippy-cup` | mobile | 3997 | 0 | 44 | 0 | 0 | 0 | 26 |
| `/checkout` | desktop | 1553 | 0 | 50 | 2 | 0 | 0 | 25 |
| `/checkout` | tablet | 1940 | 0 | 45 | 2 | 0 | 0 | 24 |
| `/checkout` | mobile | 2206 | 0 | 44 | 1 | 0 | 0 | 25 |

`/checkout` did **not** redirect on an empty cart (`finalPath=/checkout` at all three viewports); the empty
state is a real, reachable page.

## Appendix B — what I deliberately did **not** file

- `Notify me` 1.06:1 and `Browse Shop` 1.03:1 — gradient-shorthand artifact (§0.1). Verified gold with dark
  labels in the screenshots, ≈7:1. They pass.
- `Ruby's Relics` 2.10:1 (×24 captures) — the gradient-clipped wordmark (`Header.tsx:133–149`,
  `Footer.tsx:112–124`). Its computed `color` is the UA default link blue **because no `color` is declared**,
  but `WebkitTextFillColor: 'transparent'` means it is never painted, so this is not a contrast failure.
  **Still worth fixing**, because in Windows High Contrast / forced-colours mode the fill is dropped and the
  wordmark would render as default link blue: add `color: brandTokens.forgeGold` to both wordmarks.
- The 23–26 "undersized tap targets" per route — spacing exception (see P2).
- The two text-less anchors on the desktop homepage — real, filed as P1.
- The `2 → 6` and `3 → 6` heading skips in the footer region — same MUI `subtitle` mapping as P4.

---

# Part 2 — Findings (admin panel pass, authenticated)

> **Evidence:** `%TEMP%\rrs-admin\` — **69 full-page captures** (23 routes × desktop 1440×900 /
> tablet 834×1112 / mobile 390×844) tiled at 1500 px, plus `audit.json`, `summary.txt` (the derived
> matrix + aggregates) and `probe-*.json` / `a11y-*.json` (live-DOM probes). Session bootstrap and
> guardrails: `UI_AUDIT.md` §15. **Confidential** — the captures contain real customer/order rows; do not
> commit or share them. Route coverage: `ADMIN_MODULES` in `src/app/admin/(panel)/layout.tsx` plus the
> nested catalog pages.

## 0. Method notes that changed the answer (read first)

Part 1's three instrumentation limits applied again, and the admin surface added two more:

1. **Gradient-fill artifact (Part 1 §0.1).** The panel's primary CTAs use the same
   `background: linear-gradient(...)` shorthand, so the automated walk reported `Add Product` /
   `Save Product` / `Create Category` at **1:1–1.37:1** — dark label measured against the *card* colour
   because `background-color` is transparent. Verified gold fill with a `#0C0A07` label → ≈7:1. Not filed.
2. **The cards paint with the same shorthand**, so their `background-color` is transparent and the walker
   falls through to the page void `#0C0A07`. That is why the sweep **missed** the sub-12px muted text
   (it scored 5.7:1 against the void). Pixel-sampling the sidebar card gives the true backdrop **(27,21,15)**
   → corrected value **4.06:1** (filed as **A10**).
3. **MUI internals are not defects.** `MuiSelect-nativeInput` (`aria-hidden`, `tabindex="-1"`) and the
   `visibility: hidden` autosize textarea appear as "unlabelled inputs" and a "0-height input"; both are
   framework plumbing. What matters is the *visible* control — and for every MUI `Select` in the panel the
   visible `role="combobox"` has no accessible name either (**A9**).
4. **A minted dev token only works once both gates agree** — see **A1**. If `/admin/*` returns `307` while
   `GET /api/admin/session` answers `{"authenticated":true}`, the two gates are deriving different keys.
5. **Sticky/fixed elements photograph oddly.** `Page.captureScreenshot {captureBeyondViewport:true}` paints
   the sticky header and the fixed cookie banner at their *viewport* offsets, so a bar can appear "inside"
   a tall page. That is a capture artifact, not a layout bug — the banner *occlusion* in **A2** was proven
   separately with `elementFromPoint`.

## 1. The Good

### 1.1 It renders, everywhere, in every session
- **69/69 captures authenticated with no redirect** — `location.pathname` matched the requested route at
  every viewport on every page and the 12-item module nav was present every time (`sessionLost = 0`).
- **Zero API failures:** every `/api/admin/*` call captured (0–14 per page) answered `200`; no `401`s, no
  `5xx`, and **zero runtime exceptions** in the whole run.
- **Zero broken images and zero images without `alt`** (`broken: []`, `noAlt: []`) across 69/69 captures.
- **One `header` + one `aside` + one content `section` per page**, and no storefront header/footer leaking
  into the panel (`footer: 0` everywhere). The panel's only table (`/admin/abandoned-carts`) has a proper
  header row with `scope` on all 4 `<th>`.

### 1.2 The brand system carries into the panel intact
The panel is not a bolt-on admin theme: gold gradient CTAs (`linear-gradient(135deg, #8A6510 0%, #C4921A
60%, #E8B84A 100%)`) with `#0C0A07` labels ≈ **7:1**, Cinzel page titles, the same void/card elevation ramp,
and a gold focus ring inherited from the *global* rules rather than re-declared (`globals.css:40`
`:focus-visible`, `theme.ts:141` CssBaseline, `theme.ts:155` `MuiButton`) — so keyboard focus is visible on
panel links and buttons for free.

### 1.3 Honest empty states and honest numbers
With **0 orders**, **0 inventory rows** and **0 future products** in the database the panel says so
(`No orders matched the current filters.`, `Pick a product from the list below to edit stock settings.`,
`No ready-made products were found for inventory control.`). The dashboard's four pipeline tiles read all
`0`, which **matches the data** (`exp_custom_requests` holds 2 rows and both are `cancelled`; `exp_orders`
is empty) — nothing is silently mis-counted. Only a handful of routes had real rows to render
(`/admin/catalog/products`, `/admin/catalog/categories`, `/admin/abandoned-carts`, the editor pages).

## 2. Critical

### A1 — The whole admin panel was unreachable: the Edge gate and the signer derived **different** session keys ✅ **FIXED**
**Evidence (before the fix — note that `/api/admin/session` proves the token itself was fine):**

```
GET /api/admin/session  with cookie → 200 {"authenticated":true,"mfaVerified":true}
GET /admin              with cookie → 307 → /admin/login            ← no ?next=
GET /admin/orders       with cookie → 307 → /admin/login
GET /api/admin/search   with cookie → 401 {"error":"Unauthorized"}   ← middleware body
```

**Root cause.** Two implementations derive the signing key from the same `SESSION_SIGNING_KEY_SEED` and get
*different* keys:

| Side | Code | Output |
|---|---|---|
| signer — Node, `src/lib/admin/session.ts:27-29` | `hkdfSync('sha256', seed, salt, info, 32)` | **32 bytes** |
| verifier — Edge, `src/middleware.ts` `verifyTokenEdge` | `crypto.subtle.deriveKey({name:'HKDF',…}, baseKey, {name:'HMAC',hash:'SHA-256'}, …)` | **64 bytes** — `deriveKey` into HMAC-SHA-256 defaults to the hash **block** size, not the digest size |

Measured directly: with a forced 32-byte `deriveBits` the keys are equal (`nodeVsSubtleKeyEqual = true`),
but `edgeDerivedKeyBytes = 64` — and that 64-byte key is the 32-byte key **plus 32 more bytes**. The prefix
matches (`96a81850520db04f…` on both) while the HMAC over the same payload differs (`bfb288c4fb39` vs
`f12205846b8d`): a prefix is not the same key.

**Why it matters.** `POST /api/admin/session` and `POST /api/admin/verify-mfa` mint tokens through
`createAdminSessionToken` (32-byte key) and the Edge then rejects them, so **a correct admin key + MFA still
ended on `/admin/login`** — the panel was unusable for its owner in dev *and* production, on every route.
`tsc` / `vitest` / `eslint` cannot see it: each side is consistent with itself.

**Fix (applied 2026-09-24, `src/middleware.ts`)** — derive exactly 32 bytes and import them as the HMAC key,
matching `session.ts`:

```ts
const signingKeyBits = await crypto.subtle.deriveBits(
  { name: 'HKDF', hash: 'SHA-256',
    salt: encoder.encode('rr-admin-session-signing-v1'), info: encoder.encode('rr-admin') },
  baseKey,
  256,                                   // must equal hkdfSync(..., 32) in session.ts
)
const key = await crypto.subtle.importKey('raw', signingKeyBits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
```

Verified afterwards: `/admin`, `/admin/orders`, `/admin/catalog/products` all answer **`200`** with the
minted token and the module nav present; `npm run type-check` clean. **Regression test still missing** —
sign a payload the way `session.ts` does and assert the Edge verifier accepts it (a plain Node test can do
this with `crypto.subtle.deriveBits`, which is exactly how the mismatch was found).

### A2 — The storefront cookie banner renders **inside** the panel, covers the module nav, and its primary button is 1.67:1
**Evidence (live DOM, desktop 1440×900, `/admin`; identical on all 23 routes):**

```
[aria-label="Cookie consent"]  position: fixed   z-index: 2000   rect: top 813, height 87
  covers module links: "Abandoned Carts …", "Homepage …"
  elementFromPoint(centre of a covered link) → p.MuiTypography-body2 :: "We use essential cookies to ke…"
  ACCEPT          rgb(255,255,255) on rgb(196,146,26) → 1.67:1   box  95×31
  ESSENTIAL ONLY  rgb(153,153,153) on rgb(26,26,26)   → 4.28:1   box 146×31
  MANAGE          rgb(196,146,26)  on rgb(26,26,26)   → 4.15:1   box  83×31
  Cookie policy   rgb(196,146,26)  on rgb(26,26,26)   → 4.15:1   (14px)
```

**Source.** `CookieBanner` is mounted in the **root layout** (`src/app/layout.tsx:89`), so it is part of
every storefront *and* every admin page. `elementFromPoint` at the centre of the "Abandoned Carts" module
link returns the banner's own paragraph — the occlusion is measured, not inferred — because the banner is
`position: fixed; bottom: 0; zIndex: 2000` (`CookieBanner.tsx:74-79`) and the module rail is ordinary
document flow (`AdminShell.tsx:327-365`). The `ACCEPT` figure is **Part 1's C2** measured correctly at last
(that button uses a solid `background: brandTokens.forgeGold`, so this one is *not* the gradient artifact).

**Why it matters.** On a 1440×900 staff laptop, two of the twelve modules are **unclickable** until someone
dismisses a *storefront* consent bar inside the admin tool — and they are the last two items, exactly where
a pointer lands without looking. (On `/admin/login` the same bar occupies the bottom 87 px of the viewport
but does **not** overlap the form — measured: form y 215–327, banner top 813, inputs under the banner: 0 —
so this is an admin-shell problem, not a login one.)

**Fix:**
1. Don't render it in the panel: `if (pathname.startsWith('/admin')) return null` in `CookieBanner`, or move
   `<CookieBanner />` out of the root layout into the storefront layout.
2. `CookieBanner.tsx:131` → `color: 'primary.contrastText'` (theme `#0C0A07` = **7.03:1** on gold), and lift
   `Cookie policy` / `MANAGE` / `ESSENTIAL ONLY` to ≥4.5:1 (`alpha(parchment, 0.8)` or a lighter
   `parchmentMuted`).
3. `minHeight: { xs: 44, sm: 31 }` on the three buttons — they are 31 px tall on touch as well.

### A3 — "Skip to main content" points at a target that does not exist on any panel page
**Evidence (live DOM, `/admin`, `/admin/orders`, `/admin/homepage`, `/admin/catalog/products/<id>`):**

```
a[href="#main-content"] "Skip to main content"   → targetExists: false
document.querySelector('main')                   → null
```

`SkipToMain` (`src/components/common/SkipToMain.tsx:10`) comes from the root layout and its `href` is
`#main-content`. Every **storefront** page renders `<Box component="main" id="main-content">`; the **panel
shell** renders a grid of `aside` + `section` (`AdminShell.tsx:326-379`) with neither. Only `/admin/login`
and `/admin/mfa-challenge` have a `main` (they bypass the shell). The link is the first focusable element on
23 routes and does nothing — WCAG 2.4.1 (Bypass Blocks) unmet, and it is also the first thing the panel's
own `innerText` contains in all 69 captures.

**Fix.** In `AdminShell`, make the content column `component="main" id="main-content"` — it is already the
single content region, so this one attribute fixes the skip link *and* creates the missing landmark (A8).

### A4 — Four routes scroll the whole document sideways (up to 443 px)
**Evidence (`audit.json`, `documentElement.scrollWidth − clientWidth`):**

| route | desktop 1440 | tablet 834 | mobile 390 |
|---|---|---|---|
| `/admin/homepage` | **140** | **443** | **308** |
| `/admin/catalog/products/<id>` | 0 | 0 | **123** |
| `/admin/catalog/products/<id>/builder` | 0 | 0 | **129** |
| `/admin/abandoned-carts` | 0 | 0 | **104** |
| the other 19 routes | 0 | 0 | 0 |

**Root cause (hide-and-measure, `/admin/homepage` at 390 px):** hiding the content `section` collapses
`scrollWidth` 698 → 390; inside it a card row measures **612 px** in a 390 px viewport and the leaf setting
that floor is a `p.MuiTypography-body1` at **536 px** — a section description plus the `MuiSwitch` next to
it. On the product page the same shape appears as a **469 px** media row (the disabled `Add Media` button is
469×47 there) with the filename `photo_2026-08-01_20-25-47`. These are flex/grid children keeping the CSS
default `min-width: auto`, so long unbreakable strings (filenames, URLs, descriptions) widen the row and
then the document.

**Why it matters.** `/admin/homepage` edits the shop window and is unusable at 834 px without panning —
the tablet overflow (443 px) is *worse* than desktop. Sideways scrolling also drags the sticky header and
the module rail around, so the panel loses its orientation cues exactly when it is already crowded.

**Fix.** `minWidth: 0` on the shell's grid children (`AdminShell.tsx:326` `gridTemplateColumns`) and on the
editor row containers, plus `overflowWrap: 'anywhere'` (or `minWidth: 0` + ellipsis) for descriptions,
filenames and URL fields; same for the media row on the product pages. Re-check with
`node .tmp-admin-capture.mjs http://localhost:3210 --vp=mobile --routes=22`.

## 3. Layout & visual

### A5 — On a phone the panel spends 906 px on chrome before any content
**Evidence (live DOM, `/admin` at 390×844):**

```
header (sticky)  height 118
aside (module rail)  top 137, height 788        ← 12 modules, each ~65px
content section top  943                        ← i.e. 943 of an 844px viewport
body height 2260                                ← for a page whose own content is ~1,300px
```

The rail is `gridTemplateColumns: { xs: '1fr', md: '280px minmax(0, 1fr)' }` (`AdminShell.tsx:326`), so
below `md` the 12-item module list stacks *above* the page and must be scrolled past in full before any
content appears — after the 118 px sticky header. On the dashboard that is **943 px** of nav for a page whose
main content starts immediately below it.

**Fix.** Below `md`, collapse the rail into a disclosure (a `Select`/`Menu` "Dashboard ▾" or a `Drawer`
behind a header button) and mark the current module in the trigger; keep the full rail for `md`+ where it
costs nothing.

### A6 — Every page shares one `<title>`, and the shell header always says "Admin Dashboard"
**Evidence (all 69 captures):**

```
distinct document titles: ["Ruby's Relics Studio"]        ← the storefront default, exported by the root layout
header.innerText = "Admin Dashboard  Sign out"            ← identical on /admin/orders, /admin/homepage, …
```

`src/app/layout.tsx:26-30` sets `title.default = "Ruby's Relics Studio"` and no admin page overrides it, so
browser tabs, history and bookmarks are indistinguishable across 23 routes (the storefront pass had a unique
title per route — this is an admin-only regression). The sticky bar's label is hard-coded
(`AdminShell.tsx:176`), so the one persistent orientation cue points at the dashboard even while you are
editing the storefront.

**Fix.** Either set per-route `metadata` on the panel pages, or derive the label once: pass the active module
(already computed via `pathname`) into the header and render `{activeModule.label}`; keep the document title
in sync with it. This also removes the duplicated "ADMIN DASHBOARD" that appears twice on the dashboard.

### A7 — Heading structure is missing or inconsistent on 23/23 routes
**Evidence (`audit.json` + live DOM):**

| pattern | routes |
|---|---|
| **no `h1` at all** | `/admin/schedule`, `/admin/abandoned-carts`, `/admin/catalog/products/<id>`, `/admin/catalog/products/<id>/pricing`, `/admin/shipping/debug` |
| `h1` then `h6` for section titles (**1 → 6 skip**) | `/admin/homepage` (`h1 Homepage`, then `h6 Section Visibility / Hero Collage / Shortcut Tile Editors / Quick Picks / Process Picks`) |
| starts at `h5` | `/admin/abandoned-carts` (`h5 Abandoned Cart Recovery`) |
| starts at `h6` | `/admin/catalog/products/<id>` (`h6 Media`, `h6 Options`) |
| `h1` sizes disagree | 30px (`/admin`, `/admin/finance`), 24px (most), 20px (`/admin/catalog/*` sub-pages, `/admin/catalog/products/<id>/builder`) |

**Why it matters.** "Navigate by heading" is how a screen-reader user scans a panel; here 5 pages have no
entry point and others jump straight to level 6, so the heading outline is unusable — and the inconsistent
h1 size makes the same structural role look like three different things.

**Fix.** One `h1` per panel page (the page title, one size from the type scale), `h2` for each card/section
title, `h3` for nested groups. `/admin/homepage`'s five `h6` section titles are the biggest win — they are
`h2`s in the document's own terms.

## 4. Accessibility & polish

### A8 — The panel has no `main` landmark, its primary nav is an unnamed `aside`, and the current page is never announced
**Evidence (live DOM, `/admin` and `/admin/orders`; identical shape on 69/69 captures):**

```
landmarks: header 1, aside 1, section 1, main 0, nav 0, footer 0
aside a (12 module links)  → aria-current: []          ← nothing marks the current page
active styling (only signal): borderColor rgba(196,146,26,0.45), backgroundColor rgba(196,146,26,0.12)
on /admin/catalog/products/<id>  → selfLinkActive: [], styling: []
```

Two problems in one region: (1) the 12 module links are plain anchors inside an `<aside>` with no
`<nav>` and no accessible name, so the panel's primary navigation is announced as an unnamed complementary
region rather than as navigation; (2) the "you are here" state is **colour and border only** — no
`aria-current="page"`, no `aria-label`, nothing textual — so a screen-reader user gets no current-page
information at all (WCAG 1.3.1 / 4.1.2). Worse, on the nested catalog routes the highlight disappears
entirely, because the active check is `pathname === mod.href` (`AdminShell.tsx:338`) and
`/admin/catalog/products/<id>` never equals `/admin/catalog`: five routes lose the marker for sighted users
too.

**Fix.** Wrap the rail in `component="nav" aria-label="Admin modules"`; add `aria-current={active ? 'page' : undefined}`; compute `active` with `pathname === mod.href || pathname.startsWith(mod.href + '/')`.

### A9 — Nameless controls: 17 section switches, every filter `Select`, the global search field, and unnamed icon buttons
**Evidence (live DOM):**

```
/admin/homepage   input.MuiSwitch-input ×17  →  aria-label: null, aria-labelledby: null, closest('label'): false
                  nearest row text: "Hero Banner Full-width hero at the very top of the page."
/admin/orders     div[role=combobox] "All statuses"  →  aria-labelledby: null   (also "All payments")
                  hidden nativeInput: aria-hidden="true", tabindex="-1"
/admin/catalog/products/<id>  4× div[role=combobox]  →  aria-labelledby: null
                  ("Drinkware", "text", "Extra-Text", …)
/admin/homepage   button (icon-only, 26×26) ×4 → no text, no aria-label, no title  (move up/down reorderers)
all 23 routes     header search input  →  no label, no aria-label; placeholder-only
```

The section-visibility switches are the panel's most-used control — 17 toggles whose only name is *adjacent
text that is not associated with them*. A screen reader announces "checkbox, unchecked" seventeen times with no
way to tell which section it toggles. The filter `Select`s on orders/catalog/inventory/finance/catalog-pricing
announce the *selected value* ("All statuses") with no clue what they filter — the MUI `Select` here has no
`label`/`labelId`, so neither the visible `div[role=combobox]` nor the hidden input carries a name. The header
search input is the one control that is on every page in the panel and it is placeholder-only (placeholder is
not an accessible name). All 17 switches also live in a card whose own heading is an `h6` (A7).

**Count confirmed from source (re-read 2026-09-24).** The visibility grid renders one **bare** `<Switch>` per
`SECTION_ORDER` key, and that array holds **17** keys
(`src/app/admin/(panel)/homepage/page.tsx:30-48` → `:456-515`, the `<Switch>` at `:507`), so 17 is
structural rather than data-dependent — the grid is keyed off a static list, not off DB rows.
`a11y-homepage.json` agrees: **17** `namelessControls`, all `MuiSwitch-input`, all `72x24`. The sweep's
`summary.txt` reported 15 and so missed two. Note the same page already contains the correct pattern twice:
the `FormControlLabel`-wrapped switches at `:553` (Hero Collage) and `:742` (tile editor) *are* named.

**Fix.** `FormControlLabel control={<Switch …/>} label="Hero Banner"` (or
`aria-labelledby` pointing at the row's text) for each toggle; `<FormControl><InputLabel id>…<Select labelId>`
for each filter; `aria-label="Global search"` (or a real `<label>`) on the search field;
`aria-label="Move up"/"Move down"` on the icon buttons.

### A10 — Contrast: the entire muted-text tier of the panel fails, plus the status chips and the destructive buttons
**Evidence (automated sweep, corrected where the gradient artifact applies — see §0.2):**

| element | measured | note |
|---|---|---|
| module-nav descriptions, 11.2px — `rgba(237,224,204,0.52)` | **4.06:1** | pixel-verified: card backdrop sampled as **(27,21,15)** at 1440×900; the sweep said 5.7:1 against the void |
| stat-tile labels on `/admin/catalog` (`Total Products`, `Categories`, `Promotions`, `Archived`) at 14px | **3.46:1** | `#9E8A6A` on `rgb(35,31,25)` — the `parchmentMuted` token |
| `Pending` / `3 pre-checkout pending` chips on `/admin/abandoned-carts`, 13px | **1.84:1** | white on `rgb(201,123,34)` |
| `Delete` (contained) on `/admin/catalog/products`, 13px | **2.5:1** | white on `rgb(207,64,64)` |
| `Delete` (text) on `/admin/catalog/categories` / `/processes`, 13px | **3.41:1** | `rgb(207,64,64)` on `rgb(22,18,16)` |
| cookie banner labels (see A2) | **4.15–4.28:1** | `MANAGE`, `Cookie policy`, `ESSENTIAL ONLY` |

**Why it matters.** An admin panel's text *is* the product — every one of these is a label you have to read
correctly to avoid changing the wrong thing. The 11.2px module descriptions are the only explanation of what
twelve modules do, and they are the smallest *and* lowest-contrast text on every page; the `Pending` chip is
the recovery state of a real customer cart. The muted tier (`alpha(parchment, 0.52)` in
`AdminShell.tsx:359`, `parchmentMuted` for stat labels) is the same systemic pattern as Part 1's **C3**, so
fixing it once in the theme fixes the panel too.

**Fix.** Raise the description tier to ≥`alpha(parchment, 0.68)` (≈5.9:1 on that backdrop) and give it
≥12px; use `parchment`/`parchmentMuted` at ≥4.5:1 for stat labels; status chips need a dark label on a
lighter tint (or an outline chip) instead of white-on-amber; `Delete` needs the ruby ramp
(`#9B1C1C`-family) with a light label, not white on `#CF4040`.

### A11 — Disabled actions still look like the live gold action (Part 1's C1, now in the panel)
**Evidence (live DOM, desktop):**

```
/admin/inventory   "Apply to 0 selected"  1039×45  disabled
     background-image: linear-gradient(135deg, rgb(138,101,16) 0%, rgb(196,146,26) 60%, …)
     background-color: rgba(255,255,255,0.12)      color: rgba(255,255,255,0.3)   opacity: 1
/admin/catalog/products/<id>  "Add Media"  130×47 (469×47 at 390px)  disabled
     background-image: none       color: rgba(255,255,255,0.3)
/admin/catalog/products/<id>/builder  "Upload file"  132×47  disabled, color rgba(255,255,255,0.3)
/admin/homepage   4 × 26×26 icon buttons  disabled, color rgba(255,255,255,0.3)
```

**Why it matters.** Same mechanism as §8.1: the theme paints the primary fill with `background-image`
(`theme.ts:161`) and MUI's disabled rule only overrides `background-color`, so the gold gradient survives at
full strength while the label falls to 30 % white — ≈2:1 on gold for `Apply to 0 selected`, ≈2.6:1 for the
grey-on-card buttons. Disabled and enabled look the same at a glance and the text cannot be read.
`Apply to 0 selected` is the worst case: it is the bulk action, it is disabled *because of its own label*,
and it is 1039 px wide.

**Fix.** The single `&.Mui-disabled` token proposed in §8.1 (`theme.ts:151`) fixes the storefront **and**
these; add `MuiIconButton` to it. Also make `Apply to 0 selected` read as a state rather than an action
(`0 selected — select rows to apply`), which is A12's pattern too.

### A12 — Empty states and notices are emitted as duplicated `role="alert"`
**Evidence (live DOM, desktop; every string appears twice):**

```
/admin/orders        [role=alert] ×2  "No orders matched the current filters."
/admin/inventory     [role=alert] ×2  "Pick a product from the list below to edit stock settings."
                     [role=alert] ×2  "No ready-made products were found for inventory control."
/admin/shipping      [role=alert] ×2  "Shippo is in test mode. Rates will be from Shippo's test carriers."
/admin/shipping/debug ×2              "This tool sends live API requests to Shippo. Use only for testing…"
```

**Why it matters.** `role="alert"` is an *assertive* live region: a screen reader interrupts whatever it was
reading to announce it — and here it announces the same sentence twice, from two visible nodes. An empty
state is static content: it should be plain text (at most `role="status"`) rendered once. The
`shipping/debug` warning is the one case where an alert is defensible, but it still fires twice for a
page-load condition. (Positive: that warning *is* present before the tool sends live Shippo requests.)

**Fix.** Render the empty state once as ordinary text, wrap in `role="status"` if a live region is wanted,
and keep `role="alert"` for event-driven failures only (failed save, rejected API call).

## 5. Ideas (panel efficiency)

Not defects — the highest-leverage changes for the person who uses this panel daily.

1. **Make the four dashboard tiles act.** `Awaiting Quote / Quote Sent / Orders Paid / Awaiting Payment` are
   inert cards, yet they are the panel's only summary. Linking each to its filtered list
   (`/admin/custom-requests?status=…`) turns the dashboard into the working entry point it pretends to be —
   the counts already come from the same endpoints the list pages fetch.
2. **Give the global search a shortcut and a name.** It already searches modules *and* live
   orders/products/custom requests from every page (`AdminShell.tsx:87-105`); today it is an unlabelled
   placeholder box that costs a click to reach. `Ctrl/⌘-K` plus an `aria-label` makes it the fastest way
   around the panel.
3. **Sticky save bars for the long editors.** `/admin/homepage` is 5,353 px tall on desktop (7,736 px on
   mobile) with per-card saves (`Save Visibility`, `Save Collage Settings`, `Quick Picks`, `Process Picks`):
   after editing the bottom of a card, its save control is already off-screen. A sticky per-card footer — or
   one sticky bar bound to the dirty card — removes the scroll-back-and-forth.
4. **Say why a control is disabled** (A11) and let the disabled styling be honest, so the panel never looks
   broken while it is only waiting for a selection.
5. **One shared, labelled filter bar.** Orders, catalog products, inventory, finance and catalog pricing each
   render their own selects at different positions — all unnamed (A9). A single component fixes the naming,
   the placement, and lets the filter survive navigation (today the same list is re-filtered repeatedly).

## Severity (admin pass)

| ID | Finding | Severity | Blast radius | Effort |
|---|---|---|---|---|
| A1 | Edge verifier vs signer key mismatch → **panel unreachable** | Critical | 100 % of admin logins | S — ✅ **fixed** |
| A2 | Storefront cookie banner inside the panel: covers 2 modules, `Accept` 1.67:1, 31 px buttons | High | all 23 routes | S |
| A3 | "Skip to main content" has no target (no `main` on 23 routes) | High (a11y) | all 23 routes | XS |
| A4 | Document scrolls sideways (homepage editor at **all** viewports; 3 pages at 390 px) | High | 4 routes | S |
| A10 | Muted tier 3.46–4.06:1, `Pending` 1.84:1, `Delete` 2.5:1 | High | all 23 routes | S (theme) |
| A8 | No `main`/`nav` landmark, unnamed `aside`, no `aria-current`, marker lost on nested routes | Medium-High | all 23 routes | XS |
| A9 | Nameless controls: 17 switches, all filter `Select`s, search field, icon buttons | Medium-High | 17 switches + selects/search/4 icons, over 9 routes | S |
| A5 | 906 px of chrome before content on a phone (118 header + 788 rail) | Medium | ≤`md` | M |
| A6 | One `<title>` for 23 routes; header label always "Admin Dashboard" | Medium | all 23 routes | XS |
| A7 | No `h1` on 5 routes, `h1→h6` skip, three different `h1` sizes | Medium | all 23 routes | S |
| A11 | Disabled actions keep the gold gradient with a 30 %-white label | Medium | 4 routes | XS (same as §8.1) |
| A12 | Empty states emitted as duplicated `role="alert"` | Low | 4 routes | XS |

## Appendix C — measured matrix (admin pass, route × viewport)

`pageH` = full document height · `hOv` = `scrollWidth − clientWidth` · `h1` = number of `<h1>` ·
`sub12` = text nodes under 12px (the 12 × 11.2px module descriptions are in every row, plus page-specific
ones) · `flags` = automated contrast flags (leads only — see §0.1–0.2) · `tap<24` = the raw un-WCAG-aware
counter, which is **1 in every row** and always the banner's `Cookie policy` link (84×17, see A2) ·
`api` = non-2xx `/api/admin/*` responses / total. **D** = 1440×900, **T** = 834×1112, **M** = 390×844.
Layout height differences are dominated by the module rail: below `md` it stacks above the content (A5), so
`T`/`M` are always taller than `D`. The product `<id>` is
`8da6647e-c0e6-4332-883e-9ed40c5d154a` (`sippy-cup`, active).

| route | vp | pageH | hOv | h1 | sub12 | flags | tap<24 | api |
|---|---|---|---|---|---|---|---|---|
| `/admin` | D | 992 | 0 | 1 | 16 | 4 | 1 | 0/0 |
| `/admin` | T | 2076 | 0 | 1 | 16 | 4 | 1 | 0/0 |
| `/admin` | M | 2260 | 0 | 1 | 16 | 4 | 1 | 0/0 |
| `/admin/custom-requests` | D | 992 | 0 | 1 | 14 | 5 | 1 | 0/2 |
| `/admin/custom-requests` | T | 1786 | 0 | 1 | 14 | 5 | 1 | 0/2 |
| `/admin/custom-requests` | M | 1832 | 0 | 1 | 14 | 5 | 1 | 0/2 |
| `/admin/orders` | D | 992 | 0 | 1 | 12 | 4 | 1 | 0/2 |
| `/admin/orders` | T | 1288 | 0 | 1 | 12 | 4 | 1 | 0/2 |
| `/admin/orders` | M | 1361 | 0 | 1 | 12 | 4 | 1 | 0/2 |
| `/admin/catalog` | D | 992 | 0 | 1 | 12 | 8 | 1 | 0/2 |
| `/admin/catalog` | T | 1461 | 0 | 1 | 12 | 8 | 1 | 0/2 |
| `/admin/catalog` | M | 1967 | 0 | 1 | 12 | 8 | 1 | 0/2 |
| `/admin/catalog/products` | D | 1276 | 0 | 1 | 12 | 20 | 1 | 0/2 |
| `/admin/catalog/products` | T | 2710 | 0 | 1 | 12 | 20 | 1 | 0/2 |
| `/admin/catalog/products` | M | 3211 | 0 | 1 | 12 | 20 | 1 | 0/2 |
| `/admin/catalog/products/new` | D | 992 | 0 | 1 | 12 | 5 | 1 | 0/2 |
| `/admin/catalog/products/new` | T | 1378 | 0 | 1 | 12 | 5 | 1 | 0/2 |
| `/admin/catalog/products/new` | M | 1425 | 0 | 1 | 12 | 5 | 1 | 0/2 |
| `/admin/catalog/products/<id>` | D | 1725 | 0 | 0 | 12 | 6 | 1 | 0/6 |
| `/admin/catalog/products/<id>` | T | 3578 | 0 | 0 | 12 | 6 | 1 | 0/6 |
| `/admin/catalog/products/<id>` | M | 3600 | **123** | 0 | 12 | 6 | 1 | 0/6 |
| `/admin/catalog/products/<id>/builder` | D | 3657 | 0 | 1 | 16 | 9 | 1 | 0/14 |
| `/admin/catalog/products/<id>/builder` | T | 6278 | 0 | 1 | 16 | 9 | 1 | 0/14 |
| `/admin/catalog/products/<id>/builder` | M | 6339 | **129** | 1 | 16 | 9 | 1 | 0/14 |
| `/admin/catalog/products/<id>/pricing` | D | 992 | 0 | 0 | 12 | 5 | 1 | 0/6 |
| `/admin/catalog/products/<id>/pricing` | T | 2001 | 0 | 0 | 12 | 5 | 1 | 0/6 |
| `/admin/catalog/products/<id>/pricing` | M | 2020 | 0 | 0 | 12 | 5 | 1 | 0/6 |
| `/admin/catalog/categories` | D | 1481 | 0 | 1 | 12 | 13 | 1 | 0/2 |
| `/admin/catalog/categories` | T | 3038 | 0 | 1 | 12 | 13 | 1 | 0/2 |
| `/admin/catalog/categories` | M | 3283 | 0 | 1 | 12 | 13 | 1 | 0/2 |
| `/admin/catalog/processes` | D | 992 | 0 | 1 | 12 | 9 | 1 | 0/2 |
| `/admin/catalog/processes` | T | 2053 | 0 | 1 | 12 | 9 | 1 | 0/2 |
| `/admin/catalog/processes` | M | 2202 | 0 | 1 | 12 | 9 | 1 | 0/2 |
| `/admin/catalog/pricing` | D | 1031 | 0 | 1 | 12 | 4 | 1 | 0/4 |
| `/admin/catalog/pricing` | T | 2234 | 0 | 1 | 12 | 4 | 1 | 0/4 |
| `/admin/catalog/pricing` | M | 2280 | 0 | 1 | 12 | 4 | 1 | 0/4 |
| `/admin/catalog/future-products` | D | 992 | 0 | 1 | 12 | 5 | 1 | 0/2 |
| `/admin/catalog/future-products` | T | 1820 | 0 | 1 | 12 | 5 | 1 | 0/2 |
| `/admin/catalog/future-products` | M | 1893 | 0 | 1 | 12 | 5 | 1 | 0/2 |
| `/admin/catalog/future-product-statuses` | D | 992 | 0 | 1 | 12 | 5 | 1 | 0/2 |
| `/admin/catalog/future-product-statuses` | T | 1488 | 0 | 1 | 12 | 5 | 1 | 0/2 |
| `/admin/catalog/future-product-statuses` | M | 1534 | 0 | 1 | 12 | 5 | 1 | 0/2 |
| `/admin/pricing` | D | 992 | 0 | 1 | 12 | 5 | 1 | 0/0 |
| `/admin/pricing` | T | 1147 | 0 | 1 | 12 | 5 | 1 | 0/0 |
| `/admin/pricing` | M | 1296 | 0 | 1 | 12 | 5 | 1 | 0/0 |
| `/admin/inventory` | D | 992 | 0 | 1 | 12 | 5 | 1 | 0/2 |
| `/admin/inventory` | T | 1830 | 0 | 1 | 12 | 5 | 1 | 0/2 |
| `/admin/inventory` | M | 2012 | 0 | 1 | 12 | 5 | 1 | 0/2 |
| `/admin/shipping` | D | 1207 | 0 | 1 | 12 | 5 | 1 | 0/2 |
| `/admin/shipping` | T | 1989 | 0 | 1 | 12 | 5 | 1 | 0/2 |
| `/admin/shipping` | M | 2216 | 0 | 1 | 12 | 5 | 1 | 0/2 |
| `/admin/shipping/debug` | D | 992 | 0 | 0 | 12 | 11 | 1 | 0/0 |
| `/admin/shipping/debug` | T | 1588 | 0 | 0 | 12 | 11 | 1 | 0/0 |
| `/admin/shipping/debug` | M | 1723 | 0 | 0 | 12 | 11 | 1 | 0/0 |
| `/admin/finance` | D | 1117 | 0 | 1 | 30 | 6 | 1 | 0/4 |
| `/admin/finance` | T | 2488 | 0 | 1 | 30 | 6 | 1 | 0/4 |
| `/admin/finance` | M | 2579 | 0 | 1 | 30 | 6 | 1 | 0/4 |
| `/admin/settings` | D | 1667 | 0 | 1 | 12 | 5 | 1 | 0/2 |
| `/admin/settings` | T | 2430 | 0 | 1 | 12 | 5 | 1 | 0/2 |
| `/admin/settings` | M | 2787 | 0 | 1 | 12 | 5 | 1 | 0/2 |
| `/admin/schedule` | D | 992 | 0 | 0 | 12 | 4 | 1 | 0/2 |
| `/admin/schedule` | T | 1360 | 0 | 0 | 12 | 4 | 1 | 0/2 |
| `/admin/schedule` | M | 1561 | 0 | 0 | 12 | 4 | 1 | 0/2 |
| `/admin/abandoned-carts` | D | 992 | 0 | 0 | 12 | 8 | 1 | 0/2 |
| `/admin/abandoned-carts` | T | 1418 | 0 | 0 | 12 | 8 | 1 | 0/2 |
| `/admin/abandoned-carts` | M | 1616 | **104** | 0 | 12 | 8 | 1 | 0/2 |
| `/admin/homepage` | D | 5353 | **140** | 1 | 30 | 4 | 1 | 0/2 |
| `/admin/homepage` | T | 6084 | **443** | 1 | 30 | 4 | 1 | 0/2 |
| `/admin/homepage` | M | 7736 | **308** | 1 | 30 | 4 | 1 | 0/2 |

## Appendix D — what I deliberately did **not** file (admin pass)

- The `1:1` / `1.37:1` gradient flags (`Add Product`, `Save Product`, `Create Category`,
  `Run Recovery Reminders`, `Open Catalog Pricing Controls`, `Save Visibility`, …) — gradient artifact
  (§0.1): `#0C0A07` labels on the gold fill ≈7:1. They pass.
- The 12 (16 / 30) sub-12px entries on every page — the same 11.2px module description counted once per
  capture; filed **once** as A10 instead of 23 times.
- `MuiSelect-nativeInput` (`aria-hidden`, `tabindex="-1"`) and the `visibility: hidden` autosize textarea —
  MUI internals, not controls (§0.3).
- `input[type=file]` with no accessible name at 0×0 (product detail, homepage) — the visible control is the
  labelled button, and the homepage's six file inputs sit inside `<label>` elements.
- The `26×26` icon buttons: 26 px clears the SC 2.5.8 24 px minimum, and disabled controls are exempt from
  target size entirely. Their missing **names** are filed (A9).
- `/favicon.ico` 404 and the CSP-blocked `https://va.vercel-scripts.com/v1/script.debug.js` — expected noise
  in this environment, now documented in `UI_AUDIT.md` §15.6.
- The admin bar "appearing" mid-page in tall mobile tiles — a `captureBeyondViewport` artifact with
  `position: sticky` (§0.5), not a layout bug.
- `Add Media` being 469 px wide in a 390 px viewport — that is one of A4's overflow *causes*, so it is fixed
  by A4 rather than filed as a separate sizing defect.
- The dashboard's four `0` tiles — checked against the database (both custom requests are `cancelled`,
  `exp_orders` is empty), so they are honest numbers, not a bug.
- `3 pre-checkout pending` reading like a sentence fragment — a copy nit, no source-level defect.
- **Behaviours never exercised.** This pass is read-only: no clicks, dialogs, drag-reorder or save
  round-trips. So the following are **unverified** (not verified-good): that each editor's `Save` writes what
  the form shows, that `Delete` / `Archive` confirm before acting, keyboard support for the homepage reorder
  buttons, and what the panel shows when an admin API call fails. An interaction pass needs a disposable test
  row plus the CSRF header `AdminCsrfFetchBridge` supplies (`UI_AUDIT.md` §15.6).
