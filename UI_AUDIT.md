# UI Audit — Method (how this was done)

> **Purpose of this file:** a runbook for *how* the storefront UI audit was performed, so the
> same pass can be repeated later (after changes, before launch, or on a new branch) without
> re-deriving the tooling. It is deliberately **methodology only**.
>
> **Findings are intentionally NOT recorded here yet** — they are still being planned. See
> §11 for where they will live.

Audited target: the public storefront (`src/app/page.tsx` and the homepage sections under
`src/components/home/`) rendered by the real app against the real Supabase data.

## 1. TL;DR of the recipe

1. Start the dev server on a free port, **and only ever browse it via `http://localhost:<port>`**.
2. Drive **headless Microsoft Edge over the Chrome DevTools Protocol (CDP)** with a throwaway
   Node script — no browser-automation dependency is installed in this repo, and none is needed.
3. At each viewport, set device metrics, navigate, settle, force lazy content, then
   `Page.captureScreenshot` with `captureBeyondViewport: true`.
4. Slice the tall PNG into ~1500 px tiles with **`pngjs`** (already a `dependency` here) so the
   images can be reviewed a screen at a time.
5. In the same run, collect a machine-readable structural audit (heights, overflow, headings,
   font sizes, tap targets, broken images, console + failed requests) into `audit.json`.
6. Verify anything suspicious at the **pixel level** with mean/std-dev stats on the PNG regions —
   this catches "the element is in the DOM but nothing is painted".
7. Cross-check content claims against **Supabase** (read-only) instead of guessing from the DOM.
8. Delete the throwaway scripts, kill Edge and the dev server, and confirm `git status` is clean.

For the **authenticated admin panel** (`/admin`) the harness is unchanged — only the session
bootstrap differs. See **§15** for the dev-only sign-in helper.

## 2. Environment facts (verified)

| Thing | Value |
|---|---|
| OS / shell | Windows, **PowerShell 7 (`pwsh.exe`)** |
| Node | **v24.18.0** — has a **global `WebSocket`**, so the CDP client needs no `ws` package |
| Framework | Next.js **16.3.4** (App Router, Turbopack), React 19.2.5 |
| Browser | `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` (Chromium, CDP-compatible) |
| Pixel lib | **`pngjs@7`** — already in `dependencies`, typed via `@types/pngjs` |
| Not installed | **No Playwright, no Puppeteer, no Lighthouse** — do not add them for this |
| Dev port used | **3210** (avoids clashing with a default 3000 instance) |

Because `pngjs` and Node's built-in `WebSocket` already exist here, this whole audit runs with
**zero new dependencies**. That is the main reason for the CDP-from-scratch approach.

## 3. Step 1 — Start the dev server (respect the origin rule)

```powershell
cd d:\RubysRelicsStudio
npm run dev -- -p 3210 *> (Join-Path $env:TEMP 'rrs-dev.out.log')
```

Then wait for the port to answer before capturing:

```powershell
Start-Sleep -Seconds 25
Get-NetTCPConnection -LocalPort 3210 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

**⚠️ The single most important gotcha: audit `http://localhost:3210`, never
`http://127.0.0.1:3210`.**

Next 16 blocks cross-origin dev requests (`/_next/hmr`, the Turbopack dev runtime). Browsing the
dev server on the literal IP yields a page that **looks** fine in a screenshot but is dead:
React never hydrates, so client-rendered pieces never appear (banner missing, animated/collage
layers stuck at `opacity: 0`, nav drawer unresponsive). The evidence shows up in the dev log as
rejected `/_next/*` requests, and in the browser console as CSP/cross-origin errors.

Symptoms that mean "you are on the wrong origin, re-run on `localhost`":

- `Runtime.evaluate` finds **no** `__reactFiber$…` / `__reactProps$…` keys on any DOM node.
- Animated layers report `opacity: 0` while their markup exists.
- Interactive probes (clicking a menu button) do nothing.

If you ever *must* use the IP, add it to `next.config.ts`:

```ts
allowedDevOrigins: ['127.0.0.1'],
```

Do **not** put a production build through this path — the dev-only cross-origin rule and the
Turbopack override panels both distort what a real visitor sees. If in doubt about render
behaviour, re-run against `npm run build && npm start`.

## 4. Step 2 — Drive headless Edge over CDP

Throwaway script at repo root, named with a `.tmp-` prefix so it is obviously disposable
(and never committed — see §10). Representative skeleton:

```js
// .tmp-capture.mjs
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9222
const URL  = process.argv[2] || 'http://localhost:3210/'   // localhost, not 127.0.0.1

import { spawn } from 'node:child_process'

const edge = spawn(EDGE, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}\\rrs-edge-profile`,  // throwaway profile
  '--no-first-run', '--no-default-browser-check',
  '--disable-gpu', '--hide-scrollbars',
  '--window-size=1440,900',
  'about:blank',
], { stdio: 'ignore' })

// 1) discover a page target
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const page = list.find(t => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)   // Node >= 22 global, no `ws` dep

// 2) tiny CDP client: correlate responses by id, dispatch events by method
let id = 0
const pending = new Map()
const events = []
ws.addEventListener('message', e => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id) }
  else if (msg.method) events.push(msg)               // Page.*, Log.*, Network.*, Runtime.*
})
const send = (method, params = {}) =>
  new Promise(res => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })) })
```

Enable the domains up front — `Log` and `Network` are what surface CSP violations:

```js
await send('Page.enable')
await send('Log.enable')        // security/CSP entries arrive as Log.entryAdded
await send('Network.enable')    // blocked requests arrive as Network.loadingFailed
await send('Runtime.enable')
```

Per-viewport setup, then navigate and settle:

```js
await send('Emulation.setDeviceMetricsOverride', {
  width, height, deviceScaleFactor: 1, mobile: isMobile,   // dsf=1 keeps pixel math 1:1
})
if (isMobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

await send('Page.navigate', { url: URL })
// wait for Page.loadEventFired, then a fixed settle (~2s) for hydration + entry animations
```

## 5. Step 3 — Capture full-page and slice into tiles

Images are lazy-loaded, so walk the page before shooting, then return to the top:

```js
await send('Runtime.evaluate', { expression: `
  (async () => {
    const step = innerHeight
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      scrollTo(0, y); await new Promise(r => setTimeout(r, 250))
    }
    for (const img of document.images) if (!img.complete) img.loading = 'eager'
    scrollTo(0, 0); await new Promise(r => setTimeout(r, 400))
  })()
`, awaitPromise: true })
```

Full-page shot, then slice with the already-installed `pngjs`:

```js
const { data } = await send('Page.captureScreenshot', {
  format: 'png', captureBeyondViewport: true, fromSurface: true,
})

// slice into ~1500px-tall tiles so each one can be reviewed on its own
import { PNG } from 'pngjs'
const src = PNG.sync.read(Buffer.from(data, 'base64'))
const TILE = 1500
for (let top = 0, i = 1; top < src.height; top += TILE, i++) {
  const h = Math.min(TILE, src.height - top)
  const dst = new PNG({ width: src.width, height: h })
  PNG.bitblt(src, dst, 0, top, src.width, h, 0, 0)
  const name = `${pad(vpIndex)}-${vpName}-tile-${String(i).padStart(2, '0')}.png`
  writeFileSync(join(OUT, name), PNG.sync.write(dst))
  shots.push({ file: join(OUT, name), top, height: h })   // keeps tile → page offset
}
```

Keeping `{ top, height }` per tile matters: it converts "top of tile 5" back into an absolute
page offset, so a later remark like "the grid starts 3 200 px down" is verifiable.

Viewports used: **desktop 1440×900**, **tablet 834×1112**, **mobile 390×844** (mobile with touch
emulation). One pass at all three covers the three real layout breakpoints.

## 6. Step 4 — The structural audit (`audit.json`)

Written in the same run as the screenshots, so images and numbers always describe the same DOM.
It is an **array of records, one per viewport**, each shaped:

```jsonc
{
  "vp":   "desktop",                 // viewport name/label
  "shots": [ { "file": "...", "top": 0, "height": 1500 } ],
  "consoleMsgs":    [ "error: Failed to load resource: … 404 …" ],
  "failedRequests": [ "Script  csp" ],
  "audit": {
    "title": "…",
    "viewport": "1440x900",
    "pageHeight": 5525,
    "horizontalOverflow": 0,          // scrollWidth - clientWidth, want 0
    "headings":   [ … ],              // every h1–h6: text, level, fontSize, top
    "brokenImgs": [ … ],              // img.complete && naturalWidth === 0
    "sections":   [ { "tag": "header", "label": "…", "top": 41, "height": 73,
                      "bg": "rgba(12, 10, 7, 0.9)" } ],
    "smallText":  [ { "text": "Studio", "size": 9.6 } ],     // below the 12px floor
    "tapTargets": [ { "text": "Shop Drinkware", "w": 107, "h": 16 } ],  // below 44px
    "buttonRow":  [ … ],              // buttons/links in the CTA band, with hrefs
    "texts":      { … },              // hero/eyebrow/heading strings for copy review
    "menuLabels": [ … ]
  }
}
```

Why each field earns its place:

| Field | Catches |
|---|---|
| `pageHeight` | scroll length / "is this 11 screens on a phone?" |
| `horizontalOverflow` | accidental sideways scroll at small widths |
| `headings` | heading order + level skipping, and per-breakpoint type scale |
| `sections` | which top-level sections actually rendered, and in what order |
| `smallText` / `tapTargets` | accessibility floors (≥12 px text, ≥44 px targets) |
| `buttonRow` | duplicate/competing CTAs — compare **hrefs**, not just labels |
| `consoleMsgs` / `failedRequests` | CSP blocks, 404s, hydration warnings, blocked scripts |

Read it back with Node (PowerShell mangles a large JSON array, so use Node):

```powershell
node -e "const a=require(process.env.TEMP+'/rrs-shots3/audit.json');a.forEach(r=>console.log(r.vp,r.audit.pageHeight,r.audit.tapTargets.length))"
```

## 7. Step 5 — The DOM/CDP probe (behaviour, not just pixels)

Second throwaway script, `.tmp-probe.mjs <url> [filter]`, reuses the same CDP client but asks
questions instead of taking pictures. Highest-value checks:

1. **Hydration:** does any element carry a `__reactFiber$…` / `__reactProps$…` key?
   ```js
   Object.keys(document.querySelector('main *') || {}).some(k => k.startsWith('__reactFiber$'))
   ```
2. **Interactivity:** click the header menu button, then assert the nav drawer became visible.
3. **Visibility, not presence:** `getComputedStyle(el).opacity` for anything animated — a collage
   card can sit in the DOM at `opacity: 0` forever if hydration never ran.
4. **Geometry:** `getBoundingClientRect()` on the hero/collage boxes — compare the box size with
   how much of it actually holds content.
5. **Console + blocked requests**, again via `Log.entryAdded` and `Network.loadingFailed`
   (`blockedReason: 'csp'`).

Run it per route when a suspicion spans pages, e.g.:

```powershell
node .tmp-probe.mjs http://localhost:3210/ visible 2>&1 | Select-String -Pattern 'opacity|reactFiber|csp'
```

## 8. Step 6 — Pixel-level verification (the tie-breaker)

Screenshots get reviewed by eye, but "is this region actually painted?" deserves a number.
Compute mean + standard deviation per region of a captured PNG — **std-dev ≈ 0 means flat**
(unpainted / one uniform colour), a high std-dev means real content:

```js
const { PNG } = require('pngjs')   // already installed
const src = PNG.sync.read(readFileSync(tile))
// region = { x, y, w, h }; accumulate luma over that window
let n = 0, sum = 0, sumSq = 0
for (let y = region.y; y < region.y + region.h; y++) {
  for (let x = region.x; x < region.x + region.w; x++) {
    const i = (src.width * y + x) << 2
    const luma = 0.2126*src.data[i] + 0.7152*src.data[i+1] + 0.0722*src.data[i+2]
    sum += luma; sumSq += luma * luma; n++
  }
}
const mean = sum / n, std = Math.sqrt(sumSq / n - mean * mean)
```

This is how a "before/after" claim gets proved without looking at the image: a region whose
std-dev is near zero is effectively empty, while a large std-dev means real content is painted
there — so measuring the same region across two runs quantifies the change. Sampling a single
pixel likewise confirms that a specific colour is painted where expected. Use it for banner
strips, hero-collage quadrants, logo/monogram tiles, and any "is this invisible?" doubt.

## 9. Step 7 — Cross-check content against Supabase (read-only)

DOM findings about *content* (missing sections, thin grids, odd prices) must be checked against
the database, because the cause is often the CMS row rather than the code.

- Section visibility/order lives in **`exp_homepage_sections`** (`is_visible`, `sort_order`,
  `content`, `settings`); the read paths are **`src/lib/supabase/queries/homepage.ts`** and
  **`src/lib/supabase/queries/products.ts`**.
- Component defaults matter: when a section row is **absent**, the component's own defaults win
  (e.g. `HomepageProductGrid` falls back to its `product_count` / `show_filters` values), so
  "there is no CMS row" is itself a real explanation for unexpected on-screen behaviour.
- Query the live project with the service key from `.env`, **read-only**, in a Node one-liner —
  never print secret values, never write during an audit:

```powershell
node -e "const fs=require('fs');const env=Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)]}));const u=env.NEXT_PUBLIC_SUPABASE_URL,k=env.SUPABASE_SERVICE_ROLE_KEY;(async()=>{const r=await fetch(u+'/rest/v1/exp_homepage_sections?select=section_key,is_visible,sort_order',{headers:{apikey:k,Authorization:'Bearer '+k}});console.table(await r.json())})()"
```

Count rows behind any empty-looking section too (`select=id` with `Prefer: count=exact`), so
"the section is hidden" is distinguishable from "the section is hidden **and empty**".

## 10. Step 8 — Cleanup and verify clean

```powershell
Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force
$conn = Get-NetTCPConnection -LocalPort 3210 -State Listen -ErrorAction SilentlyContinue
if ($conn) { Stop-Process -Id $conn.OwningProcess -Force }
Remove-Item d:\RubysRelicsStudio\.tmp-*.mjs -Force
cd d:\RubysRelicsStudio; git --no-pager status --porcelain   # MUST be empty
git --no-pager branch --show-current                          # dev
```

Rules that keep this safe and repeatable:

- Scripts live at the repo root as **`.tmp-*.mjs`** and are **deleted** when done. These are
  throwaway harnesses, not tests — keep the `tsc` / `eslint` / `vitest` surface untouched.
- **All artifacts go outside the repo**, under `$env:TEMP\rrs-*`, so the working tree never goes
  dirty. Nothing in `src/` is edited during an audit.
- Bump the output folder per iteration (`rrs-shots`, `rrs-shots2`, `rrs-shots3`, `rrs-small` with
  crops like `rrs-small\02-…`) instead of overwriting, so before/after runs stay comparable.
- Optional hardening: add `.tmp-*` to `.gitignore` so a forgotten harness can never be staged.

## 11. Where the findings will go

**Findings are not in this file — they are in `UI_AUDIT_FINDINGS.md`** (delivered): **Part 1** = the storefront
pass, **Part 2** = the admin panel pass (see §15/§15.10 for its method and the key-derivation trap).
When more are planned out, they belong in that document, grouped as: correctness → layout/visual →
accessibility/polish → conversion ideas. Keep this file as the *method* so the two can be re-read
independently, and reference the evidence directory (`%TEMP%\rrs-shots3\`, or the newer
`rrs-shots4|5|6\` sets) rather than pasting numbers that will go stale.

## 12. Scope actually covered

- **Route:** the homepage (`src/app/page.tsx`) in full, at three viewports.
- **Also probed (shallow, for cross-page consistency):** `/shop`, `/shop/all`, `/future-products`.
- `/admin` and any authenticated flow, the product designer, cart → Square checkout, email templates, and
  any real-device (iOS Safari / Android Chrome) rendering.
- **`/admin` is now covered by its own pass — see §15**, and the findings are in **Part 2** of
  `UI_AUDIT_FINDINGS.md` (23 routes, 3 viewports, 69 captures). The remaining gaps (the customer-facing
  product designer, Square's hosted checkout, email templates, real devices) still apply.

## 13. Evidence inventory

| Path | Contents |
|---|---|
| `%TEMP%\rrs-shots3\01|02|03-*-tile-NN.png` | 16 full-page tiles — desktop 1440, tablet 834, mobile 390 |
| `%TEMP%\rrs-shots3\audit.json` | the structural audit for all three viewports (36 KB) |
| `%TEMP%\rrs-shots4\` | homepage only — 3 viewports, tiled, + `audit.json` (the pass the findings are based on) |
| `%TEMP%\rrs-shots5\` | `/shop`, `/shop/all`, `/future-products`, `/custom-orders`, `/cart` × 3 viewports + `audit.json` |
| `%TEMP%\rrs-shots6\` | sippy-cup PDP and `/checkout` × 3 viewports + `audit.json` |
| `%TEMP%\rrs-admin\` | **admin pass (Part 2 findings)** — 23 `/admin` routes × 3 viewports = 69 tiled captures + `audit.json`, plus `summary.txt` (derived route×viewport matrix + aggregates), `matrix.md` (the same matrix as markdown), and `probe-*.json` / `a11y-*.json` (live-DOM probes; the overflow hide-and-measure runs printed to stdout). **Confidential** — contains real customer/order rows; never commit or share. |
| `%TEMP%\rrs-small\`, `%TEMP%\rrs-shots2\` | zoomed crops and earlier iterations (before/after comparisons) |
| `%TEMP%\rrs-dev.out.log`, `rrs-dev.err.log` | dev-server output — check these when a page looks dead |
| `%TEMP%\rrs-edge-profile\` | throwaway Edge profile created by the harness |

**Trust `rrs-shots3`–`rrs-shots6`, `rrs-small` and `%TEMP%\rrs-admin\`.** `rrs-shots` / `rrs-shots2` were
captured over `http://127.0.0.1:3210` before the origin trap in §3 was identified, so they show an
unhydrated page and must not be used as evidence.

Two caveats apply to the automated contrast/tap numbers in every `audit.json` — both are explained in
§0 of `UI_AUDIT_FINDINGS.md`, and both mean a raw flagged count is not a finding on its own: gradient
fills report a transparent `background-color` (so the ancestor walk lands on the wrong colour), and the
text sampler skips any element with element children (so every icon-bearing button is invisible to it).

## 14. Repeat-it-later checklist

```powershell
# 0. clean slate
cd d:\RubysRelicsStudio; git --no-pager status --porcelain

# 1. dev server (log to TEMP), then wait
npm run dev -- -p 3210 *> (Join-Path $env:TEMP 'rrs-dev.out.log')
Start-Sleep -Seconds 25
Get-NetTCPConnection -LocalPort 3210 -State Listen -ErrorAction SilentlyContinue

# 2. capture: localhost only, artifacts to a NEW %TEMP% folder
node .tmp-capture.mjs http://localhost:3210/   # -> %TEMP%\rrs-shots<n>\

# 3. probe anything suspicious (hydration, opacity, CSP, geometry)
node .tmp-probe.mjs http://localhost:3210/

# 4. read the structural audit + verify regions with pixel stats
node -e "const a=require(process.env.TEMP+'/rrs-shots<n>/audit.json');console.dir(a.map(r=>({vp:r.vp,h:r.audit.pageHeight,overflow:r.audit.horizontalOverflow,broken:r.audit.brokenImgs.length,small:r.audit.smallText.length,taps:r.audit.tapTargets.length,console:r.consoleMsgs.length,blocked:r.failedRequests.length})),{depth:null})"

# 5. tear down + prove the tree is untouched
Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force
$c = Get-NetTCPConnection -LocalPort 3210 -State Listen -ErrorAction SilentlyContinue
if ($c) { Stop-Process -Id $c.OwningProcess -Force }
Remove-Item d:\RubysRelicsStudio\.tmp-*.mjs -Force
cd d:\RubysRelicsStudio; git --no-pager status --porcelain
```

Reminders that are easy to forget:

- **`localhost`, never `127.0.0.1`** (§3) — otherwise every number in the run is meaningless.
- Take the screenshots and the audit **in the same page load**, so the images and the metrics
  describe the same DOM.
- Console + blocked-request capture is the fastest way to find "silently not working" features —
  a 404 on a requested asset or a CSP-blocked third-party script never shows up in a screenshot.
- Compare **hrefs** when judging CTAs; two different labels pointing at one destination is a
  content bug that screenshots hide.
- Prefer DB evidence over DOM inference for anything content-shaped (§9).
- **Admin pass (§15):** sign in through the dev-only helper (`GET /api/dev/session`) from inside the
  captured browser, then assert the session held (§15.6) before trusting any tile — a `200` from the
  helper is necessary but not sufficient.

---

## 15. Admin panel (authenticated) audit — dev sign-in helper

`/admin` was outside the first pass (§12). Nothing about the harness changes: same dev server, same
`localhost` origin rule (§3), same headless-Edge CDP client (§4), same tiles (§5), same `audit.json`
(§6), same probes (§7–§8), same teardown (§10). The **only** new problem is getting a real Supabase
session — the credential the panel has demanded since the §10 OAuth cutover (`src/proxy.ts` Edge gate +
`src/lib/admin/auth.ts` DB allow-list) — into a browser the harness controls.

### 15.1 The dev-token method is dead — why

This section used to describe minting an `rr_admin_session` cookie by hand (`§15.10`'s HKDF/`deriveBits`
signing-key trap is the memorable part). **That credential no longer exists and no rebuild of it can work:**

| Old dev-token method relied on | Today |
|---|---|
| `rr_admin_session` cookie format `v2.{exp}.{jti}.{mfaFlag}.{sig}` | Gone. The cookie is now `sb-<ref>-auth-token` (chunked), written by `@supabase/ssr`. |
| Edge verifier deriving an HMAC key from `SESSION_SIGNING_KEY_SEED` | Gone. The Edge gate verifies a Supabase JWT's signature against the project's JWKS. |
| `ALLOW_LEGACY_ADMIN_SESSION_FALLBACK` making a row-less token valid | Gone (§10.4's allow-list is the revocation authority; there is no legacy fallback). |
| Emailed MFA code as the un-scriptable step | Gone. Google OAuth is the only sign-in path. |

So the honest summary is: the old method's *premise* (a constructible bearer token) was removed by design,
and the replacement is not another hand-minted token — it is a genuine session, obtained by a genuine
sign-in that the harness can trigger.

### 15.2 The mechanism — a dev-only sign-in helper

`GET /api/dev/session` (`src/app/api/dev/session/route.ts`, guards in `src/lib/dev/dev-signin.ts`, both
unit-tested) mints a **real** session for an **already** allow-listed admin, and leaves it in cookies exactly
the way a Google sign-in does:

1. `auth.admin.generateLink({ type: 'magiclink' })` — service role, so **no email is sent** — yields a
   one-time `hashed_token`.
2. `verifyOtp({ type: 'magiclink', token_hash })` on the cookie-bound server client
   (`createServerSupabaseClient()`) redeems it, writing `sb-<ref>-auth-token` cookies through the same
   adapter `src/app/auth/callback/route.ts` uses for `exchangeCodeForSession`.
3. The route then reads `getClaims()` and asserts `app_metadata.role === 'admin'` before reporting success,
   so a session that the Edge gate would reject is reported as an error instead of a silent failure.

A token minted this way carries *current* `app_metadata`, which also sidesteps the stale-claim trap §10.2
records.

**What it deliberately cannot do.** It never creates a user, never grants or edits the `admin` role, and
never widens access: it can only sign in an account that is already `is_active` and not `revoked_at` in
`exp_admin_users`. It returns no token, secret or key — only `{ ok, userId, email, role, note }`. Account
creation stays where it belongs, in `npm run admin:grant`.
### 15.3 Preconditions — check these, then fail loudly

| Check | Why it matters |
|---|---|
| `ADMIN_DEV_SIGNIN_ENABLED=true` in `.env` | The opt-in flag. Absent → the route 404s, so the harness must fail the run rather than capture a login screen. |
| `NODE_ENV !== 'production'`, **not on Vercel** | Two of the three gates. Preview deployments are publicly reachable, so `VERCEL`/`VERCEL_ENV` must refuse even with the flag set. |
| Origin is `http://localhost:<port>` | Third gate: off-loopback hosts are refused, so a non-Vercel staging box is refused too. |
| At least one active, un-revoked `exp_admin_users` row | The helper signs in *that* account. Empty allow-list → `409` telling you to run `npm run admin:grant`. |
| Service-role key present (`SUPABASE_SERVICE_ROLE_KEY`) | `generateLink` needs it. Missing → `502`. |

To confirm the gates are live before a run — one command, no browser:

```powershell
curl.exe -s -D - http://localhost:3210/api/dev/session     # 404 = disabled (expected in any hosted env)
```

### 15.4 Use it in the harness — two lines

The helper writes cookies into the *browser*, so the harness needs no token marshalling at all: navigate
the CDP page to the helper, then to the panel.

```js
await send('Page.navigate', { url: `${ORIGIN}/api/dev/session` })
await sleep(3500)
const signin = JSON.parse(await evaluate('document.body.innerText'))
if (!signin.ok) throw new Error('dev sign-in failed — cannot capture the panel')   // fail loudly
```

Then capture `/admin/*` exactly as §4–§5 describe. Reuse **one** Edge profile across the run so the cookies
survive between routes; a fresh profile per route means a fresh sign-in per route.

Verify the session really holds (see §15.6) — a `200` from the helper is necessary, not sufficient.

### 15.5 Failure modes, and what each one means

| Response | Meaning | Fix |
|---|---|---|
| `404` | A gate refused (flag off, production, Vercel, or non-loopback). | Set the flag in `.env`; check the origin. Never set it on a hosted env. |
| `409` + `admin:grant` | No active, un-revoked allow-list row. | `npm run admin:grant -- <google-email>` |
| `409` + `app_metadata.role` | Session established, but the JWT has no admin claim — the allow-list and the token disagree (§10.2). | Re-run `admin:grant` for that email; the fix is a re-grant, not a retry. |
| `502` | No token could be minted (`generateLink` failed) — usually a missing service-role key or an email that is not an `auth.users` row. | Check `SUPABASE_SERVICE_ROLE_KEY`; confirm the allow-listed email exists in Auth. |
| `401` | The one-time token was refused (expired/replayed). | Re-run: each call generates its own token, so a retry is safe. |

### 15.6 Admin-specific capture rules

- **Wait for the data, not just the document.** The panel is MUI with content fetched client-side from
  `/api/admin/*` on mount, so the fixed ~2 s settle in §4 is not enough. Wait for network idle (or for
  the last XHR to settle) **before** the §5 scroll-through and shot — otherwise every page photographs
  as a loading skeleton. ~5 s has been sufficient in practice.
- **Routes** — `ADMIN_MODULES` in `src/app/admin/(panel)/layout.tsx` plus the nested catalog pages:
  `/admin`, `/admin/custom-requests`, `/admin/orders`, `/admin/catalog`, `/admin/catalog/products`,
  `/admin/catalog/products/new`, `/admin/catalog/products/<id>`,
  `/admin/catalog/products/<id>/builder`, `/admin/catalog/products/<id>/pricing`,
  `/admin/catalog/categories`, `/admin/catalog/processes`, `/admin/catalog/pricing`,
  `/admin/catalog/future-products`, `/admin/catalog/future-product-statuses`, `/admin/pricing`,
  `/admin/inventory`, `/admin/shipping`, `/admin/shipping/debug`, `/admin/finance`, `/admin/settings`,
  `/admin/schedule`, `/admin/abandoned-carts`, `/admin/homepage`.
- **Viewports** — the same three as §5: desktop 1440×900, tablet 834×1112, mobile 390×844.
- **Assert the session held** (fail the run rather than silently capturing a login screen):
  - final `location.pathname` still begins with the requested `/admin/...` — not `/admin/login`;
  - an admin-shell marker is present (the module nav rendered by `AdminShell`);
  - no `401` / `Unauthorized` responses from `/api/admin/*` in the captured network records.
- **Read-only.** No `POST` / `PUT` / `PATCH` / `DELETE` against `/api/admin/*` during an admin audit.
  If a probe ever genuinely must, the CSRF cookie is already set and `AdminCsrfFetchBridge` supplies the
  header — but the default is: don't.
### 15.7 Lessons worth keeping (from the 2026-09-24 and 2026-10-01 runs)

- **Merge, don't overwrite, `audit.json`.** A full pass is ~6.5 min of wall clock and comfortably more than
  one command's output window, so runs happen in batches. The harness must load the existing `audit.json`
  and replace records by `route|viewport` — the first version started from `[]` and each batch silently
  clobbered the previous one (9 of 69 records survived). Save a copy as `audit-before.json` before a
  fix-and-re-measure pass, or the before/after comparison is impossible.
- **Tile name prefixes are batch-local.** The index in `NN-<route>-<vp>-tile-NN.png` is the index *within the
  selected routes*, so a `--routes=5-9` batch writes `01-catalog-product-detail-…`. List the folder before
  quoting a tile name.
- **One Edge profile, one process at a time.** The probe and the capture both open
  `--user-data-dir=%TEMP%\rrs-edge-profile-admin`; they use different CDP ports (9223 vs 9222), but a
  *shared profile directory* means they must be run sequentially — do not start a probe while a capture is
  in flight. Check the port is free first (`Get-NetTCPConnection -LocalPort 9222 -State Listen`); other
  software on this machine exposes a CDP-ish listener on 9223, and attaching to *its* browser would silently
  measure the wrong page.
- **Expect two console messages and ignore them.** `/favicon.ico` 404s (the icon route is dynamic) and the
  CSP blocks `https://va.vercel-scripts.com/v1/script.debug.js` (Vercel Analytics' debug script vs. the
  panel's own `script-src`). Neither is a finding; `failedRequests: ["Script csp"]` is this, not a bug.
- **MUI internals are not findings.** `MuiSelect-nativeInput` is `aria-hidden` + `tabindex="-1"`; the
  autosize textarea is `visibility: hidden` at 0 height. Check the *visible* sibling (`role="combobox"`)
  instead — that is where the real missing-name problem is.
- **Gradient cards hide their own contrast.** Cards paint with the `background:` shorthand
  (`AdminShell.tsx`), so `background-color` is transparent and any automated contrast walk falls back to the
  body void. Sample the PNG instead: mean RGB of a text-free strip *inside* the card (a ~10 px wide column
  just inside the card's left edge works) → the panel's card backdrop measures **(27,21,15)**. Then compute
  the composite the way a browser does: `text = alpha·fg + (1 − alpha)·backdrop`.
- **A `1fr` grid track cannot shrink below its items' min-content — that is how sideways scroll starts.**
  Found 2026-10-01 (§9.4). The reliable diagnostic is: find elements where
  `scrollWidth > clientWidth + 1`, then read the computed `grid-template-columns` — a *single* resolved
  track wider than its container (e.g. `1241.34px` inside a `1060px` box) means `minmax(auto, 1fr)` lost.
  Two traps while diagnosing it: `min-width: 0` on the *items* fixes nothing (only `minmax(0, 1fr)` on the
  *container*, or `min-width: 0` on the flex items of the thing that inflates), and `width: min-content`
  measurements on grid items are unreliable because the track governs the box. Fix with
  `repeat(N, minmax(0, 1fr))` — the convention already used by `finance/page.tsx` and `AdminShell`.
- **Text size can be the hidden input to a layout bug.** Raising the nowrap card descriptions from 0.72rem
  to the 0.75rem floor made the §9.4 overflow *worse* (140 → 158 px) until the track was fixed, because
  bigger nowrap text means bigger min-content. Fix the track first, then the type.
- **Fix the cause, then re-measure the same way.** The first §9.4 attempt (pinning the *page-root* grid to
### 15.8 Guardrails

- **Local dev only.** Never enable the helper against production, a Vercel deployment, or a preview URL.
  The three gates (`NODE_ENV`, `VERCEL`/`VERCEL_ENV`, `ADMIN_DEV_SIGNIN_ENABLED`) plus the loopback check
  are the *only* thing making this safe, and they must stay — `src/lib/dev/dev-signin.test.ts` and the route
  suite assert the refusal matrix.
- **Never print a token, key or secret.** The helper returns a log-safe summary only. Do not add endpoints
  or flags that return `access_token` / `refresh_token` / `hashed_token`, and do not paste either value into
  a doc, a commit, or a log.
- **The helper cannot create or promote accounts, by design.** Access changes go through
  `npm run admin:grant` / `admin:revoke`, which is also what the `409` messages tell you to run.
- **Treat artifacts as confidential.** Admin screens render real customer and order data, so every
  screenshot and `audit.json` goes to `%TEMP%\rrs-admin2\` (§10), nothing is committed, and the whole folder
  is disposable.
- **A helper session is a real session.** Unlike the old minted token it *does* have an `exp_admin_users`
  row, so it can be revoked from the admin UI — but it is still a live admin session in a browser profile
  on this machine, so tear it down (§15.9) instead of leaving it sitting around.

### 15.9 Cleanup

Extends §10 — the only additions are the evidence folder and the helper flag:

```powershell
Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force
$conn = Get-NetTCPConnection -LocalPort 3210 -State Listen -ErrorAction SilentlyContinue
if ($conn) { Stop-Process -Id $conn.OwningProcess -Force }
Remove-Item "$env:TEMP\rrs-edge-profile-admin" -Recurse -Force   # holds the session cookies
Remove-Item d:\RubysRelicsStudio\.tmp-*.mjs -Force
cd d:\RubysRelicsStudio; git --no-pager status --porcelain   # MUST be empty
```

`git status --porcelain` being empty is the proof that no `src/` file and no `.env` was touched by the run.
The helper's flag stays in `.env` (gitignored, local only) so the next pass needs no re-setup.

### 15.10 Where the admin findings go

The same place as every other finding (§11): a separate `UI_AUDIT_FINDINGS.md`, grouped
correctness → layout/visual → accessibility/polish → conversion ideas — **not** in this file. Keep this
file as the method and reference the evidence directory (`%TEMP%\rrs-admin2\`) instead of pasting numbers
that will go stale.
  `minmax(0, 1fr)`) measured *worse* than the bug, which is what caught it: the root capped the panel's box
  while the inner card grid still painted 1241 px. A "fix" that shrinks an ancestor's box without shrinking
  the content bounding box is a no-op or a regression — the `overflowPx` number says which.
