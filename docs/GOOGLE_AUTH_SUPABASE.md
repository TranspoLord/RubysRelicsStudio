# Google OAuth (Supabase Auth) — Implementation & Setup

**Status:** implemented · **Providers:** Google only · **Package:** `@supabase/ssr@0.12.7`

This document covers the customer-facing sign-in stack, the provider audit that
preceded it, and everything that must be configured outside the repository
(Supabase dashboard, Google Cloud console, environment variables).

---

## 1. Provider audit (what was removed)

An audit of the working tree (395 files) and `package.json` found **no active
third-party OAuth implementation** to remove:

| Checked | Result |
| --- | --- |
| `next-auth`, `@auth0/*`, `firebase`, `@clerk/*`, `passport`, `amazon-cognito-identity-js` | not installed — zero occurrences in `package.json` / `package-lock.json` |
| Provider components / hooks (`AuthProvider`, `useAuth`, a `SignIn` component) | none existed — this change introduces the first ones |
| Provider routing (`/auth/*`, callback routes, `[...nextauth]`) | none existed — `/auth/callback` is new |
| `supabase/config.toml` provider blocks | `[auth.external.apple]` stub and `[auth.third_party.{firebase,auth0,aws_cognito,clerk}]` stubs — **all removed**, replaced by a single enabled `[auth.external.google]` |

### The admin panel: switched to Google OAuth (2026-09-26)

`/admin` and `/api/admin/*` now use the same Supabase Auth stack as the
storefront, gated twice:

- **Proxy** (`src/proxy.ts` + `src/lib/admin/edge-gate.ts`) — a verified JWT
  whose `app_metadata.role === 'admin'`. The proxy runs before the route handler
  and cannot query Postgres, so the claim is an optimisation, not the authority;
- **Request** (`src/lib/admin/auth.ts`) — the same claim *plus* a live
  `exp_admin_users` row with `is_active = true` and `revoked_at is null`. That
  row is the revocation authority, so removing an account takes effect on the
  next request rather than at the next token expiry.

Only allow-listed accounts get in: `npm run admin:grant -- <google-email>
--confirm-user-id <uuid>` / `npm run admin:revoke -- <google-email>`, keyed by
`auth.users.id` — never by email alone (the grant command requires you to confirm
the resolved `user_id`, and refuses an unconfirmed address or a non-Google
identity — OCT #11). The former `ADMIN_LOGIN_KEY` + emailed-MFA flow is no longer
on any request path; its files and tables are removed by
`docs/archive/SEPT_IMPLEMENTATION_PLAN.md` §10.8–§10.12.

Authorization reads `app_metadata` only. `user_metadata` is writable by the
signed-in user, so a token carrying `user_metadata.role === 'admin'` is **not**
an admin — `src/lib/auth/claims.ts` is the single place that rule lives.

### Also out of scope

Customer account tables were removed on purpose in
`supabase/migrations/042_remove_customer_accounts.sql`, so `auth.users` rows are
currently the only place a customer identity exists. Google sign-in creates
those rows; nothing reads them yet (§8 lists the follow-ups).

---

## 2. Files added / changed

| File | Purpose |
| --- | --- |
| `src/lib/supabase/env.ts` | Centralised, validated env accessors (`getSupabaseUrl`, `getSupabasePublishableKey`, `getSiteUrl`) |
| `src/lib/supabase/browser.ts` | `getBrowserSupabaseClient()` — `createBrowserClient<Database>`, one instance per tab |
| `src/lib/supabase/server.ts` | `createServerSupabaseClient()` — `createServerClient<Database>` bound to request cookies |
| `src/lib/supabase/update-session.ts` | `updateSupabaseSession()` — rotates session cookies + emits `@supabase/ssr` cache headers |
| `src/lib/auth/redirect.ts` | `sanitizeAuthNextPath()` / `buildAuthCallbackUrl()` — open-redirect-safe `next` handling |
| `src/lib/auth/redirect.test.ts` | 16 unit tests for the redirect helpers |
| `src/components/auth/AuthProvider.tsx` | `<AuthProvider>` + `useAuth()` session context |
| `src/components/auth/SignIn.tsx` | Google sign-in / signed-in / sign-out UI (`signInWithOAuth`) |
| `src/app/auth/callback/route.ts` | PKCE code exchange → sets session cookies → redirects to `next` |
| `src/app/auth/auth-error/page.tsx` | Friendly failure page for cancelled / rejected sign-ins |
| `src/app/sign-in/page.tsx` | Hosts `<SignIn />` at `/sign-in` |
| `src/types/database.ts` | Generated `Database` type used to strongly type every client |
| `src/app/layout.tsx` | Wraps the tree in `<AuthProvider>` |
| `src/proxy.ts` | Calls `updateSupabaseSession()` on storefront routes (Next 16's name for `middleware.ts`) |
| `supabase/config.toml` | `[auth.external.google]` enabled, redirect URLs registered |
| `package.json` | `@supabase/ssr@0.12.7` (pinned), `@supabase/supabase-js` ^2.117.1, `npm run db:types` |

---

## 3. Flow

```
/sign-in  ──[signInWithOAuth({ provider: 'google' })]──►  accounts.google.com
   ▲                                                            │
   │                                                            ▼
   │                                          https://<ref>.supabase.co/auth/v1/callback
   │                                                            │
   │                                                            ▼
   └── /auth/callback?code=…&next=…  ◄── exchangeCodeForSession(code)
                 │
                 └─► 302 to `next` (sanitized, same-origin) with session cookies set
```

Session storage is **cookies** (not `localStorage`) so Server Components can
render the signed-in state. Both `createServerClient` and `createBrowserClient`
force `flowType: 'pkce'`, which is why the callback can exchange a `code`.
Because Server Components cannot write cookies, `src/proxy.ts` calls
`updateSupabaseSession()` on every storefront request to rotate expiring tokens.

---

## 4. Supabase dashboard setup

Project: `RubysRelics` (`cvkhrpejzsnzsjffrvnr`).

1. **Authentication → Providers → Google** — enable it, then paste the
   *Client ID* and *Client Secret* from §5.
2. **Authentication → Providers → Email / Phone / Anonymous** — **disable them**
   unless they are genuinely needed. Admin access is granted by matching an email
   address in `auth.users` (see §9 and OCT #11), so any provider that can create an
   account without Google widens that path. If Email has to stay, require
   confirmation — the grant script refuses an unconfirmed address either way.
3. **Authentication → URL Configuration** — **exact** URLs only (OCT #11):
   - *Site URL*: `https://<your-domain>`
   - *Redirect URLs*:
     - `https://<your-domain>/auth/callback`
     - `http://localhost:3000/auth/callback` — only if you run the app locally
   - **Do not add `https://<your-domain>/**`,
     `https://*-<team-slug>.vercel.app/**` or `http://localhost:3000/**`.**
     Supabase honours any allow-listed `redirect_to` for a flow the *attacker*
     starts: they send the admin a crafted
     `/auth/v1/authorize?provider=google&redirect_to=<their-url>` link, Google
     skips the account chooser, and the admin's one-time `code` lands on the
     attacker's origin — where they exchange it with their own PKCE verifier for an
     admin session. The app's PKCE does not help, because the attacker owns the
     flow.
   - The `/**` entry exists to let the `?next=` destination match. The callback
     carries `next` as a **sanitized same-origin path** (`sanitizeAuthNextPath`),
     so the exact `/auth/callback` entry is sufficient; if the dashboard rejects a
     `redirect_to` that carries `?next=`, keep the exact entry and pass `next`
     through a short-lived first-party cookie set before `signInWithOAuth()`.
   - Preview deployments therefore sign in through production, or get their **own**
     Supabase project — which is also what removes the production project from
     local development (see §11).

A `redirectTo` that is not covered by the allow-list produces the
`redirect_uri_mismatch` / "requested path is invalid" error on
`/auth/auth-error` — that is the single most common setup failure.

## 5. Google Cloud setup

1. Create/select a project in the [Google Cloud console](https://console.cloud.google.com/).
2. **APIs & Services → OAuth consent screen** (Google Auth Platform):
   - User type: *External*
   - Scopes: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`
     (add `openid` manually — it is not pre-ticked)
   - Add the studio domain as an authorised domain and verify the branding so
     Google shows "Ruby's Relics Studio" instead of the Supabase project ref.
3. **Credentials → Create credentials → OAuth client ID → Web application**
   - *Authorized JavaScript origins*: `https://<your-domain>`, `http://localhost:3000`
   - *Authorized redirect URIs*: **`https://cvkhrpejzsnzsjffrvnr.supabase.co/auth/v1/callback`**
     (this is Supabase's callback, **not** `/auth/callback` — Supabase forwards to the app)
4. Copy the Client ID / Client Secret into the Supabase provider screen (§4) —
   and into `SUPABASE_AUTH_EXTERNAL_GOOGLE_*` only if you run the local CLI stack.

## 6. Environment variables

Add to `.env` (local) and to the Vercel project settings (Production / Preview /
Development). `.env.example` holds the annotated template.

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public/anon key — browser-safe, RLS-protected |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | optional | New name for the same key; takes precedence when set |
| `SUPABASE_SERVICE_ROLE_KEY` | yes (server) | Bypasses RLS — server-only, never `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SITE_URL` | recommended | Canonical origin used to build `redirectTo`; must match §4 |
| `NEXT_PUBLIC_APP_URL` | optional | Legacy alias for the above (already set in this project) |
| `NEXT_PUBLIC_VERCEL_URL` | auto | Vercel preview fallback when no site URL is set |
| `NEXT_PUBLIC_APP_ENV` | yes | `development` \| `test` \| `production` (branch isolation) |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `_SECRET` | local CLI only | Substituted into `supabase/config.toml` by `supabase start` |
| `ADMIN_LOGIN_KEY`, `ADMIN_MFA_EMAIL`, `SESSION_*_SEED`, `MFA_CODE_HASH_KEY_SEED` | retired | Legacy admin key + MFA — off the request path since 2026-09-26, removed by `docs/archive/SEPT_IMPLEMENTATION_PLAN.md` §10.13 |

The Google Client Secret lives **only** in the Supabase provider settings (and
the local CLI env). It is never read by the Next.js app.

## 7. Typed client definitions

`Database` in `src/types/database.ts` is the single type parameter for
`createBrowserClient<Database>` and `createServerClient<Database>`.

**It is still the empty scaffold** — the generator needs an authenticated CLI
session, which this environment does not have:

```bash
npx supabase login          # once per machine
npm run db:types            # supabase gen types typescript --linked --schema public
```

Until that runs, signing in works normally (the auth API needs no table types),
but `supabase.from('<table>')` on a typed client will not compile. That is
intentional: it forces the types to be regenerated rather than letting queries
drift. Existing server-side data access is untouched and keeps using the
untyped `getSupabaseAdmin()` from `src/lib/supabase/client.ts`.

For authorization decisions, use `getClaims()` (or `getUser()`), never
`getSession()` — the latter reads the cookie without re-validating the JWT. The
`useAuth()` context is for rendering only.

## 8. Follow-ups (not in this change)

- **Persist customer data against `auth.users`.** Order/wishlist-style features
  need a `customer_id uuid references auth.users(id)` column plus RLS policies
  written against `auth.uid()` (never against `user_metadata`, which users can
  edit).
- **Decide the customer account surface.** `/sign-in` is reachable directly but
  is not linked from the header nav yet.
- **Admin panel**: migrated to Google OAuth on 2026-09-26 (see §1). Still open:
  deleting the retired key + MFA code and tables (`docs/archive/SEPT_IMPLEMENTATION_PLAN.md`
  §10.8–§10.12), and deciding whether a *second* factor is wanted — Supabase
  supports per-account TOTP MFA (`supabase.auth.mfa.*`), which is a different
  mechanism from the emailed codes that were removed.
- **Rate limiting / captcha** on sign-in if abuse appears (Supabase dashboard →
  Authentication → Rate Limits).

## 9. Verification performed

```bash
npm run type-check       # clean
npm test                 # 37 files / 255 tests pass (includes the admin gate + claims suites)
npm run build            # succeeds; /sign-in, /auth/callback, /auth/auth-error compiled
npx eslint <new files>   # clean
```

`npm run lint` still reports 9 pre-existing errors in untouched storefront
components (`CategoryGrid.tsx`, `HeroSection.tsx`, large admin pages) — they
predate this change.

Content-Security-Policy note: the redirect-based flow needs no CSP change —
`connect-src` already allows `https://*.supabase.co` (token exchange, refresh,
JWKS) and the Google hop is a top-level navigation, not a `fetch`/form post.
Adding Google One Tap later **would** require `https://accounts.google.com` in
`script-src` and `frame-src`.
