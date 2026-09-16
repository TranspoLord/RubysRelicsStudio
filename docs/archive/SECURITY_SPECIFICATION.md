# Security Specification — Ruby's Relics Studio

**Project:** Ruby's Relics Studio
**Created:** 2026-07-19
**Companion document:** `docs/SECURITY_REMEDIATION_PLAN.md` (phased execution plan)
**Source audits:** `docs/SECURITY_AUDIT.md`, `docs/SECURITY_AUDIT_REPORT.md`
**Status:** Specification — governs all security implementation work

---

## 1. Purpose & Scope

This document is the authoritative security specification for Ruby's Relics Studio. It defines:

1. **Finding Registry** — every verified security finding with stable IDs, severity, CWE, and status
2. **Security Controls** — the controls the system must implement and maintain
3. **Requirements** — testable requirements for each control
4. **Acceptance Criteria** — how compliance is verified
5. **Architecture Requirements** — structural security invariants

**Engagement goal:** Prevent an external basic-website user from exploiting anything, getting free product, or downloading proprietary or user data that isn't their own.

**Architecture context:** Next.js 16 + Supabase + Square Payments + Shippo shipping + Resend email. Deployed on Vercel serverless. No customer accounts (removed per architectural decision — see §6).

---

## 2. Finding Registry

### 2.1 Registry Schema

Each finding uses this fixed field set:

| Field | Description |
|-------|-------------|
| ID | Stable identifier (SEC-NNN) |
| Severity | critical \| high \| medium \| low |
| Title | One-line summary |
| CWE | MITRE CWE reference(s) |
| Reachable By | Who can exploit this |
| Location | Verified file:line(s) |
| Status | active \| resolved \| moot |
| Source IDs | Cross-reference to original audit reports |

### 2.2 Active Findings

#### SEC-001 — Arbitrary-Price Checkout

| Field | Value |
|-------|-------|
| ID | SEC-001 |
| Severity | critical |
| Title | Server-side price validation missing in Square checkout |
| CWE | CWE-472, CWE-345 |
| Reachable By | unauthenticated |
| Location | `src/app/api/square/checkout/route.ts:43-52` |
| Status | active |
| Source IDs | Report C1, Audit H2 |
| Impact | Direct revenue loss; attacker buys any product for any amount |
| Depends on | SEC-002 |

**Description:** The checkout endpoint accepts `unitPrice` from the client request body and passes it directly to Square as `base_price_money.amount`. The server never queries the database for the canonical price.

**Requirement:** The server MUST compute all prices using `computeCanonicalLine()` from `src/lib/pricing/engine.ts`. The client MUST NOT be able to influence the price charged.

---

#### SEC-002 — Orders Not Persisted to Database

| Field | Value |
|-------|-------|
| ID | SEC-002 |
| Severity | critical |
| Title | No exp_orders row created at checkout time |
| CWE | CWE-345 |
| Reachable By | n/a (architectural gap) |
| Location | `src/app/api/square/checkout/route.ts` (missing insert) |
| Status | active |
| Source IDs | Discovered during audit verification |
| Impact | No amount reconciliation possible; webhook updates non-existent rows |

**Description:** The checkout route creates a Square payment link but never inserts a row into `exp_orders`. The webhook later tries to update a row by `square_order_id` that doesn't exist. There is no stored `order_total` to reconcile against the payment.

**Requirement:** Every checkout MUST create an `exp_orders` row with `payment_status: 'pending'`, `order_total` (server-computed), `square_order_id`, `customer_email`, and a `guest_tracking_token`.

---

#### SEC-003 — Square Webhook Signature & Integrity

| Field | Value |
|-------|-------|
| ID | SEC-003 |
| Severity | critical |
| Title | Square webhook signature scheme incorrect + no replay/amount reconciliation |
| CWE | CWE-347 |
| Reachable By | unauthenticated |
| Location | `src/app/api/webhooks/square/route.ts:9-24` |
| Status | active |
| Source IDs | Report C3 |
| Impact | Forged payment notifications; free orders if combined with SEC-001 |
| Depends on | SEC-002 |

**Description:** The verifier computes `HMAC_SHA256(body, key).hex()`, but Square's actual signature scheme incorporates the notification URL and uses base64. No replay protection (no event ID dedup). No amount reconciliation against `order_total`.

**Requirements:**
1. Signature MUST be verified using Square's official `WebhooksHelper.verifySignature`
2. Duplicate `event.id` within 24h MUST be rejected
3. Payment amount MUST be reconciled against stored `order_total` before marking paid

---

#### SEC-004 — Shippo Webhook Fail-Open

| Field | Value |
|-------|-------|
| ID | SEC-004 |
| Severity | critical |
| Title | Shippo webhook signature verification is optional |
| CWE | CWE-1188, CWE-347 |
| Reachable By | unauthenticated |
| Location | `src/app/api/shippo/webhook/route.ts:32-45` |
| Status | active |
| Source IDs | Report C4, Audit H1 |
| Impact | Forged shipping status; fraudulent delivery emails |

**Description:** Verification is guarded by `if (webhookSecret && signature)`. If the env var is unset or the header is absent, processing continues without verification. Comparison uses `!==` (not timing-safe).

**Requirements:**
1. Missing `SHIPPO_WEBHOOK_SECRET` → 500, no processing
2. Missing signature header → 401, no processing
3. Comparison MUST use `crypto.timingSafeEqual`
4. No code path reaches payload processing without verified signature

---

#### SEC-005 — MFA Uses Non-Cryptographic Random

| Field | Value |
|-------|-------|
| ID | SEC-005 |
| Severity | high |
| Title | MFA codes generated with Math.random() |
| CWE | CWE-338 |
| Reachable By | requires-stolen-cookie |
| Location | `src/lib/admin/mfa-store.ts:59` |
| Status | active |
| Source IDs | Report H1 |
| Impact | Predictable MFA codes; brute-force feasible |

**Requirement:** MFA codes MUST be generated using `crypto.randomInt(100000, 1000000)`. `Math.random()` MUST NOT be used for any security-critical value.

---

#### SEC-006 — No Rate Limit on MFA Verification

| Field | Value |
|-------|-------|
| ID | SEC-006 |
| Severity | high |
| Title | verify-mfa endpoint has no rate limiting |
| CWE | CWE-307 |
| Reachable By | requires-stolen-cookie |
| Location | `src/app/api/admin/verify-mfa/route.ts:8` |
| Status | active |
| Source IDs | Report H3, Audit C3 |
| Impact | Unlimited MFA brute-force attempts |
| Depends on | SEC-008 |

**Requirements:**
1. verify-mfa MUST be rate-limited to 5 attempts per 5 minutes per challenge token
2. After 5 failures, the challenge token MUST be invalidated
3. Rate limit MUST be keyed by challenge token, not IP

---

#### SEC-007 — MFA In-Memory Fallback

| Field | Value |
|-------|-------|
| ID | SEC-007 |
| Severity | high |
| Title | MFA memory-store fallback creates consistency holes |
| CWE | CWE-1004 (conceptual) |
| Reachable By | requires-stolen-cookie |
| Location | `src/lib/admin/mfa-store.ts:30, 114-117` |
| Status | active |
| Source IDs | Report H4 |
| Impact | Per-instance state divergence; audit trail bypass |

**Requirement:** MFA MUST fail closed if Supabase is unavailable. No in-memory fallback Map is permitted. The table is `admin_mfa_codes` (not `exp_admin_mfa_codes`).

---

#### SEC-008 — In-Memory Rate Limiter

| Field | Value |
|-------|-------|
| ID | SEC-008 |
| Severity | high |
| Title | Rate limiter is per-instance, in-memory only |
| CWE | CWE-770 |
| Reachable By | unauthenticated |
| Location | `src/lib/rate-limit.ts:20` |
| Status | active |
| Source IDs | Report H6, Audit C2 |
| Impact | All rate-limit-based defenses bypassable across serverless instances |

**Requirement:** Rate limit state MUST persist across serverless cold starts using a Supabase-backed counter table (`exp_rate_limit_windows`) with an atomic `INSERT ... ON CONFLICT DO UPDATE` RPC. Latency overhead MUST be < 50ms per request.

---

#### SEC-009 — SVG Upload XSS

| Field | Value |
|-------|-------|
| ID | SEC-009 |
| Severity | high |
| Title | SVG upload sanitization incomplete |
| CWE | CWE-79 |
| Reachable By | requires-stolen-cookie (admin) → customer XSS |
| Location | `src/app/api/admin/catalog/media/upload/route.ts:65` |
| Status | active |
| Source IDs | Report H7 |
| Impact | Persistent customer-side JavaScript execution under site origin |

**Description:** Sanitizer only checks for `<script` and `javascript:`. Misses `onerror=`, `onload=`, `<foreignObject>`, `<use href=...>`, event-handler attributes, `data:text/html` payloads.

**Requirement:** All SVG uploads MUST be sanitized through DOMPurify server-side with the SVG profile. Files land in the PUBLIC `product-media` bucket, so sanitization is mandatory.

---

#### SEC-010 — Shippo API Routes Unrate-Limited

| Field | Value |
|-------|-------|
| ID | SEC-010 |
| Severity | high |
| Title | /api/shippo/rates and /api/shippo/validate-address have no rate limit |
| CWE | CWE-770 |
| Reachable By | unauthenticated |
| Location | `src/app/api/shippo/rates/route.ts`, `src/app/api/shippo/validate-address/route.ts` |
| Status | active |
| Source IDs | Report H8 |
| Impact | Shippo API bill inflation; potential API suspension |
| Depends on | SEC-008 |

**Requirement:** Both endpoints MUST be rate-limited to 20 requests/minute per IP.

---

#### SEC-011 — Admin Session Not Revocable

| Field | Value |
|-------|-------|
| ID | SEC-011 |
| Severity | high |
| Title | Admin session token cannot be revoked per-session |
| CWE | CWE-613 |
| Reachable By | requires-stolen-cookie |
| Location | `src/lib/admin/session.ts:13-18` |
| Status | active |
| Source IDs | Report H9 |
| Impact | Stolen admin cookie cannot be invalidated without rotating ADMIN_LOGIN_KEY |

**Description:** Token format is `v1.{exp}.HMAC(adminKey)` — no JTI, no per-session DB record.

**Requirement:** Admin sessions MUST use a JTI (UUID) embedded in the token, with a corresponding `exp_admin_sessions` DB row containing `token_hash`, `ip_address`, `user_agent`, `created_at`, `expires_at`, `revoked_at`. Verification MUST check `revoked_at IS NULL`. Admins MUST be able to revoke individual sessions.

---

#### SEC-012 — No Auth Middleware

| Field | Value |
|-------|-------|
| ID | SEC-012 |
| Severity | high |
| Title | No middleware.ts — admin auth relies on per-route memory |
| CWE | CWE-306 |
| Reachable By | unauthenticated (when a new route forgets) |
| Location | `src/middleware.ts` (does not exist) |
| Status | active |
| Source IDs | Report H10 |
| Impact | New admin routes that forget requireAdminApiSession() expose admin functionality |

**Requirement:** `src/middleware.ts` MUST block all `/admin/*` and `/api/admin/*` routes (except `/admin/login` and `/api/admin/session`) unless a valid `rr_admin_session` cookie is present. Per-route checks remain as defense-in-depth.

---

#### SEC-013 — Search Filter-Syntax Injection

| Field | Value |
|-------|-------|
| ID | SEC-013 |
| Severity | medium |
| Title | Search query interpolated into PostgREST or filter string |
| CWE | CWE-20, CWE-943 |
| Reachable By | unauthenticated |
| Location | `src/app/api/search/route.ts:55-63` |
| Status | active |
| Source IDs | Report M1 |
| Impact | Filter-syntax injection; product-ID existence probing |

**Requirement:** `sanitizeSearchQuery` MUST strip `,`, `.`, `(`, `)` in addition to current characters, OR use Supabase's typed filter object form.

---

#### SEC-014 — No CSRF Protection

| Field | Value |
|-------|-------|
| ID | SEC-014 |
| Severity | medium |
| Title | No CSRF tokens on any state-changing route |
| CWE | CWE-352 |
| Reachable By | unauthenticated (via CSRF) |
| Location | All POST/PATCH/DELETE API routes |
| Status | active |
| Source IDs | Audit M1, Report M2 |
| Impact | Cross-site request forgery on state-changing operations |

**Requirement:** All state-changing API routes MUST implement BOTH:
1. **Origin/Referer header validation** — reject if Origin doesn't match `NEXT_PUBLIC_APP_URL`
2. **Double-submit cookie** — random CSRF token in non-httpOnly cookie, matched against `X-CSRF-Token` header

---

#### SEC-015 — Cart-Capture Spam

| Field | Value |
|-------|-------|
| ID | SEC-015 |
| Severity | medium |
| Title | Cart-capture endpoint accepts unbounded email spam |
| CWE | CWE-770 |
| Reachable By | unauthenticated |
| Location | `src/app/api/cart/capture/route.ts` |
| Status | active |
| Source IDs | Report M3 |
| Impact | DB pollution with fake-email rows; GDPR cleanup burden |
| Depends on | SEC-008 |

**Requirement:** Cart-capture MUST be rate-limited to 10 requests/hour per IP.

---

#### SEC-016 — Newsletter Re-Subscribe Bypass

| Field | Value |
|-------|-------|
| ID | SEC-016 |
| Severity | medium |
| Title | Newsletter re-subscribe bypasses unsubscribe |
| CWE | CWE-927 |
| Reachable By | unauthenticated |
| Location | `src/app/api/newsletter/subscribe/route.ts:42-57` |
| Status | active |
| Source IDs | Report M4 |
| Impact | Victim can be repeatedly resubscribed after opting out |

**Requirement:** If a row exists with `unsubscribed_at` set within the last 30 days, the system MUST NOT auto-resubscribe. A confirmation email MUST be sent instead.

---

#### SEC-017 — HTML Email Injection

| Field | Value |
|-------|-------|
| ID | SEC-017 |
| Severity | medium |
| Title | HTML email injection in custom-order notifications |
| CWE | CWE-79 |
| Reachable By | unauthenticated (admin-bound), authenticated-admin (customer-bound) |
| Location | `src/app/api/custom-orders/route.ts:152-160`, `src/app/api/custom-orders/[id]/route.ts:55-67` |
| Status | active |
| Source IDs | Report M5 |
| Impact | Email layout disruption, tracking pixels, phishing setup |

**Requirement:** All customer-supplied values interpolated into HTML email bodies MUST be escaped using `safeHtmlEscape` from `src/lib/validate.ts`.

---

#### SEC-018 — Artwork Ownership Not Verified

| Field | Value |
|-------|-------|
| ID | SEC-018 |
| Severity | medium |
| Title | Custom-order intake doesn't verify artwork ownership |
| CWE | CWE-639 |
| Reachable By | unauthenticated |
| Location | `src/app/api/custom-orders/route.ts:80-82` |
| Status | active |
| Source IDs | Report M6 |
| Impact | Cross-customer artwork path referencing |

**Requirement:** Upload MUST create a token↔path binding. Intake MUST verify the binding before accepting the order. Token MUST be per-session and non-reusable.

---

#### SEC-019 — Inconsistent Secure Flag

| Field | Value |
|-------|-------|
| ID | SEC-019 |
| Severity | medium |
| Title | verify-mfa secure flag uses wrong env var |
| CWE | CWE-614 |
| Reachable By | MITM with env-var mismatch |
| Location | `src/app/api/admin/verify-mfa/route.ts:34` |
| Status | active |
| Source IDs | Report M7 |
| Impact | Cookie could be set without Secure if env vars diverge |

**Requirement:** All cookie `secure` flags MUST use a shared `isProd()` helper returning `process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production'`. No route MAY use `NEXT_PUBLIC_APP_ENV` for this purpose.

---

#### SEC-020 — Inconsistent SameSite

| Field | Value |
|-------|-------|
| ID | SEC-020 |
| Severity | medium |
| Title | Admin session cookie uses sameSite: 'lax' |
| CWE | CWE-1004 |
| Reachable By | CSRF preconditions |
| Location | `src/app/api/admin/session/route.ts:61` |
| Status | active |
| Source IDs | Report M10, Audit H3 |
| Impact | Admin session cookie sent on top-level cross-site navigations |

**Requirement:** All admin cookies MUST use `sameSite: 'strict'`.

---

#### SEC-021 — getClientIp Trusts X-Forwarded-For

| Field | Value |
|-------|-------|
| ID | SEC-021 |
| Severity | low |
| Title | getClientIp trusts X-Forwarded-For blindly |
| CWE | CWE-441 |
| Reachable By | n/a (defense in depth) |
| Location | `src/lib/rate-limit.ts:90-112` |
| Status | active |
| Source IDs | Report L1 |
| Impact | IP spoofing if run behind non-Vercel proxy |

**Requirement:** `getClientIp` MUST only trust `X-Forwarded-For` when `process.env.VERCEL` is set. Otherwise, return `'unknown'`.

---

#### SEC-022 — Math.random for Filenames

| Field | Value |
|-------|-------|
| ID | SEC-022 |
| Severity | low |
| Title | Admin media upload filename uses Math.random() |
| CWE | CWE-338 |
| Reachable By | n/a |
| Location | `src/app/api/admin/catalog/media/upload/route.ts:76` |
| Status | active |
| Source IDs | Report L2 |
| Impact | Filename collision risk |

**Requirement:** Filenames MUST use `crypto.randomBytes(8).toString('hex')` for uniqueness.

---

#### SEC-023 — Admin Session GET Leaks Validity

| Field | Value |
|-------|-------|
| ID | SEC-023 |
| Severity | low |
| Title | /api/admin/session GET leaks admin cookie validity |
| CWE | CWE-200 |
| Reachable By | unauthenticated |
| Location | `src/app/api/admin/session/route.ts:20-32` |
| Status | active |
| Source IDs | Report L3 |
| Impact | Enables targeted phishing |

**Requirement:** The GET endpoint MUST require same-origin check or CSRF token.

---

#### SEC-025 — CSP Allows unsafe-eval/unsafe-inline

| Field | Value |
|-------|-------|
| ID | SEC-025 |
| Severity | low |
| Title | CSP allows 'unsafe-eval' and 'unsafe-inline' for scripts |
| CWE | CWE-79 |
| Reachable By | amplifies SEC-009 |
| Location | `next.config.ts:5` |
| Status | active |
| Source IDs | Report L5, Audit L1 |
| Impact | Inline-script XSS payloads execute |

**Requirement:** CSP MUST use a nonce-based policy for `script-src`. `'unsafe-eval'` and `'unsafe-inline'` MUST NOT appear in `script-src`. `'unsafe-inline'` MAY remain for `style-src` (Next.js App Router requires it).

---

#### SEC-026 — Verbose Error Logging

| Field | Value |
|-------|-------|
| ID | SEC-026 |
| Severity | low |
| Title | Verbose error logging may leak env values |
| CWE | CWE-532 |
| Reachable By | n/a (log access) |
| Location | Throughout API routes |
| Status | active |
| Source IDs | Report L6 |
| Impact | Env values / connection strings leaked to Vercel logs |

**Requirement:** All `console.error` calls in API routes MUST use a sanitizing logger that strips known-sensitive patterns (connection strings, API keys, JWTs).

---

#### SEC-027 — Dead RLS JWT Claim Branch

| Field | Value |
|-------|-------|
| ID | SEC-027 |
| Severity | low |
| Title | RLS policy references non-existent JWT claim |
| CWE | CWE-285 |
| Reachable By | n/a |
| Location | `supabase/migrations/039_rls_lockdown.sql:20` |
| Status | active |
| Source IDs | Report L7 |
| Impact | Dead code; indicates confusion about auth model |

**Requirement:** Remove the `OR current_setting('request.jwt.claim.session_token', true) = ...` branch. Document that all customer reads go through the service role via API routes.

---

#### SEC-028 — MFA Debug Exposes Key Prefix

| Field | Value |
|-------|-------|
| ID | SEC-028 |
| Severity | low |
| Title | MFA debug endpoint exposes service role key prefix |
| CWE | CWE-200 |
| Reachable By | authenticated-admin |
| Location | `src/app/api/admin/mfa-debug/route.ts:39` |
| Status | active |
| Source IDs | Audit M4 |
| Impact | Information disclosure; reduces brute-force search space |

**Requirement:** The endpoint MUST only expose `hasServiceRoleKey: boolean`, never any substring of the key.

---

#### SEC-029 — No Body Size Limits

| Field | Value |
|-------|-------|
| ID | SEC-029 |
| Severity | low |
| Title | No request body size limits on API routes |
| CWE | CWE-770 |
| Reachable By | unauthenticated |
| Location | Multiple API routes |
| Status | active |
| Source IDs | Audit M5 |
| Impact | Denial of service via memory exhaustion |

**Requirement:** All API routes MUST use `parseJsonBody()` with a 100KB max size. Requests exceeding this MUST receive a 413 response.

---

#### SEC-030 — Client-Side Admin Auth Flag

| Field | Value |
|-------|-------|
| ID | SEC-030 |
| Severity | low |
| Title | Client-side admin_authenticated flag in sessionStorage |
| CWE | CWE-602 |
| Reachable By | n/a (security theater) |
| Location | `src/app/admin/login/page.tsx:42` |
| Status | active |
| Source IDs | Audit M6 |
| Impact | Could mislead developers into thinking it provides auth |

**Requirement:** The `sessionStorage.setItem('admin_authenticated', 'true')` line MUST be removed. Server-side session verification is the only auth check.

---

#### SEC-031 — No Dependency Scanning

| Field | Value |
|-------|-------|
| ID | SEC-031 |
| Severity | low |
| Title | No automated dependency vulnerability scanning |
| CWE | CWE-1104 |
| Reachable By | n/a |
| Location | `package.json`, CI config |
| Status | active |
| Source IDs | Audit L2 |
| Impact | Known CVEs in dependencies could be exploited |

**Requirement:** CI MUST run `npm audit --audit-level=high`. GitHub Dependabot MUST be enabled.

---

#### SEC-041 — Square Webhook Rate Limit by IP

| Field | Value |
|-------|-------|
| ID | SEC-041 |
| Severity | medium |
| Title | Square webhook rate-limited by IP (should be event type) |
| CWE | CWE-770 |
| Reachable By | n/a (availability) |
| Location | `src/app/api/webhooks/square/route.ts:44` |
| Status | active |
| Source IDs | Audit M2 |
| Impact | Legitimate webhooks could be dropped |
| Depends on | SEC-008 |

**Requirement:** Rate limit MUST be keyed by event type, not source IP. Limit: 100/minute per event type.

---

#### SEC-042 — Non-Unique Idempotency Key

| Field | Value |
|-------|-------|
| ID | SEC-042 |
| Severity | medium |
| Title | Square checkout idempotency key uses Date.now() |
| CWE | CWE-1023 |
| Reachable By | n/a (integrity) |
| Location | `src/app/api/square/checkout/route.ts:74` |
| Status | active |
| Source IDs | Audit M3 |
| Impact | Duplicate payment links for same order |

**Requirement:** Idempotency key MUST be a `crypto.randomUUID()`.

---

### 2.3 Resolved Findings

#### SEC-032 — MFA Keyed by IP Only

| Field | Value |
|-------|-------|
| ID | SEC-032 |
| Severity | — |
| Title | MFA keyed by IP only, not admin identity |
| Status | **resolved** |
| Source IDs | Report H2 |
| Resolution | Code refactored to use cryptographically random `challengeToken` (UUID) stored in httpOnly cookie. Verified in `src/lib/admin/mfa-store.ts` — header comment documents this change. |

---

### 2.4 Moot Findings (Eliminated by Account Removal)

| ID | Title | Source IDs | Eliminated By |
|----|-------|-----------|---------------|
| SEC-033 | Forgot-password token leak | Report C2 | Phase 0.2 (delete forgot-password route) |
| SEC-034 | Legacy hash timing attack | Report H5, Audit C1 | Phase 0.4 (delete customer auth lib) |
| SEC-035 | Password reset token in URL | Audit H4 | Phase 0.2 (delete reset-password route) |
| SEC-036 | Non-transactional reset token | Report M8 | Phase 0.2 (delete reset-password route) |
| SEC-037 | Long-lived customer session | Report M9 | Phase 0.2 (delete login route) |
| SEC-038 | Customer cookie sameSite | Audit L3 | Phase 0 (no customer cookies) |
| SEC-039 | Account lockout | Audit L4 | Phase 0 (no accounts) |
| SEC-040 | Logout CSRF | Report M2 | Phase 0.2 (delete logout route) |
| SEC-024 | Recently-viewed accepts any product ID | Report L4 | Phase 0.7 (API removed, localStorage only) |

---

## 3. Security Controls Catalog

### 3.1 Control: Server-Side Price Computation

**ID:** CTRL-PRICING
**Findings:** SEC-001, SEC-002, SEC-042
**Requirement:** All prices charged to customers MUST be computed server-side using `computeCanonicalLine()`. The client MUST NOT supply prices. Every checkout MUST persist an `exp_orders` row with the server-computed `order_total` before redirecting to Square.

**Test cases:**
1. POST `/api/square/checkout` with `unitPrice: 0.01` → checkout URL reflects DB price, not $0.01
2. Complete checkout → `exp_orders` row exists with `payment_status: 'pending'` and correct `order_total`
3. Two concurrent checkouts → different idempotency keys (UUIDs)

---

### 3.2 Control: Webhook Signature Verification

**ID:** CTRL-WEBHOOK
**Findings:** SEC-003, SEC-004
**Requirement:** All webhooks (Square, Shippo) MUST verify signatures fail-closed. Missing secret or signature → reject. Comparison MUST be timing-safe. Square MUST use official `WebhooksHelper`. Shippo MUST use `crypto.timingSafeEqual`.

**Test cases:**
1. POST to Shippo webhook with no `SHIPPO_WEBHOOK_SECRET` env var → 500
2. POST to Shippo webhook with no signature header → 401
3. POST to Shippo webhook with invalid signature → 401
4. POST to Square webhook with replayed `event.id` → 200 but no reprocessing
5. POST to Square webhook with payment amount ≠ `order_total` → order not marked paid

---

### 3.3 Control: Persistent Rate Limiting

**ID:** CTRL-RATELIMIT
**Findings:** SEC-008, SEC-006, SEC-010, SEC-015, SEC-041
**Requirement:** Rate limiting MUST use a Supabase-backed persistent store (`exp_rate_limit_windows`). State MUST survive serverless cold starts. The `rateLimit()` function MUST be async.

**Test cases:**
1. Send 6 login attempts from different Vercel instances → 6th is blocked
2. Cold start between requests → counter persists
3. Rate limit response includes `Retry-After` header

---

### 3.4 Control: MFA Hardening

**ID:** CTRL-MFA
**Findings:** SEC-005, SEC-006, SEC-007
**Requirement:** MFA codes MUST use `crypto.randomInt()`. MFA state MUST be Supabase-only (no in-memory fallback). verify-mfa MUST be rate-limited per challenge token (5/5min) with token invalidation after 5 failures.

**Test cases:**
1. Generate 1000 MFA codes → no predictable pattern (chi-square test)
2. Kill Supabase connection during createMFACode → error returned, no memory fallback
3. 6th verify-mfa attempt within 5 min → 429 + challenge token invalidated

---

### 3.5 Control: Admin Session Management

**ID:** CTRL-ADMIN-SESSION
**Findings:** SEC-011, SEC-012, SEC-020, SEC-023
**Requirement:** Admin sessions MUST use JTI + `exp_admin_sessions` table. `src/middleware.ts` MUST enforce auth on all `/admin/*` and `/api/admin/*` routes. Admin cookies MUST use `sameSite: 'strict'`. Session GET endpoint MUST require same-origin.

**Test cases:**
1. Unauthenticated GET `/api/admin/catalog` → 401
2. Revoke session in DB → subsequent requests with that token → 401
3. Admin cookie has `SameSite=Strict` in Set-Cookie header
4. Cross-origin GET `/api/admin/session` → 403

---

### 3.6 Control: CSRF Protection

**ID:** CTRL-CSRF
**Findings:** SEC-014
**Requirement:** All state-changing API routes MUST validate Origin/Referer headers AND require a double-submit CSRF token. Webhooks are exempt (they use signature verification instead).

**Test cases:**
1. Cross-origin POST with no Origin header → 403
2. Cross-origin POST with spoofed Origin → 403
3. Same-origin POST with valid CSRF token → succeeds
4. Same-origin POST without CSRF header → 403

---

### 3.7 Control: Input Validation & Sanitization

**ID:** CTRL-INPUT
**Findings:** SEC-009, SEC-013, SEC-017, SEC-029
**Requirement:** SVG uploads MUST be sanitized via DOMPurify. Search queries MUST strip PostgREST filter syntax. Email bodies MUST escape customer input. Request bodies MUST be limited to 100KB.

**Test cases:**
1. Upload SVG with `<svg onload="alert(1)">` → handler stripped
2. Search query `a,id.eq.<uuid>` → treated as literal search term
3. Custom order with `<img src=x onerror=alert(1)>` in name → escaped in email
4. POST with 200KB body → 413

---

### 3.8 Control: Security Headers

**ID:** CTRL-HEADERS
**Findings:** SEC-025
**Requirement:** CSP MUST be nonce-based for `script-src`. HSTS, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin MUST be set globally.

**Test cases:**
1. `curl -I https://yoursite/` → all security headers present
2. CSP `script-src` does not contain `'unsafe-eval'` or `'unsafe-inline'`
3. Page renders without CSP violations in browser console

---

### 3.9 Control: Dependency Security

**ID:** CTRL-DEPS
**Findings:** SEC-031
**Requirement:** CI MUST run `npm audit --audit-level=high`. Dependabot MUST be enabled.

**Test cases:**
1. `npm run audit` exits 0 when no high-severity vulnerabilities
2. Dependabot PRs are created for vulnerable dependencies

---

### 3.10 Control: Secure Logging

**ID:** CTRL-LOGGING
**Findings:** SEC-026
**Requirement:** All `console.error` calls in API routes MUST use `safeLogError()` which strips sensitive patterns.

**Test cases:**
1. Error containing `postgres://user:pass@host` → logged as `postgres://[REDACTED]`
2. Error containing `sk_live_abc123` → logged as `[REDACTED]`

---

## 4. Architecture Requirements

### 4.1 No Customer Accounts

The system MUST NOT maintain customer accounts, passwords, or sessions. Authentication is exclusively for admin users. Customer-facing features (newsletter, back-in-stock, cart capture, custom orders, order tracking) operate by email + guest tokens only.

**Tables that MUST NOT exist:** `exp_customers`, `exp_customer_sessions`, `exp_password_reset_tokens`, `exp_customer_addresses`, `exp_wishlists`, `exp_recently_viewed`

**Tables that MAY have nullable/dropped `customer_id`:** `exp_orders`, `exp_custom_requests`, `exp_newsletter_subscribers`, `exp_back_in_stock_alerts`, `exp_capacity_reopen_alerts`

### 4.2 Server-Side Price Authority

The client MUST NOT be trusted with prices. The request body for `/api/square/checkout` MUST contain only `{ productId, variantId, selectedOptions, quantity }`. The server MUST fetch product data, run `computeCanonicalLine()`, and use the result as the Square `base_price_money.amount`.

### 4.3 Order Lifecycle

```
Checkout request
  → Server computes prices (computeCanonicalLine)
  → Server creates Square payment link
  → Server inserts exp_orders row (status: 'checkout_created', payment_status: 'pending')
  → Server returns checkoutUrl + guest_tracking_token to client
  → Client redirects to Square
  → Square payment completes
  → Square webhook fires
  → Server verifies signature (WebhooksHelper)
  → Server checks event.id dedup
  → Server reconciles payment.amount == order_total
  → Server marks order 'paid' + 'in_production'
```

### 4.4 Webhook Verification Invariant

No webhook payload processing MAY occur before signature verification succeeds. There MUST be no code path that falls through to processing without verification. This is a fail-closed invariant.

### 4.5 Rate Limiting Invariant

All rate-limited endpoints MUST use the persistent Supabase-backed store. The in-memory `Map` pattern MUST NOT be used. The `rateLimit()` function MUST be async and await the Supabase RPC.

### 4.6 Admin Auth Invariant

Admin auth MUST be enforced at TWO layers:
1. `src/middleware.ts` — blocks all `/admin/*` and `/api/admin/*` unless valid cookie
2. `requireAdminApiSession()` — per-route defense-in-depth

A new admin route that omits `requireAdminApiSession()` MUST still be blocked by middleware.

### 4.7 MFA Invariant

MFA MUST fail closed if Supabase is unavailable. No in-memory fallback is permitted. MFA codes MUST be cryptographically random. The verify endpoint MUST be rate-limited per challenge token.

---

## 5. Compliance Mapping

### 5.1 CWE Coverage

| CWE | Findings | Controls |
|-----|----------|----------|
| CWE-79 (XSS) | SEC-009, SEC-017, SEC-025 | CTRL-INPUT, CTRL-HEADERS |
| CWE-200 (Info Disclosure) | SEC-023, SEC-028 | CTRL-ADMIN-SESSION, CTRL-INPUT |
| CWE-306 (Missing Auth) | SEC-012 | CTRL-ADMIN-SESSION |
| CWE-307 (Excessive Attempts) | SEC-006 | CTRL-MFA, CTRL-RATELIMIT |
| CWE-338 (Weak PRNG) | SEC-005, SEC-022 | CTRL-MFA, CTRL-INPUT |
| CWE-347 (Bad Signature Verification) | SEC-003, SEC-004 | CTRL-WEBHOOK |
| CWE-352 (CSRF) | SEC-014 | CTRL-CSRF |
| CWE-441 (Unintended Proxy) | SEC-021 | CTRL-RATELIMIT |
| CWE-472 (External Control of Parameter) | SEC-001 | CTRL-PRICING |
| CWE-532 (Log Injection) | SEC-026 | CTRL-LOGGING |
| CWE-613 (Insufficient Session Expiration) | SEC-011 | CTRL-ADMIN-SESSION |
| CWE-614 (Missing Secure Flag) | SEC-019 | CTRL-ADMIN-SESSION |
| CWE-639 (Auth Bypass via User Key) | SEC-018 | CTRL-INPUT |
| CWE-770 (Resource Exhaustion) | SEC-008, SEC-010, SEC-015, SEC-029, SEC-041 | CTRL-RATELIMIT, CTRL-INPUT |
| CWE-943 (Filter Injection) | SEC-013 | CTRL-INPUT |
| CWE-1004 (Cookie Issues) | SEC-007, SEC-020 | CTRL-MFA, CTRL-ADMIN-SESSION |
| CWE-1023 (Idempotency) | SEC-042 | CTRL-PRICING |
| CWE-1104 (Dep Maintenance) | SEC-031 | CTRL-DEPS |
| CWE-1188 (Insecure Default) | SEC-004 | CTRL-WEBHOOK |

### 5.2 OWASP Top 10 Mapping

| OWASP Category | Findings |
|----------------|----------|
| A01: Broken Access Control | SEC-012, SEC-018, SEC-023 |
| A02: Cryptographic Failures | SEC-003, SEC-004, SEC-005, SEC-019, SEC-022 |
| A03: Injection | SEC-013, SEC-017 |
| A04: Insecure Design | SEC-001, SEC-002, SEC-007, SEC-042 |
| A05: Security Misconfiguration | SEC-004, SEC-025, SEC-027 |
| A06: Vulnerable Components | SEC-031 |
| A07: Auth Failures | SEC-006, SEC-011 |
| A08: Integrity Failures | SEC-003, SEC-042 |
| A09: Logging Failures | SEC-026 |
| A10: SSRF | n/a |

---

## 6. Strengths to Preserve

The following existing security practices MUST be preserved during all refactoring:

| Practice | Location | Must Preserve |
|----------|----------|---------------|
| Admin key comparison uses `timingSafeEqual` | `src/lib/admin/auth.ts:42-45` | ✅ |
| HMAC-signed admin tokens with expiration | `src/lib/admin/session.ts` | ✅ (extend with JTI per SEC-011) |
| Email-based MFA with challenge token | `src/lib/admin/mfa-store.ts` | ✅ (harden per SEC-005/007) |
| Device fingerprint binding | `src/lib/admin/mfa-store.ts` | ✅ |
| Admin audit logging | `src/lib/admin/audit.ts` | ✅ |
| RLS policies on Supabase | Migrations | ✅ (clean up per SEC-027) |
| Generic error messages (no enumeration) | Multiple routes | ✅ |
| Input sanitization | `src/lib/validate.ts` | ✅ (extend per SEC-013) |
| Parameterized queries | All routes | ✅ |
| httpOnly + secure cookies | All routes | ✅ (standardize per SEC-019/020) |
| One-time use tokens | MFA + password reset | ✅ (password reset removed) |
| Customer artwork bucket is private | `supabase/migrations/031` | ✅ |
| Magic-byte verification on uploads | `src/app/api/custom-orders/upload/route.ts` | ✅ |
| Order tracking requires ID + guest token | `src/app/orders/[id]/page.tsx` | ✅ |

---

## 7. Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-19 | Initial specification created from two audit reports + codebase verification | Security review |

---

*This specification governs all security implementation work. For the phased execution plan, see `docs/SECURITY_REMEDIATION_PLAN.md`.*