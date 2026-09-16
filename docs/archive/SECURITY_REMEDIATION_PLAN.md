# Security Remediation Plan — Ruby's Relics Studio

**Project:** Ruby's Relics Studio
**Created:** 2026-07-19
**Companion document:** `docs/SECURITY_SPECIFICATION.md` (formal spec with controls & test cases)
**Source audits:** `docs/SECURITY_AUDIT.md`, `docs/SECURITY_AUDIT_REPORT.md`

---

## Executive Summary

This plan remediates 31 active security findings identified across two audit reports, plus 1 critical gap discovered during verification (orders are never persisted to the database). A strategic decision to **remove customer accounts entirely** eliminates 8 findings as moot and simplifies the security surface significantly.

**Total effort estimate:** ~5.5 days
**Phases:** 5 (0–4), ordered by dependency and severity

---

## Phase 0 — Customer Account Removal (Prerequisite)

**Rationale:** Customer accounts add significant security surface (password storage, session management, reset flows, CSRF on profile/logout) and data-storage cost, while providing minimal value for a storefront where Square handles order management and cart memory lives in localStorage. Removing accounts eliminates 8 findings entirely.

### 0.1 Database Migration: Drop Customer Account Tables

**Files affected:**
- New: `supabase/migrations/042_remove_customer_accounts.sql`

**Approach:**
```sql
-- Drop tables with CASCADE dependencies
DROP TABLE IF EXISTS exp_wishlists CASCADE;
DROP TABLE IF EXISTS exp_customer_addresses CASCADE;
DROP TABLE IF EXISTS exp_password_reset_tokens CASCADE;
DROP TABLE IF EXISTS exp_customer_sessions CASCADE;
DROP TABLE IF EXISTS exp_recently_viewed CASCADE;
DROP TABLE IF EXISTS exp_customers CASCADE;

-- Null out optional customer_id references on surviving tables
ALTER TABLE exp_orders DROP COLUMN IF EXISTS customer_id;
ALTER TABLE exp_custom_requests DROP COLUMN IF EXISTS customer_id;
ALTER TABLE exp_newsletter_subscribers DROP COLUMN IF EXISTS customer_id;
ALTER TABLE exp_back_in_stock_alerts DROP COLUMN IF EXISTS customer_id;
ALTER TABLE exp_capacity_reopen_alerts DROP COLUMN IF EXISTS customer_id;
```

**Acceptance criteria:**
- [ ] Migration applies cleanly with no orphaned FK errors
- [ ] `exp_orders`, `exp_custom_requests`, `exp_newsletter_subscribers`, `exp_back_in_stock_alerts`, `exp_capacity_reopen_alerts` still function without `customer_id`
- [ ] No table named `exp_customers`, `exp_customer_sessions`, `exp_password_reset_tokens`, `exp_customer_addresses`, `exp_wishlists`, `exp_recently_viewed` exists post-migration

**Effort:** 1 hour

---

### 0.2 Delete Customer API Routes

**Files to delete:**
- `src/app/api/customer/login/route.ts`
- `src/app/api/customer/signup/route.ts`
- `src/app/api/customer/logout/route.ts`
- `src/app/api/customer/forgot-password/route.ts`
- `src/app/api/customer/reset-password/route.ts`
- `src/app/api/customer/profile/route.ts`
- `src/app/api/customer/preferences/route.ts`

**Acceptance criteria:**
- [ ] No file under `src/app/api/customer/` exists
- [ ] No import of `verifyCustomerSession` or `requireCustomerAuth` remains in codebase

**Effort:** 30 minutes

---

### 0.3 Delete Customer-Facing Pages

**Files/directories to delete:**
- `src/app/login/`
- `src/app/signup/`
- `src/app/forgot-password/`
- `src/app/reset-password/`
- `src/app/account/`
- `src/app/wishlist/`

**Acceptance criteria:**
- [ ] No route `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/account`, `/wishlist` resolves
- [ ] No dead imports referencing deleted pages

**Effort:** 30 minutes

---

### 0.4 Delete Customer Auth Library

**Files to delete/gut:**
- `src/lib/auth/customer.ts` — delete entirely (no remaining consumers after route removal)

**Acceptance criteria:**
- [ ] No import of `@/lib/auth/customer` exists in codebase
- [ ] `npm run build` succeeds without the file

**Effort:** 15 minutes

---

### 0.5 Refactor Surviving Email-Based Features

**Files affected:**
- `src/app/api/newsletter/subscribe/route.ts` — remove `exp_customers` lookup block (lines ~33-37, 64-78)
- `src/app/api/back-in-stock/subscribe/route.ts` — remove `exp_customers` lookup block
- `src/app/api/cart/capture/route.ts` — remove any `customer_id` references
- `src/app/api/custom-orders/route.ts` — remove any `customer_id` references
- `src/app/api/custom-orders/[id]/route.ts` — remove any `customer_id` references

**Approach:** For each route, remove the optional `exp_customers` email lookup and the `customer_id` field from inserts. These features already work by email; the customer link was a convenience that is no longer possible.

**Acceptance criteria:**
- [ ] Newsletter subscription works with email only
- [ ] Back-in-stock subscription works with email only
- [ ] Cart capture works with email only
- [ ] Custom order submission works with email only
- [ ] No `customer_id` column referenced in any insert/upsert

**Effort:** 1 hour

---

### 0.6 Update Frontend: Remove Account UI

**Files affected:**
- `src/components/layout/Header.tsx` — remove login/account/wishlist links
- `src/components/shop/ProductConfigurator.tsx` — remove wishlist button if present
- `src/components/cart/CartPageView.tsx` — remove any "save for later" / wishlist actions
- Any component importing `useCustomerAuth` or reading `rr_customer_session` cookie

**Acceptance criteria:**
- [ ] Header shows no "Login", "Account", or "Wishlist" links
- [ ] No component references customer session state
- [ ] Cart persists in localStorage as before (no change to cart memory)
- [ ] Checkout flow works without any account requirement

**Effort:** 1 hour

---

### 0.7 Remove Recently-Viewed API (Move to localStorage)

**Files to delete:**
- `src/app/api/recently-viewed/route.ts`
- `supabase/migrations/012_recently_viewed.sql` (table dropped in 0.1)

**Files to update:**
- Any component that calls `/api/recently-viewed` — replace with localStorage-based tracking

**Acceptance criteria:**
- [ ] Recently-viewed products tracked in localStorage only
- [ ] No API call to `/api/recently-viewed`
- [ ] No `exp_recently_viewed` table in DB

**Effort:** 1 hour

---

### Phase 0 Summary

| Task | Effort | Findings Eliminated |
|------|--------|-------------------|
| 0.1 DB migration | 1h | SEC-033, SEC-034, SEC-035, SEC-036, SEC-037, SEC-038, SEC-039, SEC-040 |
| 0.2 Delete API routes | 30m | |
| 0.3 Delete pages | 30m | |
| 0.4 Delete auth lib | 15m | |
| 0.5 Refactor features | 1h | |
| 0.6 Update frontend | 1h | |
| 0.7 Remove recently-viewed API | 1h | SEC-024 |
| **Total** | **~5h** | **9 findings eliminated** |

---

## Phase 1 — Critical Fixes (P0)

### SEC-001: Server-Side Price Validation in Square Checkout

**Source:** Report C1, Audit H2
**Severity:** Critical
**CWE:** CWE-472, CWE-345
**Location:** `src/app/api/square/checkout/route.ts:43-52`
**Depends on:** SEC-002 (order row must exist for reconciliation)

**Problem:** The checkout endpoint accepts `unitPrice` directly from the client and passes it to Square without server-side verification. An attacker can pay $0.01 for any product.

**Implementation:**
1. Change the request body schema to accept only `{ productId, variantId, selectedOptions, quantity }` — never `unitPrice` or `lineTotal`.
2. Fetch product + variant + options from Supabase server-side.
3. Run through `computeCanonicalLine()` (note: the audit's `computeCanonicalLinePricing` name is stale — the actual export is `computeCanonicalLine` in `src/lib/pricing/engine.ts`).
4. Use the server-computed `unitAmountCents` as the Square `base_price_money.amount`.
5. Validate shipping rate server-side by re-querying Shippo or using a cached rate from a server-issued rate token.

**Files affected:**
- `src/app/api/square/checkout/route.ts` — rewrite line-item construction
- `src/components/shop/SquareCheckoutButton.tsx` — stop sending `unitPrice`
- `src/components/cart/CartPageView.tsx` — stop sending `unitPrice`
- `src/components/shop/ProductConfigurator.tsx` — stop sending `unitPrice`

**Acceptance criteria:**
- [ ] `unitPrice` is never read from the request body
- [ ] Price is computed exclusively via `computeCanonicalLine()` server-side
- [ ] A request with `unitPrice: 0.01` produces a checkout at the correct DB price
- [ ] Shipping rate is validated server-side (not client-supplied amount)

**Verification:**
```bash
# Should produce checkout at full price, not $0.01
curl -X POST http://localhost:3000/api/square/checkout \
  -H "Content-Type: application/json" \
  -d '{"items":[{"productId":"<real-uuid>","quantity":1,"unitPrice":0.01}]}'
```

**Effort:** 2 hours

---

### SEC-002: Persist Orders to Database at Checkout Time

**Source:** Discovered during audit verification
**Severity:** Critical
**CWE:** CWE-345 (no persistent record to reconcile against)

**Problem:** The Square checkout route creates a Square payment link but never inserts a row into `exp_orders`. The webhook later tries to update a non-existent row. There is no stored `order_total` to reconcile against the payment amount, which makes SEC-001's price validation ineffective (attacker pays $0.01, webhook marks it paid, no comparison possible).

**Implementation:**
1. After computing server-side prices (SEC-001), insert a row into `exp_orders` with:
   - `square_order_id` (from Square checkout response `payment_link.order_id`)
   - `order_total` (server-computed total in cents)
   - `payment_status: 'pending'`
   - `status: 'checkout_created'`
   - `customer_email` (from `buyerEmail`)
   - `guest_tracking_token` (generated server-side)
2. Return the `guest_tracking_token` to the client so they can track the order.
3. In the webhook (SEC-003), compare `payment.total_money.amount` to `order_total` before marking paid.

**Files affected:**
- `src/app/api/square/checkout/route.ts` — add DB insert after Square checkout creation
- `src/app/api/webhooks/square/route.ts` — add amount reconciliation (see SEC-003)
- `supabase/migrations/` — verify `exp_orders` has `order_total`, `guest_tracking_token`, `square_order_id` columns (add if missing)

**Acceptance criteria:**
- [ ] Every successful checkout creates an `exp_orders` row with `payment_status: 'pending'`
- [ ] `order_total` matches the sum of server-computed line items + shipping
- [ ] `guest_tracking_token` is returned to the client
- [ ] Webhook can find the order by `square_order_id`

**Verification:**
- Complete a test checkout and confirm `exp_orders` row exists with `payment_status: 'pending'`
- Confirm webhook updates the row to `payment_status: 'paid'` only when amounts match

**Effort:** 2 hours

---

### SEC-003: Square Webhook Hardening (Signature + Replay + Reconciliation)

**Source:** Report C3
**Severity:** Critical
**CWE:** CWE-347
**Location:** `src/app/api/webhooks/square/route.ts:9-24`
**Depends on:** SEC-002 (needs `order_total` to reconcile)

**Problem:** The webhook signature verification uses a plain HMAC-of-body in hex, which may not match Square's actual signature scheme (Square uses the notification URL in the signature and base64 encoding, and ships a `WebhooksHelper` SDK). Additionally: no replay protection, no amount reconciliation, rate-limited by IP (Square sends from a fixed pool).

**Implementation:**
1. Replace the custom verifier with Square's official `WebhooksHelper.verifySignature` (per [Square docs](https://developer.squareup.com/docs/webhooks/step3validate)).
2. Add a `exp_square_webhook_events` table to deduplicate by `event.id` (persist ≥24h).
3. Look up the order by `square_order_id`, compare `payment.total_money.amount` to stored `order_total`. Fail-closed (do not mark paid) if mismatch.
4. Change rate limiting from IP-based to event-type-based (see SEC-041).

**Files affected:**
- `src/app/api/webhooks/square/route.ts` — replace verifier, add dedup + reconciliation
- New: `supabase/migrations/043_square_webhook_events.sql` — `exp_square_webhook_events` table

**Acceptance criteria:**
- [ ] Signature verified using Square's official `WebhooksHelper`
- [ ] Duplicate `event.id` within 24h returns 200 but does not reprocess
- [ ] Payment amount mismatch → order not marked paid, error logged
- [ ] Rate limit keyed by event type, not IP

**Effort:** 2 hours

---

### SEC-004: Shippo Webhook Fail-Closed + Timing-Safe Comparison

**Source:** Report C4, Audit H1
**Severity:** Critical
**CWE:** CWE-1188, CWE-347
**Location:** `src/app/api/shippo/webhook/route.ts:32-45`

**Problem:** Signature verification is wrapped in `if (webhookSecret && signature)` — if the env var is unset or the header is absent, the webhook processes without verification. Comparison uses `!==` (not timing-safe).

**Implementation:**
1. Fail-closed: if `SHIPPO_WEBHOOK_SECRET` is unset → return 500. If `x-shippo-signature` header is missing → return 401.
2. Use `crypto.timingSafeEqual` for comparison (pattern from `webhooks/square/route.ts:26-33`).
3. Add startup-time validation that `SHIPPO_WEBHOOK_SECRET` is set in production (in `next.config.ts` or a health check).

**Files affected:**
- `src/app/api/shippo/webhook/route.ts` — rewrite verification block

**Acceptance criteria:**
- [ ] Missing `SHIPPO_WEBHOOK_SECRET` env var → 500 response, no processing
- [ ] Missing `x-shippo-signature` header → 401 response, no processing
- [ ] Invalid signature → 401 response, no processing
- [ ] Comparison uses `timingSafeEqual`, not `!==`
- [ ] No code path reaches payload processing without verified signature

**Effort:** 30 minutes

---

### Phase 1 Summary

| Task | Finding | Effort |
|------|---------|--------|
| SEC-001 | Server-side price validation | 2h |
| SEC-002 | Persist orders to DB | 2h |
| SEC-003 | Square webhook hardening | 2h |
| SEC-004 | Shippo webhook fail-closed | 30m |
| **Total** | | **~6.5h** |

---

## Phase 2 — High Fixes (P1)

### SEC-005: MFA Codes Use Cryptographic Random

**Source:** Report H1
**Severity:** High
**CWE:** CWE-338
**Location:** `src/lib/admin/mfa-store.ts:59`

**Implementation:**
```typescript
import { randomInt, randomUUID } from 'node:crypto'
// Replace line 59:
const code = randomInt(100000, 1000000).toString()
```

**Acceptance criteria:**
- [ ] `Math.random()` is not used for MFA code generation
- [ ] `crypto.randomInt(100000, 1000000)` is used instead

**Effort:** 5 minutes

---

### SEC-006: Rate Limit on verify-mfa Endpoint

**Source:** Report H3, Audit C3
**Severity:** High
**CWE:** CWE-307
**Location:** `src/app/api/admin/verify-mfa/route.ts:8`

**Implementation:**
1. Add rate limiting to the verify-mfa POST handler, keyed by challenge token (not IP):
```typescript
const rl = rateLimit(`admin-mfa-verify:${challengeToken}`, 5, 5 * 60 * 1000)
if (!rl.allowed) {
  return NextResponse.json({ error: 'Too many attempts. Request a new code.' }, { status: 429 })
}
```
2. After 5 failed attempts, invalidate the challenge token in the database (mark as consumed/revoked).

**Files affected:**
- `src/app/api/admin/verify-mfa/route.ts`

**Acceptance criteria:**
- [ ] 6th verification attempt within 5 minutes → 429 response
- [ ] Challenge token invalidated after 5 failures
- [ ] Rate limit keyed by challenge token, not IP

**Effort:** 30 minutes

---

### SEC-007: Remove MFA In-Memory Map Fallback

**Source:** Report H4
**Severity:** High
**CWE:** CWE-1004 (conceptual)
**Location:** `src/lib/admin/mfa-store.ts:30, 114-117`

**Implementation:**
1. Remove the module-level `const mfaStore = new Map<string, MFACodeEntry>()` (line 30).
2. Remove the fallback-to-memory code paths in `createMFACode` (lines 114-117) and `verifyMFACode`.
3. If Supabase insert fails, fail closed with a clear error — do not silently fall back to memory.
4. Remove the `maybePruneMemoryStore()` function and its calls.

**Files affected:**
- `src/lib/admin/mfa-store.ts`

**Acceptance criteria:**
- [ ] No `Map` declaration in `mfa-store.ts`
- [ ] Supabase insert failure → error returned to caller, no silent fallback
- [ ] No `maybePruneMemoryStore` function exists

**Effort:** 30 minutes

---

### SEC-008: Migrate Rate Limiter to Supabase-Backed Persistent Store

**Source:** Report H6, Audit C2
**Severity:** High
**CWE:** CWE-770
**Location:** `src/lib/rate-limit.ts:20`
**Depends on:** Nothing (but unblocks SEC-006, SEC-010, SEC-015, SEC-041)

**Problem:** Module-level `Map` resets on every Vercel serverless cold start. Effective allowed QPS = `configured_limit × num_warm_instances`.

**Implementation:**
1. Create `exp_rate_limit_windows` table:
```sql
CREATE TABLE exp_rate_limit_windows (
  key TEXT NOT NULL,
  window_start BIGINT NOT NULL,
  count INT NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (key, window_start)
);
ALTER TABLE exp_rate_limit_windows ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated access — service role only
REVOKE ALL ON exp_rate_limit_windows FROM anon, authenticated;
```
2. Rewrite `rateLimit()` to use an atomic upsert:
```typescript
const windowStart = Math.floor(now / windowMs)
const windowKey = `${key}:${windowStart}`
const { data } = await supabase.rpc('increment_rate_limit', {
  p_key: windowKey,
  p_expires_at: new Date(windowStart * windowMs + windowMs).toISOString()
})
// data.count is the current count for this window
```
3. Create a Postgres function `increment_rate_limit` that does `INSERT ... ON CONFLICT DO UPDATE SET count = count + 1` atomically.
4. Add a periodic cleanup (or rely on TTL via `expires_at` + a lazy delete on read).

**Files affected:**
- `src/lib/rate-limit.ts` — rewrite `rateLimit()` function
- New: `supabase/migrations/044_rate_limit_table.sql` — table + RPC function

**Acceptance criteria:**
- [ ] No module-level `Map` in `rate-limit.ts`
- [ ] Rate limit state persists across serverless cold starts
- [ ] Two concurrent requests from different instances are both counted
- [ ] Latency overhead < 50ms per rate-limited request

**Effort:** 4 hours

---

### SEC-009: SVG Upload Sanitization (Server-Side DOMPurify)

**Source:** Report H7
**Severity:** High
**CWE:** CWE-79
**Location:** `src/app/api/admin/catalog/media/upload/route.ts:65`

**Implementation:**
1. Install `isomorphic-dompurify` (or `dompurify` + `jsdom` for server-side).
2. Replace the two-regex check with DOMPurify sanitization using the SVG profile:
```typescript
import DOMPurify from 'isomorphic-dompurify'

if (file.type === 'image/svg+xml') {
  const text = await file.text()
  const sanitized = DOMPurify.sanitize(text, {
    USE_PROFILES: { svg: true, svgFilters: true },
  })
  uploadBody = new Blob([sanitized], { type: 'image/svg+xml' })
}
```
3. This strips `onerror=`, `onload=`, `<foreignObject>`, `<script>`, event-handler attributes, `javascript:` URIs, `data:text/html` payloads, etc.

**Files affected:**
- `src/app/api/admin/catalog/media/upload/route.ts`
- `package.json` — add `isomorphic-dompurify` dependency

**Acceptance criteria:**
- [ ] SVG with `<svg onload="alert(1)">` is sanitized (handler removed)
- [ ] SVG with `<foreignObject>` is sanitized
- [ ] SVG with `onerror=` attributes is sanitized
- [ ] Clean SVG (paths, shapes, text) passes through unchanged

**Effort:** 1 hour

---

### SEC-010: Rate Limit Shippo Rates & Validate-Address Endpoints

**Source:** Report H8
**Severity:** High
**CWE:** CWE-770
**Location:** `src/app/api/shippo/rates/route.ts`, `src/app/api/shippo/validate-address/route.ts`
**Depends on:** SEC-008 (persistent rate limiter)

**Implementation:**
Add to both routes:
```typescript
import { rateLimit, rateLimitResponse, getClientIp } from '@/lib/rate-limit'

const ip = getClientIp(request)
const rl = rateLimit(`shippo-rates:${ip}`, 20, 60_000)
if (!rl.allowed) return rateLimitResponse(rl.retryAfter!)
```

**Acceptance criteria:**
- [ ] Both endpoints return 429 after 20 requests/minute from same IP
- [ ] Rate limit persists across cold starts (via SEC-008)

**Effort:** 30 minutes

---

### SEC-011: Admin Session Revocation Table

**Source:** Report H9
**Severity:** High
**CWE:** CWE-613
**Location:** `src/lib/admin/session.ts:13-18`

**Problem:** Session token format is `v1.{exp}.HMAC(adminKey)` — no JTI, no per-session record. Stolen tokens can't be revoked without rotating `ADMIN_LOGIN_KEY` (kicks out all admins).

**Implementation:**
1. Create `exp_admin_sessions` table:
```sql
CREATE TABLE exp_admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ
);
ALTER TABLE exp_admin_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON exp_admin_sessions FROM anon, authenticated;
```
2. Modify `createAdminSessionToken()` to generate a JTI (UUID), include it in the token payload, and insert a row with `token_hash = sha256(token)`.
3. Modify `verifyAdminSessionToken()` to look up the JTI in `exp_admin_sessions`, check `revoked_at IS NULL` and `expires_at > now()`.
4. Add a "revoke my other sessions" admin API endpoint.
5. Add a "revoke session" admin API endpoint (for admin to kill a specific session by ID).

**Files affected:**
- `src/lib/admin/session.ts` — add JTI, DB lookup
- New: `supabase/migrations/045_admin_sessions.sql`
- New: `src/app/api/admin/sessions/route.ts` — list/revoke sessions
- `src/app/admin/(panel)/settings/page.tsx` (or similar) — add session management UI

**Acceptance criteria:**
- [ ] Each admin login creates a unique `exp_admin_sessions` row
- [ ] Revoked sessions fail verification
- [ ] Admin can view and revoke their other sessions
- [ ] Token contains a JTI that maps to exactly one DB row

**Effort:** 4 hours

---

### SEC-012: Add middleware.ts for Admin Auth

**Source:** Report H10
**Severity:** High
**CWE:** CWE-306
**Location:** `src/middleware.ts` (does not exist)

**Problem:** No Next.js middleware exists. Admin auth is enforced by `requireAdminApiSession()` at the top of each handler. A new route that forgets to call it exposes admin functionality publicly.

**Implementation:**
Create `src/middleware.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminSessionToken } from '@/lib/admin/session'

export async function middleware(request: NextRequest) {
  // Block all /admin/* and /api/admin/* unless valid session cookie
  if (request.nextUrl.pathname.startsWith('/admin') ||
      request.nextUrl.pathname.startsWith('/api/admin')) {
    // Allow login page and session-creation endpoint
    if (request.nextUrl.pathname === '/admin/login' ||
        request.nextUrl.pathname === '/api/admin/session') {
      return NextResponse.next()
    }
    const cookie = request.cookies.get('rr_admin_session')
    if (!cookie || !verifyAdminSessionToken(cookie.value, process.env.ADMIN_LOGIN_KEY!)) {
      if (request.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}
```

**Files affected:**
- New: `src/middleware.ts`

**Acceptance criteria:**
- [ ] Unauthenticated request to `/api/admin/*` (except `/api/admin/session`) → 401
- [ ] Unauthenticated request to `/admin/*` (except `/admin/login`) → redirect to login
- [ ] Authenticated requests pass through
- [ ] Per-route `requireAdminApiSession()` calls remain as defense-in-depth

**Effort:** 1 hour

---

### Phase 2 Summary

| Task | Finding | Effort |
|------|---------|--------|
| SEC-005 | MFA crypto random | 5m |
| SEC-006 | verify-mfa rate limit | 30m |
| SEC-007 | Remove MFA memory fallback | 30m |
| SEC-008 | Persistent rate limiter | 4h |
| SEC-009 | SVG DOMPurify sanitization | 1h |
| SEC-010 | Shippo rate limits | 30m |
| SEC-011 | Admin session revocation | 4h |
| SEC-012 | middleware.ts | 1h |
| **Total** | | **~11.5h** |

---

## Phase 3 — Medium Fixes (P2)

### SEC-013: Search Query Filter-Syntax Hardening

**Source:** Report M1
**Severity:** Medium
**CWE:** CWE-20, CWE-943
**Location:** `src/app/api/search/route.ts:55-63`

**Implementation:**
Strip `,`, `.`, `(`, `)` in `sanitizeSearchQuery`, or switch to Supabase's typed filter form:
```typescript
.or(`title.ilike.%${sanitized}%,description.ilike.%${sanitized}%`)
```
→ Use the object form: `.or([{ title: { ilike: `%${sanitized}%` } }, ...])`

**Acceptance criteria:**
- [ ] Query `a,id.eq.<uuid>` does not alter the OR filter chain
- [ ] Only `title` and `description` are searched

**Effort:** 30 minutes

---

### SEC-014: CSRF Protection (Origin Validation + Double-Submit Cookie)

**Source:** Audit M1, Report M2
**Severity:** Medium
**CWE:** CWE-352
**Location:** All state-changing API routes

**Implementation (defense in depth — both layers):**

**Layer 1 — Origin/Referer validation:**
Create `src/lib/security/csrf.ts`:
```typescript
export function validateCsrf(request: Request): boolean {
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  const allowedOrigin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  if (!origin && !referer) return false
  if (origin && !origin.startsWith(allowedOrigin)) return false
  if (referer && !referer.startsWith(allowedOrigin)) return false
  return true
}
```
Apply to all POST/PATCH/DELETE API routes.

**Layer 2 — Double-submit cookie:**
- On page load, set a random CSRF token as a non-httpOnly cookie.
- Require the same token in an `X-CSRF-Token` header on all state-changing requests.
- The server compares the cookie value to the header value.

**Files affected:**
- New: `src/lib/security/csrf.ts`
- All POST/PATCH/DELETE API routes — add `validateCsrf(request)` check
- Client-side fetch wrapper — add `X-CSRF-Token` header

**Acceptance criteria:**
- [ ] Cross-origin POST without matching Origin header → 403
- [ ] Cross-origin POST with matching Origin but no CSRF token → 403
- [ ] Same-origin POST with valid CSRF token → succeeds

**Effort:** 4 hours

---

### SEC-015: Cart-Capture Rate Limiting

**Source:** Report M3
**Severity:** Medium
**CWE:** CWE-770
**Location:** `src/app/api/cart/capture/route.ts`
**Depends on:** SEC-008

**Implementation:**
```typescript
const ip = getClientIp(request)
const rl = rateLimit(`cart-capture:${ip}`, 10, 60 * 60 * 1000) // 10/hour
if (!rl.allowed) return rateLimitResponse(rl.retryAfter!)
```

**Acceptance criteria:**
- [ ] 11th cart capture from same IP within 1 hour → 429

**Effort:** 15 minutes

---

### SEC-016: Newsletter Re-Subscribe Bypass Fix

**Source:** Report M4
**Severity:** Medium
**CWE:** CWE-927
**Location:** `src/app/api/newsletter/subscribe/route.ts:42-57`

**Implementation:**
Before upserting, check if a row exists with `unsubscribed_at` set within the last N days. If so, do not silently re-subscribe — require an explicit confirmation email:
```typescript
const { data: existing } = await supabase
  .from('exp_newsletter_subscribers')
  .select('unsubscribed_at')
  .eq('email', email)
  .single()

if (existing?.unsubscribed_at) {
  const daysSinceUnsub = (Date.now() - new Date(existing.unsubscribed_at).getTime()) / 86400000
  if (daysSinceUnsub < 30) {
    // Send confirmation email instead of auto-resubscribing
    return NextResponse.json({ message: 'Please check your email to confirm re-subscription.' })
  }
}
```

**Acceptance criteria:**
- [ ] Recently unsubscribed email (within 30 days) is not auto-resubscribed
- [ ] Confirmation email is sent instead
- [ ] New emails are subscribed normally

**Effort:** 30 minutes

---

### SEC-017: HTML Email Injection Escaping

**Source:** Report M5
**Severity:** Medium
**CWE:** CWE-79
**Location:** `src/app/api/custom-orders/route.ts:152-160`, `src/app/api/custom-orders/[id]/route.ts:55-67`

**Implementation:**
Use the existing `safeHtmlEscape` from `src/lib/validate.ts:61-68` on every customer-supplied value interpolated into HTML email bodies:
```typescript
import { safeHtmlEscape } from '@/lib/validate'

html: `<p>Name: ${safeHtmlEscape(customerName)}</p>
       <p>Email: ${safeHtmlEscape(customerEmail)}</p>
       <p>Item: ${safeHtmlEscape(itemType)}</p>
       <p>Description: ${safeHtmlEscape(description)}</p>`
```

**Acceptance criteria:**
- [ ] `<img src=x onerror=alert(1)>` in customer name is escaped in email body
- [ ] No raw customer input is concatenated into HTML without escaping

**Effort:** 1 hour

---

### SEC-018: Custom-Order Artwork Ownership Verification

**Source:** Report M6
**Severity:** Medium
**CWE:** CWE-639
**Location:** `src/app/api/custom-orders/route.ts:80-82`

**Implementation:**
1. When `/api/custom-orders/upload` runs, insert a row in `exp_artwork_uploads` with the path + a per-session signed token (stored in httpOnly cookie).
2. On intake (`/api/custom-orders` POST), verify the token ↔ path binding before accepting the order.

**Files affected:**
- `src/app/api/custom-orders/upload/route.ts` — add token generation + DB insert
- `src/app/api/custom-orders/route.ts` — add token verification
- New: `supabase/migrations/046_artwork_uploads.sql` (if table doesn't exist)

**Acceptance criteria:**
- [ ] Order referencing another user's artwork path is rejected
- [ ] Token is per-session and cannot be reused by another session

**Effort:** 2 hours

---

### SEC-019: Standardize verify-mfa Secure Flag

**Source:** Report M7
**Severity:** Medium
**CWE:** CWE-614
**Location:** `src/app/api/admin/verify-mfa/route.ts:34`

**Implementation:**
Create a shared helper and use it everywhere:
```typescript
// src/lib/security/env.ts
export function isProd(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production'
}
```
Replace `process.env.NEXT_PUBLIC_APP_ENV === 'production'` with `isProd()` in verify-mfa route.

**Acceptance criteria:**
- [ ] All cookie `secure` flags use the same `isProd()` helper
- [ ] No route uses `NEXT_PUBLIC_APP_ENV` for secure flag

**Effort:** 10 minutes

---

### SEC-020: Standardize Cookie SameSite Attributes

**Source:** Report M10, Audit H3
**Severity:** Medium
**CWE:** CWE-1004
**Location:** `src/app/api/admin/session/route.ts:61`, `src/app/api/admin/verify-mfa/route.ts:35`

**Implementation:**
- Admin session cookie → `sameSite: 'strict'`
- Admin MFA cookie → `sameSite: 'strict'` (already is)
- Customer cookies → N/A (accounts removed in Phase 0)

**Acceptance criteria:**
- [ ] All admin cookies use `sameSite: 'strict'`
- [ ] No admin cookie uses `sameSite: 'lax'`

**Effort:** 15 minutes

---

### Phase 3 Summary

| Task | Finding | Effort |
|------|---------|--------|
| SEC-013 | Search filter hardening | 30m |
| SEC-014 | CSRF protection (both layers) | 4h |
| SEC-015 | Cart-capture rate limit | 15m |
| SEC-016 | Newsletter re-subscribe fix | 30m |
| SEC-017 | Email HTML escaping | 1h |
| SEC-018 | Artwork ownership verification | 2h |
| SEC-019 | Standardize secure flag | 10m |
| SEC-020 | Standardize SameSite | 15m |
| **Total** | | **~8.5h** |

---

## Phase 4 — Low Fixes (P3)

### SEC-021: Harden getClientIp Against Proxy Spoofing

**Source:** Report L1
**Severity:** Low
**CWE:** CWE-441
**Location:** `src/lib/rate-limit.ts:90-112`

**Implementation:**
Add an assertion that the app is running on Vercel (which overwrites `X-Forwarded-For`), or document the assumption:
```typescript
export function getClientIp(request: Request): string {
  if (process.env.VERCEL) {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  }
  // Non-Vercel: refuse to trust X-Forwarded-For
  console.warn('[rate-limit] getClientIp called outside Vercel — using unknown')
  return 'unknown'
}
```

**Effort:** 10 minutes

---

### SEC-022: Use Crypto Random for Upload Filenames

**Source:** Report L2
**Severity:** Low
**CWE:** CWE-338
**Location:** `src/app/api/admin/catalog/media/upload/route.ts:76`

**Implementation:**
```typescript
import { randomBytes } from 'node:crypto'
const uniqueSuffix = randomBytes(8).toString('hex')
```

**Effort:** 5 minutes

---

### SEC-023: Restrict Admin Session GET Endpoint

**Source:** Report L3
**Severity:** Low
**CWE:** CWE-200
**Location:** `src/app/api/admin/session/route.ts:20-32`

**Implementation:**
Require the request to come from the admin login page (same-origin check) or require a CSRF token for the GET endpoint.

**Effort:** 15 minutes

---

### SEC-024: ~~Recently-Viewed Accepts Any Product ID~~

**Source:** Report L4
**Status:** RESOLVED by Phase 0.7 (recently-viewed API removed, moved to localStorage)

---

### SEC-025: Tighten CSP to Nonce-Based Policy

**Source:** Report L5, Audit L1
**Severity:** Low
**CWE:** CWE-79
**Location:** `next.config.ts:5`

**Implementation:**
Migrate to a nonce-based CSP using Next.js's `headers()` + `generateNonce()` pattern. Remove `'unsafe-eval'` and `'unsafe-inline'` for scripts. Keep `'unsafe-inline'` for styles only (Next.js App Router requires it).

**Files affected:**
- `next.config.ts`

**Acceptance criteria:**
- [ ] CSP does not include `'unsafe-eval'` for `script-src`
- [ ] CSP does not include `'unsafe-inline'` for `script-src`
- [ ] Nonce-based script CSP is in place
- [ ] Application renders without CSP violations

**Effort:** 2 hours

---

### SEC-026: Sanitize Error Logging

**Source:** Report L6
**Severity:** Low
**CWE:** CWE-532
**Location:** Throughout (e.g., `console.error('[custom-orders:insert]', error?.message)`)

**Implementation:**
Create a sanitizing logger that strips known-sensitive patterns (env values, connection strings, API keys):
```typescript
// src/lib/security/logger.ts
const SENSITIVE_PATTERNS = [
  /postgres:\/\/[^\s]+/g,
  /sk_[a-zA-Z0-9]+/g, // Square keys
  /eyJ[a-zA-Z0-9._-]+/g, // JWTs
]

export function safeLogError(prefix: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const sanitized = SENSITIVE_PATTERNS.reduce((msg, pattern) => msg.replace(pattern, '[REDACTED]'), message)
  console.error(prefix, sanitized)
}
```
Replace `console.error` calls in API routes with `safeLogError`.

**Effort:** 1 hour

---

### SEC-027: Remove Dead RLS JWT Claim Branch

**Source:** Report L7
**Severity:** Low
**CWE:** CWE-285
**Location:** `supabase/migrations/039_rls_lockdown.sql:20`

**Implementation:**
Remove the `OR current_setting('request.jwt.claim.session_token', true) = ...` branch. Document that all customer reads go through the service role via API routes.

**Effort:** 15 minutes

---

### SEC-028: Remove Service Role Key Prefix from MFA Debug

**Source:** Audit M4
**Severity:** Low
**CWE:** CWE-200
**Location:** `src/app/api/admin/mfa-debug/route.ts:39`

**Implementation:**
```typescript
// Replace:
serviceRoleKeyPrefix: process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 20)
// With:
hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
```

**Effort:** 5 minutes

---

### SEC-029: Add Request Body Size Limits

**Source:** Audit M5
**Severity:** Low
**CWE:** CWE-770
**Location:** Multiple API routes

**Implementation:**
Create a shared body parser:
```typescript
// src/lib/security/body.ts
export async function parseJsonBody<T>(request: Request, maxSize = 1024 * 100): Promise<T> {
  const text = await request.text()
  if (text.length > maxSize) {
    throw new Error('Request body too large')
  }
  return JSON.parse(text) as T
}
```
Replace `await request.json()` with `await parseJsonBody(request)` in all API routes.

**Acceptance criteria:**
- [ ] Request body > 100KB → 413 response
- [ ] All API routes use `parseJsonBody`

**Effort:** 1 hour

---

### SEC-030: Remove Client-Side Admin Auth Flag

**Source:** Audit M6
**Severity:** Low
**CWE:** CWE-602
**Location:** `src/app/admin/login/page.tsx:42`

**Implementation:**
Remove `sessionStorage.setItem('admin_authenticated', 'true')` entirely. Server-side session verification is the only auth check.

**Effort:** 5 minutes

---

### SEC-031: Add Dependency Vulnerability Scanning to CI

**Source:** Audit L2
**Severity:** Low
**CWE:** CWE-1104
**Location:** `package.json`, CI config

**Implementation:**
1. Add scripts to `package.json`:
```json
{
  "scripts": {
    "audit": "npm audit --audit-level=high",
    "test:security": "npm run test:security:rls && npm run audit"
  }
}
```
2. Add `npm audit` to CI pipeline.
3. Enable GitHub Dependabot.

**Effort:** 30 minutes

---

### SEC-041: Fix Square Webhook Rate Limiting (Event Type, Not IP)

**Source:** Audit M2
**Severity:** Medium (reclassified)
**CWE:** CWE-770
**Location:** `src/app/api/webhooks/square/route.ts:44`
**Depends on:** SEC-008

**Implementation:**
```typescript
const eventType = event?.type || 'unknown'
const rl = rateLimit(`square-webhook:${eventType}`, 100, 60 * 1000)
```

**Effort:** 15 minutes

---

### SEC-042: Use UUID for Square Checkout Idempotency Key

**Source:** Audit M3
**Severity:** Medium
**CWE:** CWE-1023
**Location:** `src/app/api/square/checkout/route.ts:74`

**Implementation:**
```typescript
import { randomUUID } from 'node:crypto'
idempotencyKey: randomUUID()
```

**Effort:** 5 minutes

---

### Phase 4 Summary

| Task | Finding | Effort |
|------|---------|--------|
| SEC-021 | Harden getClientIp | 10m |
| SEC-022 | Crypto random filenames | 5m |
| SEC-023 | Restrict admin session GET | 15m |
| SEC-025 | Nonce-based CSP | 2h |
| SEC-026 | Sanitize error logging | 1h |
| SEC-027 | Remove dead RLS branch | 15m |
| SEC-028 | Remove key prefix from debug | 5m |
| SEC-029 | Body size limits | 1h |
| SEC-030 | Remove client-side admin flag | 5m |
| SEC-031 | Dependency scanning in CI | 30m |
| SEC-041 | Square webhook rate limit by event | 15m |
| SEC-042 | UUID idempotency key | 5m |
| **Total** | | **~5.5h** |

---

## Complete Effort Summary

| Phase | Findings | Effort |
|-------|----------|--------|
| Phase 0: Account Removal | 9 eliminated | ~5h |
| Phase 1: Critical | 4 fixed | ~6.5h |
| Phase 2: High | 8 fixed | ~11.5h |
| Phase 3: Medium | 8 fixed | ~8.5h |
| Phase 4: Low | 12 fixed | ~5.5h |
| **Total** | **41 findings resolved** | **~37h (~5.5 days)** |

---

## Dependency Graph

```
Phase 0 (Account Removal) ──┐
                             ├──► Phase 1 (Critical)
                             │    ├── SEC-001 (price validation) ──► SEC-002 (order persistence)
                             │    │                                   ──► SEC-003 (webhook reconciliation)
                             │    └── SEC-004 (Shippo webhook)
                             │
                             ├──► Phase 2 (High)
                             │    ├── SEC-008 (persistent rate limiter) ──► SEC-006, SEC-010, SEC-015, SEC-041
                             │    ├── SEC-005, SEC-007 (MFA hardening)
                             │    ├── SEC-009 (SVG sanitization)
                             │    ├── SEC-011 (admin session revocation)
                             │    └── SEC-012 (middleware)
                             │
                             ├──► Phase 3 (Medium)
                             │    └── SEC-014 (CSRF) — applies to all state-changing routes
                             │
                             └──► Phase 4 (Low)
```

---

## Verification & Testing

Each finding's acceptance criteria should be verified via:

1. **Manual testing** — curl commands or browser-based reproduction
2. **Automated tests** — add vitest test cases for security-critical paths
3. **RLS verification** — run `scripts/test-rls-lockdown.mjs` after DB migrations
4. **Build verification** — `npm run build` must succeed after each phase
5. **Dependency audit** — `npm audit --audit-level=high` must pass

---

## Appendix A — Implementation Plan Section 14.2 Remediation Tasks

The following gaps were identified during verification of `IMPLEMENTATION_PLAN.md` lines 1129–1251. They are tracked here as remediation tasks so that security, feature-completion, and audit-readiness can be verified together. Items marked 🔴 are pre-GA blockers; items marked 🟠 are required for the feature to match the plan; items marked 🟡 are polish/quality improvements.

### IMP-A01: Render Shop All Preview editor panel in admin homepage

**Source:** `IMPLEMENTATION_PLAN.md` Section 14.1.A.3, 14.2.A.17  
**Severity:** 🔴 High (dead code / admin cannot configure section)  
**Location:** `src/app/admin/(panel)/homepage/page.tsx`

**Current state:**  
`ShopAllPreviewState` interface, `handleSaveShopAllPreview()` handler, and state loading exist, but no input fields or Save button are rendered in the JSX return.

**Required fix:**  
Add a dedicated editor panel (similar to Hero Collage editor) with inputs for:
- `is_visible`
- `product_count` (number, clamp 1–50)
- `show_filters` (boolean)
- `heading` (string)
- `subheading` (string)

Wire inputs to `shopAllPreview` state and call `handleSaveShopAllPreview()`.

**Acceptance criteria:**
- [ ] Admin can edit all five fields for `shop_all_preview`
- [ ] Save persists via `/api/admin/homepage/sections/shop_all_preview`
- [ ] Success/error feedback is shown
- [ ] Build passes (`npm run build`)

**Effort:** 1 hour

---

### IMP-A02: Render Future Products Notify editor panel in admin homepage

**Source:** `IMPLEMENTATION_PLAN.md` Section 14.2  
**Severity:** 🟠 Medium (dead code / admin cannot configure CTA)  
**Location:** `src/app/admin/(panel)/homepage/page.tsx`

**Current state:**  
`FutureProductsNotify` state and `handleSaveFutureProductsNotify()` handler exist, but no editor UI is rendered.

**Required fix:**  
Add an editor panel with inputs for:
- `is_visible`
- `heading`
- `subheading`
- `cta_label`

Wire inputs to state and call `handleSaveFutureProductsNotify()`.

**Acceptance criteria:**
- [ ] Admin can edit all four fields for `future_products_notify`
- [ ] Save persists via `/api/admin/homepage/sections/future_products_notify`
- [ ] Build passes

**Effort:** 45 minutes

---

### IMP-A03: Create dedicated future-products query module

**Source:** `IMPLEMENTATION_PLAN.md` Section 14.2.A.14, 14.3.6  
**Severity:** 🟡 Low (code quality / DRY)  
**Location:** `src/lib/supabase/queries/future-products.ts` (missing)

**Current state:**  
Both `src/app/future-products/page.tsx` and `src/app/api/future-products/route.ts` inline their own `getFutureProducts()` query.

**Required fix:**  
Create `src/lib/supabase/queries/future-products.ts` exporting:
- `getFutureProducts()` with JOIN to `exp_future_product_statuses`
- `getFutureProductStatuses()`

Replace inline queries in the page and API route with imports from this module.

**Acceptance criteria:**
- [ ] New module exists and is used by both consumers
- [ ] No inline `from('exp_future_products')` queries remain in those files
- [ ] Tests still pass

**Effort:** 30 minutes

---

### IMP-A04: Implement rich-text sanitization for future-product descriptions

**Source:** `IMPLEMENTATION_PLAN.md` Section 14.2.A.11, 14.3.10  
**Severity:** 🟠 Medium (XSS / stored markup risk)  
**CWE:** CWE-79  
**Location:** `src/app/admin/(panel)/catalog/future-products/page.tsx`, `src/app/future-products/page.tsx`

**Current state:**  
- `sanitize-html`, `@tiptap/react`, `@tiptap/starter-kit` are not in `package.json`
- Admin page uses a plain `<TextField multiline>` for description
- Public page renders `description` as plain text (`{product.description}`)

**Required fix:**  
1. Add dependencies: `sanitize-html`, `@tiptap/react`, `@tiptap/starter-kit`
2. Store description as sanitized HTML (server-side) on create/update
3. Render sanitized HTML on the public page
4. Optionally add a Tiptap editor in admin

**Acceptance criteria:**
- [ ] `<script>` tags and event handlers are stripped from stored descriptions
- [ ] Public page uses `dangerouslySetInnerHTML` only with sanitized output
- [ ] Admin can input formatted text without injecting live scripts
- [ ] Build passes

**Effort:** 2–3 hours

---

### IMP-A05: Add PATCH/DELETE routes for future products and statuses

**Source:** `IMPLEMENTATION_PLAN.md` Section 14.2.A.10, 14.2.A.20, 14.3.11  
**Severity:** 🟠 Medium (admin cannot edit/delete)  
**Location:** `src/app/api/admin/catalog/future-products/[id]/route.ts` (missing), `src/app/api/admin/catalog/future-product-statuses/[id]/route.ts` (missing)

**Current state:**  
Only `GET` and `POST` exist for both resources.

**Required fix:**  
Create `[id]/route.ts` for both resources with:
- `PATCH` for updates
- `DELETE` for removal
- Admin auth + audit logging + input validation

**Acceptance criteria:**
- [ ] Admin can update a future product/status
- [ ] Admin can delete a future product/status
- [ ] Audit logs are written on success and failure
- [ ] Tests cover update and delete paths

**Effort:** 2 hours

---

### IMP-A06: Build tabbed admin UI for future products with edit/delete/reorder

**Source:** `IMPLEMENTATION_PLAN.md` Section 14.2.A.8, 14.3.12  
**Severity:** 🟠 Medium (feature incomplete)  
**Location:** `src/app/admin/(panel)/catalog/future-products/page.tsx`

**Current state:**  
Basic create/list page only. Status and category are raw text fields.

**Required fix:**  
Refactor admin page into tabs:
- Products (list with edit/delete, drag-to-reorder)
- Statuses (list with edit/delete, color picker)
- Responses (view/moderate notify submissions)

Use MUI dropdowns/autocomplete for status and category selection.

**Acceptance criteria:**
- [ ] Tabbed interface exists
- [ ] Products can be edited, deleted, and reordered
- [ ] Status dropdown uses fetched statuses
- [ ] Category dropdown uses fetched taxonomy categories
- [ ] Responses tab shows `exp_newsletter_subscribers` rows with `response_status = 'new'`

**Effort:** 4–6 hours

---

### IMP-A07: Add responses management API and UI

**Source:** `IMPLEMENTATION_PLAN.md` Section 14.2.A.19, 14.3.12  
**Severity:** 🟠 Medium (operational visibility)  
**Location:** `src/app/api/admin/catalog/future-products/responses/route.ts` (missing)

**Current state:**  
No API or UI for viewing/moderating notify form submissions.

**Required fix:**  
1. Create API route(s) to list and update `exp_newsletter_subscribers` rows filtered by `source` and `response_status`
2. Add Responses tab to admin future-products page
3. Allow marking responses as `viewed`, `responded`, `denied`

**Acceptance criteria:**
- [ ] Admin can list interest submissions
- [ ] Admin can update `response_status` and `denial_reason`
- [ ] Changes are audit-logged

**Effort:** 2–3 hours

---

### IMP-A08: Wire analytics events into HomepageProductGrid and FutureProductsNotifyCard

**Source:** `IMPLEMENTATION_PLAN.md` Section 14.2.A.9, 14.2.A.13, 14.3.13  
**Severity:** 🟡 Low (data quality / observability)  
**Location:** `src/components/home/HomepageProductGrid.tsx`, `src/components/home/FutureProductsNotifyCard.tsx`

**Current state:**  
`src/lib/analytics/events.ts` defines `futureProduct*` and `homepageProduct*` events, but neither component imports or calls `Analytics`.

**Required fix:**  
- `HomepageProductGrid`: call `Analytics.homepageProductFilterApplied(...)`, `Analytics.homepageProductViewAllClicked()`, `Analytics.homepageFutureProductsLinkClicked()`
- `FutureProductsNotifyCard`: call `Analytics.futureProductNotifyAttempted(source)` on submit attempt and `Analytics.futureProductNotifySubmitted()` on success

**Acceptance criteria:**
- [ ] All listed events fire from the correct user actions
- [ ] No PII is included in event payloads
- [ ] Tests verify event calls

**Effort:** 1 hour

---

### IMP-A09: Make FutureProductsNotifyCard respect storefront setting internally

**Source:** `IMPLEMENTATION_PLAN.md` Section 14.2.A.8, 14.3.8  
**Severity:** 🟡 Low (defense in depth)  
**Location:** `src/components/home/FutureProductsNotifyCard.tsx`

**Current state:**  
Parent `src/app/page.tsx` gates rendering with `notifySettings?.enabled !== false`, but the card component itself does not check the setting.

**Required fix:**  
Pass `enabled` prop or fetch `getFutureProductNotifySettings()` inside the component and return null if disabled.

**Acceptance criteria:**
- [ ] Component renders nothing when `future_products_notify_form.enabled` is false, even if called directly
- [ ] Parent page check remains as a redundant guard

**Effort:** 20 minutes

---

### IMP-A10: Create FutureProductsGrid component

**Source:** `IMPLEMENTATION_PLAN.md` Section 14.2.A.12, 3.5  
**Severity:** 🟡 Low (component structure)  
**Location:** `src/components/future-products/FutureProductsGrid.tsx` (missing)

**Current state:**  
Future products roadmap page inlines the grid rendering.

**Required fix:**  
Extract the roadmap item grid into `src/components/future-products/FutureProductsGrid.tsx` with optional status filtering.

**Acceptance criteria:**
- [ ] Component exists and is used by `/future-products/page.tsx`
- [ ] Supports status filtering if needed
- [ ] Build passes

**Effort:** 45 minutes

---

### IMP-A11: Correct File Inventory paths in IMPLEMENTATION_PLAN.md Section 12

**Source:** `IMPLEMENTATION_PLAN.md` Section 12, 14.3.16  
**Severity:** 🟡 Low (documentation accuracy)  
**Location:** `IMPLEMENTATION_PLAN.md` lines 1042–1047, 1052–1066

**Current state:**  
Inventory lists paths like `src/app/api/admin/future-products/...` but actual paths are under `src/app/api/admin/catalog/future-products/...`.

**Required fix:**  
Update Section 12 File Inventory to match actual `catalog/` subdirectory paths.

**Acceptance criteria:**
- [ ] All 15 new-file paths and 13 modified-file paths match the real repository layout
- [ ] Path discrepancy note in lines 1042–1046 is removed or updated

**Effort:** 15 minutes

---

### Appendix A Summary

| Task | Source | Severity | Effort |
|------|--------|----------|--------|
| IMP-A01 | Shop All Preview editor panel | 🔴 High | 1h |
| IMP-A02 | Future Products Notify editor panel | 🟠 Medium | 45m |
| IMP-A03 | Dedicated query module | 🟡 Low | 30m |
| IMP-A04 | Rich-text sanitization | 🟠 Medium | 2–3h |
| IMP-A05 | `[id]` CRUD routes | 🟠 Medium | 2h |
| IMP-A06 | Tabbed admin UI | 🟠 Medium | 4–6h |
| IMP-A07 | Responses management | 🟠 Medium | 2–3h |
| IMP-A08 | Wire analytics events | 🟡 Low | 1h |
| IMP-A09 | Component respects storefront setting | 🟡 Low | 20m |
| IMP-A10 | FutureProductsGrid component | 🟡 Low | 45m |
| IMP-A11 | Correct File Inventory | 🟡 Low | 15m |
| **Total** | | | **~14–17h** |

---

## Appendix B — Implementation Plan Section 13 / Product Designer Remaining Gaps

The following gaps were identified during verification of `IMPLEMENTATION_PLAN.md` lines 1197–1251 and Section 13 (Product Designer Addendum). They are tracked here as remediation tasks so that security, feature-completion, and audit-readiness can be verified together. Items marked 🔴 are pre-GA blockers; items marked 🟠 are required for the feature to match the plan; items marked 🟡 are polish/quality improvements.

### IMP-B01: Enforce per-product print templates in ProductDesigner

**Source:** `IMPLEMENTATION_PLAN.md` Section 13.3 #3, 13.8 #4, 14.2.B.1  
**Severity:** 🟠 Medium (print accuracy / feature completeness)  
**Location:** `src/components/shop/ProductConfigurator.tsx`, `src/components/shop/ProductDesigner.tsx`, product data model

**Current state:**  
`buildDesignDocument()` in `ProductConfigurator` hardcodes:
- `template_id: product:${productId}:default`
- `canvas.width_in` / `height_in` derived from fixed `DESIGN_STAGE_SIZE_PX`
- `bleed_in: 0`
- `safe_inset_in: 0`

There is no per-product print-template governance (dimensions, DPI, bleed, safe area) in the admin product builder or product data.

**Required fix:**
1. Add print-template fields to the product schema/admin UI (e.g., `designer_width_in`, `designer_height_in`, `designer_dpi`, `designer_bleed_in`, `designer_safe_inset_in`).
2. Update `buildDesignDocument()` to read these from `product` instead of hardcoded values.
3. Update `ProductDesigner` canvas/preview to match the template dimensions.
4. Optionally render bleed/safe-area guides in the designer.

**Acceptance criteria:**
- [ ] Products can define print-specific template dimensions
- [ ] `DesignDocumentV1` produced by the shop uses those values
- [ ] Exported PNG/PDF dimensions match the template at the chosen DPI
- [ ] Build passes (`npm run build`)

**Effort:** 4–6 hours

---

### IMP-B02: Implement token rebind/refresh UX for expired design assets

**Source:** `IMPLEMENTATION_PLAN.md` Section 13.8 #8, 13.13 #6, 14.2.B.2  
**Severity:** 🟠 Medium (UX / data recovery)  
**Location:** `src/components/shop/ProductDesigner.tsx`, `src/components/shop/ProductConfigurator.tsx`

**Current state:**  
Server-side `verifyDesignAssetOwnership()` rejects expired `upload_token` / `asset_path` pairs with `ASSET_UNAUTHORIZED`. If a customer returns to a design after upload tokens have expired, there is no UI path to re-upload the affected assets without losing the rest of the design.

**Required fix:**
1. When the designer loads or saves a design containing expired/unauthorized assets, surface a recoverable error.
2. Offer a "Replace asset" flow that re-uploads the file through `/api/custom-orders/upload`, receives a new `asset_path`/`uploadToken`, and updates the corresponding layer in the design.
3. Preserve non-image layers and positioning during rebind.

**Acceptance criteria:**
- [ ] Expired-token designs do not crash the designer
- [ ] User can re-upload each failed asset individually
- [ ] Rebound design can be added to cart and exported successfully
- [ ] Test covers the recovery flow

**Effort:** 3–4 hours

---

### IMP-B03: Add Product Designer integration and abuse tests

**Source:** `IMPLEMENTATION_PLAN.md` Section 13.13, 14.2.B.3  
**Severity:** 🟡 Low (test coverage / quality)  
**Location:** `src/lib/design/schema.test.ts`, `src/lib/design/persistence.test.ts`, `src/lib/design/export-renderer.test.ts`, `src/app/api/designs/export/route.test.ts`

**Current state:**  
Unit tests exist for schema parsing, persistence, export rendering, and the export API. The Implementation Plan calls for additional integration/security/abuse tests:
- Design survives close/reopen and page refresh
- Cart/checkout payload includes design reference/snapshot
- Order persistence retains immutable design snapshot
- Designer cannot call admin upload route
- Mismatched `asset_path`/`upload_token` is rejected
- Expired upload tokens trigger recoverable rebind flow
- PNG/PDF dimensions match template inches at target DPI
- Oversized/layer-heavy documents fail with expected error codes

**Required fix:**  
Add the missing integration and abuse tests. Where a test requires UI interaction (close/reopen, rebind), use component tests or e2e; for API-level behavior, add vitest cases.

**Acceptance criteria:**
- [ ] Integration tests cover cart propagation and order snapshot
- [ ] Security tests verify admin-upload isolation and asset-pair rejection
- [ ] Abuse tests verify layer/size/output/render-time limits
- [ ] Dimension accuracy test verifies `width_in * dpi` and `height_in * dpi`

**Effort:** 4–6 hours

---

### IMP-B04: Maintain 3D renderer deferral behind feature boundary

**Source:** `IMPLEMENTATION_PLAN.md` Section 13.1 #6, 13.7 #6, 13.12, 14.2.B.4  
**Severity:** 🟡 Low (architecture / release gate)  
**Location:** `src/lib/design/renderer.ts`, `src/lib/design/schema.ts`

**Current state:**  
`Renderer3DDisabledAdapter` throws on any use. `DesignDocumentV1` has no 3D-specific fields. The boundary contract is in place.

**Required fix:**  
Ensure the v1 release does not enable interactive 3D:
1. Keep `Renderer3DDisabledAdapter` as the default 3D adapter.
2. Add a feature flag (storefront setting or env var) that explicitly gates 3D; default to disabled.
3. Reject 3D schema versions (`2.x`) in `parseDesignDocument`.
4. Document that 3D remains out of scope until dedicated validation is complete.

**Acceptance criteria:**
- [ ] No production path can invoke 3D rendering without an explicit flag
- [ ] `parseDesignDocument` rejects `schema_version !== '1.0'`
- [ ] Tests verify 3D adapter throws / is gated

**Effort:** 1–2 hours

---

### Appendix B Summary

| Task | Source | Severity | Effort |
|------|--------|----------|--------|
| IMP-B01 | Per-product print templates | 🟠 Medium | 4–6h |
| IMP-B02 | Token rebind UX | 🟠 Medium | 3–4h |
| IMP-B03 | Integration/abuse tests | 🟡 Low | 4–6h |
| IMP-B04 | 3D deferral boundary | 🟡 Low | 1–2h |
| **Total** | | | **~12–18h** |

---

*This plan is the execution companion to `docs/SECURITY_SPECIFICATION.md`, which contains the formal security controls, requirements, and compliance mapping.*