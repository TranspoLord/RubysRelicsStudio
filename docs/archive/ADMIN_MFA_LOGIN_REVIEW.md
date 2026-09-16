# Agent MFA Login Fix — Security & Correctness Review

**Scope:** Changes to 6 files (`src/app/api/admin/session/route.ts`, `src/middleware.ts`, `src/app/layout.tsx`, `src/lib/admin/session.ts`, `src/components/admin/AALGuard.tsx`, `.env`).
**Method:** Static review of current working tree + `git diff HEAD` to see exactly what the agent changed vs. the prior commit (`5ec1526`).
**Date:** 2026-08-17

---

## Executive Summary

| # | Question | Verdict | Action needed |
|---|----------|---------|----------------|
| 1 | Remove CSRF origin from login POST/DELETE a regression? | **Was a regression — fixed** | Re-enabled a **lenient** origin check (`validateCsrfOriginLenient`) on POST/DELETE; GET keeps the strict probe-prevention check. Per `docs/PENTEST_CSRF_PLAYBOOK.md` §2.4. |

| 2 | `ALLOW_LEGACY_ADMIN_SESSION_FALLBACK` env var correct? | **Logic sound; var was missing — fixed** | Added the var to `.env` and hardened `allowLegacySessionFallback()` to force-disabled on Vercel/production. |

| 3 | `/admin/mfa-challenge` middleware exemption sufficient? | **Yes, correct & scoped** | Keep; verify no new MFA routes are added later without this list |
| 4 | CSP nonce propagation (header + cookie fallback) robust? | **Header path correct for Next 16; kept as agent's header+body-nonce (cookie = harmless net)** | In-browser CSP verification remains (no `csp-nonce` meta in Next 16; `<body nonce>` is the mechanism). |

| 5 | Other code paths relying on `sessionStorage` for auth/MFA? | **No — fully removed** | None |
| 6 | `extractMfaFlagFromToken` parses v2 format correctly? | **Yes, correct** | None |
| 7 | Tests to add / update for MFA flow? | **No existing tests asserted old shape; coverage was missing** | Added `session.test.ts` (14) + `route.test.ts` (10); suite 162/162. MFA-flow tests (send/verify-mfa, middleware) remain recommended follow-ups. |


### Two discrepancies between the agent's summary and reality
1. **The v2 token format, `requireMfa`, and the fail-closed DB fallback already existed at `HEAD`.** `git diff` shows the `session.ts` change is *only* the addition of `extractMfaFlagFromToken`. The `allowLegacySessionFallback()` toggle and fail-closed try/catch were pre-existing.
2. **`ALLOW_LEGACY_ADMIN_SESSION_FALLBACK=true` is NOT present in `.env`** despite being listed as a change. The `.gitignore` ignores `.env`, so it isn't shared; `allowLegacySessionFallback()` therefore resolves to `false` everywhere (fail-closed). The intended dev convenience is currently dead.

---

## 1. CSRF origin removal on login POST/DELETE — is it a regression?

**Short answer:** Yes, it's a reduction in CSRF defense-in-depth, but the system is *largely protected* by MFA + rate-limiting + `SameSite=Strict`. The agent's stated rationale is also questionable.

### What the agent claims vs. what's really happening

The agent wrote: *"CSRF token checks block same-origin `fetch()` POSTs that omit the `Origin` header."*

Reality check on browser behavior:
- A same-origin `fetch('/api/admin/session', { method:'POST', … })` from the login page sends a **`Referer` header** (default `Referrer-Policy: strict-origin-when-cross-origin` → full same-origin URL) and **usually sends `Origin`** for non-GET fetch calls.
- The original `validateCsrfOrigin(request)` returns `false` only when **(a)** neither `Origin` nor `Referer` is present, **or** **(b)** an present `Origin`/`Referer` doesn't normalize to `NEXT_PUBLIC_APP_URL`.
- In `.env`, `NEXT_PUBLIC_APP_URL=http://localhost:3000`. If a dev accesses the box via `127.0.0.1:3000` (or a tunnel host), the `Origin`/`Referer` won't match → **403 "Cross-origin request blocked."** This **origin mismatch**, not a missing header, is the far more likely cause of the reported *"cross site attack failure (403)"*.

So removing the check is a blunt workaround for what was probably a config mismatch, and it also discards login-CSRF protection.

### Security impact of the removal
- **Login CSRF** (forcing a victim's browser to authenticate with the attacker's admin key) is theoretically possible now. *However*, the resulting session has `mfaFlag='0'`, and **MFA is enforced everywhere that matters**:
  - Middleware allows `/admin/login`, `/admin/mfa-challenge`, and the 3 auth API endpoints; everything else requires a valid cookie.
  - `/admin` panel layout calls `requireAdminPageSessionOrRedirect('/admin')` → `verifyAdminSessionToken(token, adminKey, requireMFA=true)` → rejects `mfaFlag=0`.
  - `requireAdminApiSession` (all other admin mutations/reads) verifies with `requireMfa=true`.
  - The MFA code is emailed to the legitimate admin (`ADMIN_MFA_EMAIL`) — an attacker can't complete the challenge. **=> login-CSRF escalation to admin access is effectively blocked by MFA.**
- **Brute force on the admin key**: POST is rate-limited `failClosed` (5 / 15 min per IP on Vercel, 20 / 15 min global in non-Vercel dev where `getClientIp()` returns `'unknown'`). `hasValidAdminKey` uses `timingSafeEqual`. Acceptable in production.
- **Logout DELETE**: now has *no* CSRF control at all — relies solely on `SameSite=Strict`. `SameSite=Strict` does **not** prevent a cross-site response from *clearing* the cookie (SameSite governs *sending*, not *Set-Cookie*). So a cross-site logout-CSRF → forced logout (low-severity DoS). Not privilege escalation.

### Recommendation (do this, not the current state)
- **Don't leave login/logout CSRF-unprotected.** Re-apply a **lenient** origin check to POST and DELETE: reject only when `Origin` (or `Referer`) is *present* and normalizes to a different origin than `NEXT_PUBLIC_APP_URL`. This:
  - Still blocks genuine cross-site login/logout CSRF (attacker's `Origin` ≠ your origin).
  - Tolerates same-origin `fetch` that omits `Origin` (the agent's concern).
  - Is exactly the "origin-only" pattern the project's own `docs/PENTEST_CSRF_PLAYBOOK.md` §2.4 prescribes for pre-auth mutations.
- **Root-cause the real cause separately:** ensure `NEXT_PUBLIC_APP_URL` matches how the app is actually accessed (and consider deriving "same-origin" from the request `Host` for dev). The removal papers over a config mismatch instead of fixing it.
- Keep the **GET `validateCsrfOrigin`** (already retained) — it prevents cookie-validity probing. Good.

---

## 2. `ALLOW_LEGACY_ADMIN_SESSION_FALLBACK` env var

**Logic review (correct):**
- `allowLegacySessionFallback()` = `process.env.ALLOW_LEGACY_ADMIN_SESSION_FALLBACK === 'true'`. Default is `false`.
- `verifyAdminSessionToken()` is **fail-closed**: when the Supabase DB errors or the session row is missing, it returns `false` **unless** the toggle is on. This is the right security posture for production (a DB outage shouldn't silently grant sessions).
- The fallback only kicks in **after** HMAC signature + expiry + MFA flag have all already validated. It does **not** weaken signature verification; it only skips the revocation/DB-existence check. So even in fail-open mode, a forged token is still rejected. Good design.

**Problem: the toggle is not enabled.**
- I read `.env` (committed-as-worktree, ignored by git). It does **not** contain `ALLOW_LEGACY_ADMIN_SESSION_FALLBACK=true`. A repo-wide search shows the token only in `src/lib/admin/session.ts` and in compiled `.next/` output — not in any env file.
- So today `allowLegacySessionFallback()` is `false` everywhere. If Supabase is unreachable in dev, `verifyAdminSessionToken` returns `false` → the MFA flow is **locked out** (send-mfa/verify-mfa each call it). This is the "fail-closed issue" the agent intended to fix — and it is currently **not fixed** in the working tree.

**Recommendation:**
- Add `ALLOW_LEGACY_ADMIN_SESSION_FALLBACK=true` to `.env` (dev) as intended. Keep it out of any production env.
- Harden the toggle against accidental production enablement: e.g. only honor it when `NEXT_PUBLIC_APP_ENV !== 'production'`, or rename to something unmistakably dev-only (e.g. `ALLOW_DEV_ADMIN_SESSION_FALLBACK`). A single stray `true` in a prod env silently disables revocation checks for every admin session.
- Consider emitting a loud warning at startup/verification time when the fallback is active.
- Document it in an env example so it isn't lost (the `.gitignore` ignores `.env`, so this is invisible to teammates/CI).

---

## 3. Middleware exemption for `/admin/mfa-challenge`

**Review of `src/middleware.ts` exemption list:**
```ts
const isAuthEndpoint =
  pathname === '/admin/login' ||
  pathname === '/admin/mfa-challenge' ||
  pathname === '/api/admin/session' ||      // GET/POST/DELETE
  pathname === '/api/admin/send-mfa' ||
  pathname === '/api/admin/verify-mfa'
```

The end-to-end login flow:
`/admin/login` → `POST /api/admin/session` (issue `mfaFlag=0` token) → `/admin/mfa-challenge` → `POST /api/admin/send-mfa` (verify token with `requireMfa=false`) → `POST /api/admin/verify-mfa` (upgrade token to `mfaFlag=1`) → `/admin`.

Every hop in that chain is exempted. ✓

**Other MFA-related routes checked:**
- `GET /api/admin/mfa-debug` — **not** exempted, and correctly so: it `requireAdminApiSession` (needs a full MFA-verified session) and is blocked in production. Not part of the login flow.
- `/api/admin/sessions` (plural — session revocation/management) — requires MFA session; not exempted. Correct (it's a privileged admin action, not a login-flow step).
- `debug-totp` generator script — build-time/dev-only. Not relevant.

**Verdict:** The exemption is sufficient and properly scoped. One process note: the list is hand-maintained; add a test/guard that any new `/admin/mfa-*` or `/api/admin/*-mfa` route is added here, or that these endpoints self-verify the pre-auth token (which send/verify-mfa already do).

---

## 4. CSP nonce propagation (header + cookie fallback)

**What changed in `src/middleware.ts` (diff):** The middleware already set the `x-nonce` response header on every branch at HEAD. The agent's actual addition is setting a **second** copy in a `rrs_csp_nonce` cookie (httpOnly, Strict, `maxAge: 60`) on the same branches, plus exporting `CSP_NONCE_COOKIE`.

**What changed in `src/app/layout.tsx`:**
```ts
const headersList = await headers()
const cookieNonce = (await cookies()).get('rrs_csp_nonce')?.value ?? ''
const nonce = headersList.get('x-nonce') ?? cookieNonce
...
<body nonce={nonce}>
```

**Header path (primary): correct.** `headers()` in an App Router Server Component reflects response headers set by middleware on `NextResponse.next()`. This is the canonical Next.js mechanism. In the normal case it returns the nonce → `<body nonce>` is correct → Next.js's injected inline scripts (flight bootstrap, etc.) get a valid nonce. ✓

**Cookie fallback (secondary): correctness hinges on Next.js cookie-merge semantics, with a real failure mode.**
- `cookies().get('rrs_csp_nonce')` reads the **request** cookie jar. Whether it also includes the cookie middleware *just* set on this response is version-dependent:
  - **If it merges middleware response cookies** → returns the *current* nonce (N) → correct, a harmless safety net.
  - **If it only reflects what the browser sent** → returns the *previous* request's nonce (N-1), while the CSP header on this response is N → **stale mismatch** → Next.js would tag inline scripts with N-1 but CSP allows only `nonce-N` → **CSP violation** → exactly the "page won't function" symptom.
- Because the header path is reliable in current Next.js, the cookie fallback is **redundant**. When headers genuinely don't propagate (the agent's stated reason), the cookie fallback is *also* unreliable for the reasons above — so it doesn't actually rescue the failing environment.

**Concrete verification needed (the suite the user ran — `tsc/vitest/build` — cannot catch CSP; this must be checked in a browser):**
1. Inspect the served HTML: every Next.js-injected `<script>` must carry `nonce="${nonce}"` and that nonce must equal the `Content-Security-Policy: ... 'nonce-${nonce}' …` response header.
2. Confirm the login (`/admin/login`) and MFA (`/admin/mfa-challenge`) pages render with **no CSP violations** in DevTools → Console → "Content-Security-Policy" filter. These pages are `'use client'` MUI pages; the main inline-script risk is Next.js's own bootstrap.
3. If violations appear, the most likely cause is the nonce not reaching Next.js's script injection. Next.js's documented App Router CSP pattern reads the nonce from the body/html `nonce` attribute **or** from a `<meta name="csp-nonce">`. The current code sets `nonce={nonce}` on `<body>` — confirm the installed Next.js version honors that for *its own* injected scripts. If not, add `<meta name="csp-nonce" content={nonce} />` in `<head>` (the documented approach).

**Other CSP notes (pre-existing, not regressions):**
- `script-src` includes `'unsafe-eval'` (needed for Turbopack/HMR in dev and cited for MUI controlled inputs). Keep in dev; consider dropping in production via a conditional build policy.
- `style-src ... 'unsafe-inline'` — fine for MUI/emotion.
- CSP is only applied where the middleware matcher runs (`/((?!_next/static|_next/image|favicon.ico).*)`); static assets are correctly excluded.

**Recommendation (revised after implementation):** The nonce code was left **as written** — header-primary (`x-nonce` read via `headers()` in the layout, with the `rrs_csp_nonce` cookie as a defensive fallback, applied to `<body nonce>`). On **Next.js v16** (this project), `headers()` reliably reflects middleware-set response headers, so the header path is the source of truth and the cookie fallback is simply unused in the steady state (harmless). A repo search of `node_modules/next` confirms there is **no** `csp-nonce` meta-tag mechanism in Next 16, so `<body nonce>` is the correct discovery mechanism for Next.js's own inline scripts. The only remaining action is in-browser verification (the `tsc`/`vitest`/`build` suite cannot catch CSP violations): open DevTools → Console CSP filter on `/admin/login` and `/admin/mfa-challenge`, and confirm every Next.js-injected `<script>` carries `nonce="${nonce}"` equal to the `Content-Security-Policy` response header. (`'unsafe-eval'` remains in the **dev** `script-src`; consider a production build policy to drop it.)


---

## 5. Other code paths still using `sessionStorage` for auth/MFA

**Search results (whole `src/`)** for `localStorage`/`sessionStorage`:
- `src/app/admin/mfa-challenge/page.tsx` — **comments only** ("Removed client-side … sessionStorage check"). No live usage.
- `src/components/admin/AALGuard.tsx` — **comments only** ("has been updated to remove all insecure sessionStorage"). No live usage. `setMFAVerified`/`isMFAVerified` helpers (the old sessionStorage writers) were deleted. ✓
- `src/app/page.tsx`, `CartProvider.tsx`, `CustomOrderIntakeForm.tsx`, `AnnouncementBanner.tsx`, `cookie-consent.ts` — these use `localStorage` for **cart drafts, form drafts, announcement-dismiss, and cookie consent** — none are auth/MFA state. ✓

Search for `admin_mfa_verified` / `admin_authenticated` → **comments only** (in `auth.ts`, `login/page.tsx`, `verify-mfa`, `mfa-challenge` describing the *removal*). No live reads/writes.

**`AALGuard.tsx` is now safe but unused:** It's `@deprecated` and "not imported anywhere" (confirmed). It still ships a client-side `fetch('/api/admin/session')` guard — harmless, but it calls the GET endpoint which itself enforces the origin check, so a cross-origin page can't abuse it. Worth deleting outright to reduce attack surface, but not a security hole.

**Verdict:** No remaining `sessionStorage`/client-side auth state. ✓

---

## 6. `extractMfaFlagFromToken` correctness

```ts
export function extractMfaFlagFromToken(token): string | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 5) return null   // v2: version.exp.jti.mfaFlag.sig
  return parts[3]
}
```
Token format (from `createAdminSessionToken`): `${v2}.${exp}.${jti}.${mfaFlag}.${sig}` → `['v2', exp, jti, mfaFlag, sig]` → `parts[3]` = `mfaFlag` (`'1'`/`'0'`). ✓

**Used safely:** In `GET` it is only consulted when `authenticated` is already true:
```ts
const mfaVerified = authenticated && extractMfaFlagFromToken(sessionToken) === '1'
```
- The token was already signature/HMAC-verified, expiry-checked, and MFA-flag-enforced by `verifyAdminSessionToken` before this line (with `requireMfa=false` on the GET). So reading `parts[3]` unverified is fine — there's no forgery risk because the signature already held.
- v1 tokens (4 parts) → `null` → `mfaVerified=false`, and they're rejected by `verifyAdminSessionToken` anyway (expects 5 parts). Consistent. ✓

**One design note:** `extractMfaFlagFromToken` (and `extractJtiFromToken`) parse without verifying. That's fine for the GET's use, but ensure no **authenticated** decision is ever based on these alone downstream. Current callers only use them for informational JTI extraction (session-revoke UI) and the gated `mfaVerified` flag. ✓

---

## 7. Tests — gaps and updates required

**Existing test inventory (admin/session):** Now implemented. `src/app/api/admin/session/route.ts` ships with `route.test.ts`, and `src/lib/admin/session.ts` ships with `session.test.ts`. Full suite: **25 files / 162 tests, all passing** (`npx vitest run`); baseline was 23 files / 138 tests.

**Impact of the GET shape change:** No existing test asserted `GET /api/admin/session` returned `{ authenticated }`, so switching to `{ authenticated, mfaVerified }` broke no prior test. ✓ (Confirmed by repo-wide grep.) The new `route.test.ts` asserts the new shape.

**Added (verified):**


*Session API (`src/app/api/admin/session/route.test.ts`)*
- `GET` with no cookie → `{ authenticated: false, mfaVerified: false }`.
- `GET` cross-origin (bad `Origin`) → `403 'Cross-origin request blocked.'`.
- `GET` with a valid `mfaFlag=0` token → `{ authenticated: true, mfaVerified: false }`.
- `GET` with a valid `mfaFlag=1` token → `{ authenticated: true, mfaVerified: true }`.
- `POST` with wrong key → `401`; with correct key → `200` + sets `rr_admin_session` (Strict/HttpOnly).
- `POST` rate-limit exhaustion → `429`.
- `DELETE` → clears cookie, `SameSite=strict`.

*Session lib (`src/lib/admin/session.test.ts`)*
- `extractMfaFlagFromToken`: v2 `'0'`/`'1'`, v1 (4 parts) → `null`, garbage → `null`, undefined → `null`.
- `verifyAdminSessionToken` fail-closed when Supabase throws **and** `ALLOW_LEGACY_ADMIN_SESSION_FALLBACK` unset → `false`.
- `verifyAdminSessionToken` fail-open when Supabase throws **and** toggle `true` → `true` (for a signature-valid token).
- Tampered signature rejected; expired token rejected.
- `requireMfa` gating: `mfaFlag='0'` with `requireMfa=true` → `false`; with `false` → `true` (sig valid).

*MFA flow (recommended follow-ups — not yet implemented):*

- `POST /api/admin/send-mfa` with pre-MFA token → 200 + sets `admin_mfa_challenge` cookie; rate-limited 429 after 3.
- `POST /api/admin/verify-mfa` with valid code → re-issues `mfaFlag=1` token; with invalid code → 401; challenge cookie cleared on success.
- Middleware: unauthenticated request to `/admin/mfa-challenge` → allowed (200); to `/admin` → redirect to `/admin/login`.

---

## Appendix: what the agent actually changed (vs. pre-existing code at HEAD)

This matters because several items in the agent's summary were *already* true at commit `5ec1526`:

| File | Agent's claim | Actually in `git diff` (the real change) |
|------|---------------|-------------------------------------------|
| `session.ts` | "Fail-closed DB fallback", v2 token, `requireMfa` | Only **`extractMfaFlagFromToken`** was added; the fallback/fail-closed/v2 logic **pre-existed**. |
| `middleware.ts` | nonce header, CSRF cookie, auth exemptions | These **pre-existed**. Agent's real diff: added `/admin/mfa-challenge` exemption + `rrs_csp_nonce` cookie on all branches + `export { CSP_NONCE_COOKIE }`. |
| `.env` | "Added `ALLOW_LEGACY_ADMIN_SESSION_FALLBACK=true`" | **Not present** in `.env` (nor any env file found). Toggle resolves to `false`. |
| `layout.tsx` | (implied CSP fix) | Added the **cookie fallback** for nonce; header-only read already existed. |
| `route.ts` / `AALGuard.tsx` | as described | Changes match (CSRF removal on POST/DELETE; AALGuard sessionStorage→server fetch). |

---

## Permanently-applied fixes (status)

1. **.env** ✅ — added `ALLOW_LEGACY_ADMIN_SESSION_FALLBACK=true` (with an explanatory comment) to `.env`, **and** hardened `allowLegacySessionFallback()` in `src/lib/admin/session.ts` to force-disabled on Vercel/production (a stray `true` can never weaken production revocation). Resolves Q2.
2. **CSRF** ✅ — restored a *lenient* same-origin check (`validateCsrfOriginLenient` in `src/lib/security/csrf.ts`, wired into login `POST` and logout `DELETE` in `src/app/api/admin/session/route.ts`; GET keeps the strict probe-prevention check). Cross-origin requests are still rejected; same-origin that omits `Origin` is allowed. Aligns with `docs/PENTEST_CSRF_PLAYBOOK.md` §2.4. Residual login-CSRF is mitigated by MFA. Resolves Q1.
3. **CSP nonce** — code left as the agent's header + `<body nonce>` approach (correct for Next 16; cookie kept as a harmless defensive net). In-browser verification remains the only open item (see §4 revised note).
4. **Tests** ✅ — added `src/lib/admin/session.test.ts` (extractMfaFlagFromToken; fail-closed/open; MFA gating; tampered/expired/v1) and `src/app/api/admin/session/route.test.ts` (GET `{authenticated,mfaVerified}` shape; GET cross-origin 403; login 403/401/429; logout cookie clear). Resolves Q7.
5. (Lower) Unused deprecated `AALGuard.tsx` left in place — delete at discretion (no security impact; not imported by anything).

**Verification:** `npx tsc --noEmit` and `npx vitest run` pass (see §7 for the new test counts); `npx next build` compiles. CSP nonce still requires a manual browser check as noted in §4.


