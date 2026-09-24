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
bootstrap differs. See **§15** for the dev-token method.

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

Findings are **not in this file**. When they are planned out, they belong in their own document
(e.g. `UI_AUDIT_FINDINGS.md`) grouped as: correctness → layout/visual → accessibility/polish →
conversion ideas. Keep this file as the *method* so the two can be re-read independently, and
reference the evidence directory (`%TEMP%\rrs-shots3\`) rather than pasting numbers that will go
stale.

## 12. Scope actually covered

- **Route:** the homepage (`src/app/page.tsx`) in full, at three viewports.
- **Also probed (shallow, for cross-page consistency):** `/shop`, `/shop/all`, `/future-products`.
- **Not covered in that pass:** `/admin` and any authenticated flow, the product designer, cart →
  Square checkout, email templates, and any real-device (iOS Safari / Android Chrome) rendering.
  Re-run the same harness against those routes if they are in scope later — only the URL and the
  viewport list change. **`/admin` now has its own recipe: §15.**

## 13. Evidence inventory

| Path | Contents |
|---|---|
| `%TEMP%\rrs-shots3\01|02|03-*-tile-NN.png` | 16 full-page tiles — desktop 1440, tablet 834, mobile 390 |
| `%TEMP%\rrs-shots3\audit.json` | the structural audit for all three viewports (36 KB) |
| `%TEMP%\rrs-small\`, `%TEMP%\rrs-shots2\` | zoomed crops and earlier iterations (before/after comparisons) |
| `%TEMP%\rrs-dev.out.log`, `rrs-dev.err.log` | dev-server output — check these when a page looks dead |
| `%TEMP%\rrs-edge-profile\` | throwaway Edge profile created by the harness |

**Trust `rrs-shots3` (and `rrs-small`) only.** `rrs-shots` / `rrs-shots2` were captured over
`http://127.0.0.1:3210` before the origin trap in §3 was identified, so they show an unhydrated
page and must not be used as evidence.

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
- **Admin pass (§15):** mint the dev session token before the run, hand it to the capture script
  through `$env:TEMP\rrs-admin-session.txt`, and delete that file in teardown — a minted token has no
  `exp_admin_sessions` row, so it cannot be revoked from the admin UI and simply lives until it expires.

---

## 15. Admin panel (authenticated) audit — dev-token method

`/admin` was outside the first pass (§12). Nothing about the harness changes: same dev server, same
`localhost` origin rule (§3), same headless-Edge CDP client (§4), same tiles (§5), same `audit.json`
(§6), same probes (§7–§8), same teardown (§10). The **only** new problem is getting an authenticated
`rr_admin_session` cookie into the browser, because `src/middleware.ts` gates every `/admin/*` and
`/api/admin/*` route and the pages/APIs re-check the session server-side.

### 15.1 Why the normal login cannot be scripted

- `POST /api/admin/session` with `{ key }` = `ADMIN_LOGIN_KEY` issues a token with `mfaFlag='0'`.
- The panel then forces the MFA challenge: `POST /api/admin/send-mfa` emails a 6-digit code via Resend
  to `ADMIN_MFA_EMAIL`, and stores **only** `h1$` + `HMAC(challengeToken:code)` in `admin_mfa_codes`.
- `POST /api/admin/verify-mfa` re-issues the token with `mfaFlag='1'`.

So the code exists **only in an inbox and as a non-reversible hash in the database** — automated login
is a dead end. (Send is also capped at 3 / 10 min per session plus a 10 / 10 min global cap outside
Vercel; verify at 5 attempts / 5 min per challenge token.) Do not try to work around this by editing
the SEC-047 path or sniffing the DB.

### 15.2 The mechanism — why a locally minted token works

| Fact (source) | Consequence for the harness |
|---|---|
| Token format is `v2.{exp}.{jti}.{mfaFlag}.{sig}` (`session.ts`, `middleware.ts`) | The whole credential is constructible from a few inputs. |
| Signing key = `HKDF-SHA256(seed = SESSION_SIGNING_KEY_SEED, salt = "rr-admin-session-signing-v1", info = "rr-admin", 32B)`, and `sig = hex(HMAC-SHA256(key, "v2.{exp}.{jti}.{mfaFlag}"))` | `ADMIN_LOGIN_KEY` is **never** the HMAC key, so the token can be minted without knowing it. |
| `middleware.ts` (Edge) verifies signature + expiry + `mfaFlag === '1'` only — it cannot query the DB | A `mfaFlag='1'` token clears the Edge gate. |
| The page/API layer then looks up `exp_admin_sessions.jti` for revocation — the one thing a synthetic token lacks | This is the only obstacle, and it has a supported answer: `allowLegacySessionFallback()`. |
| `allowLegacySessionFallback()` is `true` only when **not on Vercel**, `NODE_ENV !== 'production'`, and `ALLOW_LEGACY_ADMIN_SESSION_FALLBACK === 'true'` | In local dev with that flag on, a token with **no** session row verifies `true` (`verifyAdminSessionToken` returns `allowLegacySessionFallback()` when the row is missing/errored). |

Result: in local dev a minted `mfaFlag='1'` token authenticates the whole panel with **no email, no DB
write, and no change under `src/`**. This is the dev-only fallback that already exists in this repo —
it is not a new hole, and it stops working the moment the flag is turned off, which is the correct
failure mode.

Consequence to remember: the minted token has no `exp_admin_sessions` row, so it will **not** appear in
the admin sessions list and **cannot** be revoked from the UI. It lives until it expires (default TTL
12 h, via `getAdminSessionMaxAgeSeconds()` / storefront settings) or the flag is switched off.

### 15.3 Preconditions — check these, then fail loudly

| Check | Why it matters |
|---|---|
| `ALLOW_LEGACY_ADMIN_SESSION_FALLBACK=true` in `.env` | Without it the revocation lookup fails closed and every admin page redirects to `/admin/login`. |
| `NEXT_PUBLIC_APP_ENV=development`, not on Vercel, `NODE_ENV !== 'production'` | `allowLegacySessionFallback()` returns `false` otherwise. |
| `SESSION_SIGNING_KEY_SEED` is a 64-char hex string | The mint script derives the HMAC key from it. |
| The dev server is reached at `http://localhost:<port>` | The origin trap (§3) still applies; a token cannot rescue an unhydrated page. |

### 15.4 Mint the token — `.tmp-admin-session.mjs`

Throwaway, repo root, `.tmp-` prefix, deleted in teardown (§10). It writes the token to a file
**outside the repo** and never prints the seed or the token.

```js
// .tmp-admin-session.mjs — local-dev admin session token. Never prints secrets.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { hkdfSync, createHmac, randomUUID } from 'node:crypto'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] })
)

if (process.env.VERCEL) throw new Error('Refusing to mint a dev admin token on Vercel')
if (process.env.NODE_ENV === 'production') throw new Error('Refusing to mint a dev admin token in production')
if (env.ALLOW_LEGACY_ADMIN_SESSION_FALLBACK !== 'true') {
  throw new Error('ALLOW_LEGACY_ADMIN_SESSION_FALLBACK must be true for the dev-token method')
}
const seed = env.SESSION_SIGNING_KEY_SEED
if (!/^[0-9a-fA-F]{64}$/.test(seed ?? '')) throw new Error('SESSION_SIGNING_KEY_SEED must be 64 hex chars')

// Same derivation as src/lib/admin/session.ts and src/middleware.ts
const key = Buffer.from(hkdfSync(
  'sha256',
  Buffer.from(seed, 'hex'),
  Buffer.from('rr-admin-session-signing-v1'),
  Buffer.from('rr-admin'),
  32
))

const VERSION = 'v2'                                   // session.ts SESSION_VERSION
const ttl = Number(process.argv[2] ?? 60 * 60 * 12)    // default 12h, matches DEFAULT_SESSION_TTL_SECONDS
const exp = Math.floor(Date.now() / 1000) + ttl
const jti = randomUUID()
const payload = `${VERSION}.${exp}.${jti}.1`           // mfaFlag = '1' (MFA satisfied)
const sig = createHmac('sha256', key).update(payload).digest('hex')

const out = join(process.env.TEMP, 'rrs-admin-session.txt')
writeFileSync(out, `${payload}.${sig}`, 'utf8')        // hand-off file, not stdout
console.log('admin session token written to', out)
```

Run it, then confirm it authenticates **before** capturing anything:

```powershell
node .tmp-admin-session.mjs
```

A `GET /api/admin/session` with that cookie must answer `{ "authenticated": true, "mfaVerified": true }`.
If it does not, stop — the rest of the run is meaningless.

### 15.5 Inject it and capture

The only change to the §4 client is one `Network.setCookie` before `Page.navigate`. Read the token from
the hand-off file, not from the command line, so it never lands in shell history or a process list.

```js
// inside .tmp-capture.mjs, after Log/Network/Runtime are enabled and BEFORE Page.navigate
const token = readFileSync(join(process.env.TEMP, 'rrs-admin-session.txt'), 'utf8').trim()

await send('Network.enable')
await send('Network.setCookie', {
  name: 'rr_admin_session',
  value: token,
  domain: 'localhost',
  path: '/',
  httpOnly: true,
  secure: false,        // isProd() is false in dev
  sameSite: 'Strict',   // matches the cookie the server sets
})
```

`sameSite: 'Strict'` is not a problem because the harness navigates the top-level document straight to
the `localhost` URL. Set the cookie once per browser session — it persists across navigations — but
re-inject it if the run uses a fresh `--user-data-dir` profile.

```powershell
node .tmp-admin-session.mjs
node .tmp-admin-capture.mjs http://localhost:3210/admin   # -> %TEMP%\rrs-admin\
```

### 15.6 Admin-specific capture rules

- **Wait for the data, not just the document.** The panel is MUI with content fetched client-side from
  `/api/admin/*` on mount, so the fixed ~2 s settle in §4 is not enough. Wait for network idle (or for
  the last XHR to settle) **before** the §5 scroll-through and shot — otherwise every page photographs
  as a loading skeleton.
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
  - final `location.pathname` still begins with the requested `/admin/...` — not `/admin/login`, not
    `/admin/mfa-challenge`;
  - an admin-shell marker is present (the module nav rendered by `AdminShell`);
  - no `401` / `Unauthorized` responses from `/api/admin/*` in the captured network records.
- **Read-only.** No `POST` / `PUT` / `PATCH` / `DELETE` against `/api/admin/*` during an admin audit.
  If a probe ever genuinely must, the middleware has already set the CSRF cookie and
  `AdminCsrfFetchBridge` supplies the header — but the default is: don't.

### 15.7 Guardrails

- **Local dev only.** Never mint against production, a Vercel deployment, or a preview URL. The script
  refuses on `VERCEL` / `NODE_ENV=production`, and that refusal must stay.
- **Never print the seed or the token.** Hand the token to the harness through
  `$env:TEMP\rrs-admin-session.txt`, never as a CLI argument, and never paste either value into a doc,
  a commit, or a log.
- **Treat artifacts as confidential.** Admin screens render real customer and order data, so every
  screenshot and `audit.json` goes to `%TEMP%\rrs-admin\` (§10), nothing is committed, and the whole
  folder is disposable.
- **Delete the token file in teardown.** Until it expires, that file is a live admin bearer credential;
  it has no `exp_admin_sessions` row, so it cannot be revoked from the UI.

### 15.8 Cleanup

Extends §10 — the only additions are the hand-off file and the new evidence folder:

```powershell
Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force
$conn = Get-NetTCPConnection -LocalPort 3210 -State Listen -ErrorAction SilentlyContinue
if ($conn) { Stop-Process -Id $conn.OwningProcess -Force }
Remove-Item (Join-Path $env:TEMP 'rrs-admin-session.txt') -Force
Remove-Item d:\RubysRelicsStudio\.tmp-*.mjs -Force
cd d:\RubysRelicsStudio; git --no-pager status --porcelain   # MUST be empty
```

`git status --porcelain` being empty is the proof that no `src/` file, no `.env`, and no token was
touched by the run.

### 15.9 Where the admin findings go

The same place as every other finding (§11): a separate `UI_AUDIT_FINDINGS.md`, grouped
correctness → layout/visual → accessibility/polish → conversion ideas — **not** in this file. Keep this
file as the method and reference the evidence directory (`%TEMP%\rrs-admin\`) instead of pasting numbers
that will go stale.
