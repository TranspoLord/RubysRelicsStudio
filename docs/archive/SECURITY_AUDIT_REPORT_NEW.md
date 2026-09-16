# Security Code Review Report — Ruby's Relics Studio

**Date:** 2026-07-20  
**Reviewer:** Application Security Engineer  
**Scope:** Full codebase security review focusing on OWASP Top 10, AuthN/AuthZ, cryptographic failures, business logic, and error handling.

---

## Executive Summary

The codebase demonstrates a strong security posture in several areas (server-side price computation, webhook signature verification, fail-closed MFA storage, RLS lockdown, audit logging). However, the review uncovered **15 vulnerabilities** ranging from Critical to Low severity. The most severe is a **complete MFA bypass** via a client-forgeable cookie, followed by a **client-controlled shipping amount** that enables price manipulation at checkout.

---

## Vulnerabilities

### 1. MFA Bypass via Client-Controlled Cookie

**Severity:** Critical — The entire second factor can be skipped by anyone who obtains the admin login key, reducing 2FA to 1FA. Exploitability is trivial (one HTTP header).

**Location:** `src/app/api/admin/verify-mfa/route.ts` line 61; `src/lib/admin/auth.ts` line 100; `src/middleware.ts` line 87

**Exploit Scenario:** An attacker who obtains or brute-forces the `ADMIN_LOGIN_KEY` logs in via `POST /api/admin/session`, then simply sets the cookie `admin_mfa_verified=true` in their browser (or sends it in the `Cookie` header). The middleware only validates `rr_admin_session` and never checks `admin_mfa_verified`; the page guard in `requireAdminPageSessionOrRedirect` compares the cookie value to the literal string `'true'` with no cryptographic binding. All admin pages and APIs become accessible without ever requesting or entering an MFA code.

**Remediation:** The MFA-verified state must be cryptographically bound to the session token, not stored as a plain boolean cookie. The simplest fix is to fold MFA status into the signed session token itself.

```typescript
// src/lib/admin/session.ts — add an mfaVerified flag to the token payload
const SESSION_VERSION = 'v2' // bump version to invalidate old tokens

export async function createAdminSessionToken(
  adminKey: string,
  ttlSeconds = DEFAULT_SESSION_TTL_SECONDS,
  metadata?: { ipAddress?: string; userAgent?: string; mfaVerified?: boolean }
): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds
  const jti = randomUUID()
  const mfaFlag = metadata?.mfaVerified ? '1' : '0'
  const payload = `${SESSION_VERSION}.${expiresAt}.${jti}.${mfaFlag}`
  const sig = signPayload(payload, adminKey)
  const token = `${payload}.${sig}`
  // ... session row insert unchanged ...
  return token
}

export async function verifyAdminSessionToken(
  token: string | null | undefined,
  adminKey: string,
  requireMfa = true
): Promise<boolean> {
  if (!token || !adminKey) return false
  const parts = token.split('.')
  if (parts.length !== 5) return false          // v2 has 5 parts
  const [version, expRaw, jti, mfaFlag, signature] = parts
  if (version !== SESSION_VERSION) return false
  const exp = Number.parseInt(expRaw, 10)
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false
  if (requireMfa && mfaFlag !== '1') return false   // enforce MFA here
  const payload = `${version}.${exp}.${jti}.${mfaFlag}`
  const expectedSignature = signPayload(payload, adminKey)
  const actualBuf = Buffer.from(signature)
  const expectedBuf = Buffer.from(expectedSignature)
  if (actualBuf.length !== expectedBuf.length) return false
  if (!timingSafeEqual(actualBuf, expectedBuf)) return false
  // ... DB revocation check unchanged ...
  return true
}
```

Then update `verify-mfa/route.ts` to issue a new session token with `mfaVerified: true` instead of setting a separate cookie:

```typescript
// src/app/api/admin/verify-mfa/route.ts — replace the cookie-set block
if (!isValid) {
  return NextResponse.json({ error: 'Invalid or expired verification code' }, { status: 401 })
}

// Re-issue the session token with MFA verified
const adminKey = getExpectedAdminKey()
const maxAge = await getAdminSessionMaxAgeSeconds()
const newToken = await createAdminSessionToken(adminKey, maxAge, {
  ipAddress: getClientIp(request),
  userAgent: request.headers.get('user-agent') || undefined,
  mfaVerified: true,
})

const response = NextResponse.json({ success: true })
response.cookies.set({
  name: ADMIN_COOKIE_NAME,
  value: newToken,
  httpOnly: true,
  sameSite: 'strict',
  secure: isProd(),
  path: '/',
  maxAge,
})
// Clear challenge token cookie (unchanged)
response.cookies.set('admin_mfa_challenge', '', { httpOnly: true, secure: isProd(), sameSite: 'strict', maxAge: 0, path: '/' })
return response
```

Remove the `admin_mfa_verified` cookie check from `requireAdminPageSessionOrRedirect` and rely on `verifyAdminSessionToken(token, adminKey, requireMfa)`.

---

### 2. Client-Controlled Shipping Rate Amount (Price Manipulation)

**Severity:** Critical — An attacker can set the shipping cost to $0.00 (or negative) at checkout, paying only for product lines and receiving free shipping. Direct financial loss per transaction; trivially exploitable.

**Location:** `src/app/api/square/checkout/route.ts` lines 185-200

**Exploit Scenario:** An attacker intercepts the `POST /api/square/checkout` request and sets `body.shippingRate.amount` to `0` (or `0.001`). The server uses this value directly (`Math.round(body.shippingRate.amount * 100)`) as the shipping line item passed to Square and added to `totalAmountCents`. The order is created with a $0 shipping cost, and Square charges only the product subtotal.

**Remediation:** Never trust the client-supplied amount. Re-query Shippo server-side using the `rateToken` (object_id) from the rates response, or store rate quotes server-side with a short-lived quote ID.

```typescript
// src/app/api/square/checkout/route.ts — replace the shipping block
let shippingAmountCents = 0
if (body.shippingRate?.rateToken) {
  // Re-fetch the rate from Shippo by object_id to get the authoritative amount
  const rateResponse = await fetch(`${SHIPPO_API_BASE}/rates/${body.shippingRate.rateToken}`, {
    headers: {
      'Authorization': `ShippoToken ${process.env.SHIPPO_API_TOKEN}`,
      'Accept': 'application/json',
    },
  })
  if (!rateResponse.ok) {
    return NextResponse.json({ error: 'Shipping rate could not be verified.' }, { status: 400 })
  }
  const rate = await rateResponse.json()
  if (!rate.amount || rate.status !== 'SUCCESS') {
    return NextResponse.json({ error: 'Shipping rate is no longer valid.' }, { status: 400 })
  }
  shippingAmountCents = Math.round(parseFloat(rate.amount) * 100)
  totalAmountCents += shippingAmountCents

  lineItems.push({
    name: `Shipping: ${rate.servicelevel?.name || rate.provider}`,
    quantity: '1',
    base_price_money: { amount: shippingAmountCents, currency: 'USD' },
  })
}
```

**Architectural advice:** For stronger guarantees, create a `exp_shipping_quotes` table that stores `{quote_id, rate_token, amount_cents, expires_at}` when `/api/shippo/rates` is called. The checkout endpoint then accepts only `quoteId` and looks up the amount server-side, rejecting expired quotes.

---

### 3. PostgREST Filter Injection in Admin Catalog Search

**Severity:** High — An authenticated admin (or anyone who bypassed MFA via #1) can inject PostgREST filter syntax to read arbitrary columns or bypass filters. Exploitability requires admin session but enables data extraction beyond intended search results.

**Location:** `src/app/api/admin/catalog/route.ts` line 334

**Exploit Scenario:** An admin sends `GET /api/admin/catalog?q=title.ilike.%25%` or `q=),id.eq.` which injects additional filter clauses into the `.or()` PostgREST query, potentially exposing columns not intended for the list view or bypassing the `is_archived` filter.

**Remediation:** Use the same `sanitizeSearchQuery` helper that the public search route uses, which strips PostgREST filter characters.

```typescript
// src/app/api/admin/catalog/route.ts — add import and use sanitizer
import { sanitizeSearchQuery } from '@/lib/validate'

// In GET handler, replace line 294:
const query = sanitizeSearchQuery(url.searchParams.get('q')) ?? ''

// Then the existing interpolation is safe because special chars are stripped
if (query.length > 0) {
  builder = builder.or(`title.ilike.%${query}%,slug.ilike.%${query}%`)
}
```

---

### 4. Stored XSS in Shippo Webhook Notification Email

**Severity:** High — If the Shippo API or webhook secret is compromised, an attacker can inject malicious HTML/JavaScript into customer-facing emails. Email clients that render HTML can execute payloads. Exploitability requires compromising Shippo credentials or the webhook secret.

**Location:** `src/app/api/shippo/webhook/route.ts` lines 133-134

**Exploit Scenario:** An attacker who obtains the `SHIPPO_WEBHOOK_SECRET` sends a forged webhook with `tracking_number` set to `<img src=x onerror=alert(document.cookie)>`. The signature passes, and the delivered-notification email renders the unescaped payload in the customer's inbox.

**Remediation:** Escape all webhook-supplied values before interpolating into HTML.

```typescript
// src/app/api/shippo/webhook/route.ts — add import
import { safeHtmlEscape } from '@/lib/validate'

// Replace lines 131-135:
html: `
  <h2>Order Delivered</h2>
  <p>Your order #${safeHtmlEscape(order.id)} has been delivered via ${safeHtmlEscape(carrier.toUpperCase())} tracking #${safeHtmlEscape(tracking_number)}.</p>
  <p><a href="https://yourdomain.com/orders/${encodeURIComponent(order.id)}">View order details</a></p>
`,
```

---

### 5. SSRF / Path Traversal in Shippo Tracking API Client

**Severity:** High — An attacker who can influence the `trackingNumber` or `carrier` arguments can redirect the server-side fetch to arbitrary Shippo API paths or inject path segments. Exploitability depends on call-site input validation.

**Location:** `src/lib/shippo/client.ts` line 217

**Exploit Scenario:** If any route passes user input to `getTrackingInfo` without strict validation (e.g., `carrier=../orders` or `trackingNumber=../../users`), the fetch URL becomes `https://api.goshippo.com/tracks/../orders/../../users`, potentially accessing unintended Shippo API endpoints.

**Remediation:** Validate inputs against strict allowlists before URL interpolation.

```typescript
// src/lib/shippo/client.ts — add validation
const ALLOWED_CARRIERS = new Set(['usps', 'ups', 'fedex', 'dhl', 'canada_post'])
const TRACKING_NUMBER_RE = /^[A-Za-z0-9]{8,40}$/

export async function getTrackingInfo(trackingNumber: string, carrier: string): Promise<{...}> {
  if (!SHIPPO_API_TOKEN) throw new Error('Shippo API token not configured.')

  const normalizedCarrier = carrier.toLowerCase().trim()
  if (!ALLOWED_CARRIERS.has(normalizedCarrier)) {
    throw new Error('Unsupported carrier.')
  }
  if (!TRACKING_NUMBER_RE.test(trackingNumber)) {
    throw new Error('Invalid tracking number format.')
  }

  const response = await fetch(
    `${SHIPPO_API_BASE}/tracks/${encodeURIComponent(normalizedCarrier)}/${encodeURIComponent(trackingNumber)}`,
    { method: 'GET', headers: getHeaders() }
  )
  // ... rest unchanged ...
}
```

---

### 6. TOCTOU Race Condition in Square Webhook Replay Protection

**Severity:** High — Two concurrent webhook deliveries with the same event ID can both pass the dedup check and both process the payment, potentially double-updating order status or triggering duplicate side effects. Exploitability requires Square to retry rapidly or an attacker to replay a captured valid webhook within the race window.

**Location:** `src/app/api/webhooks/square/route.ts` lines 98-118

**Exploit Scenario:** An attacker captures a valid signed webhook payload and sends it twice simultaneously. Both requests execute the SELECT (line 99), both find no existing row, both proceed to process the payment event, and both attempt the INSERT. The second INSERT fails on the primary key, but the payment has already been processed twice.

**Remediation:** Make the dedup atomic by using an INSERT with `ON CONFLICT DO NOTHING` and checking the affected row count, or use a database-level advisory lock.

```typescript
// src/app/api/webhooks/square/route.ts — replace lines 98-127
const eventId = event?.event_id || event?.id
if (eventId) {
  // Atomic insert: if the row already exists, this returns null and we skip
  const { data: inserted, error: insertDedupError } = await supabase
    .from('exp_square_webhook_events')
    .insert({
      id: eventId,
      event_type: eventType,
      received_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (insertDedupError || !inserted) {
    // Duplicate event — return 200 but do not reprocess
    return NextResponse.json({ received: true, duplicate: true })
  }

  // Lazy cleanup (unchanged)
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  await supabase
    .from('exp_square_webhook_events')
    .delete()
    .lt('received_at', cutoff)
    .then(null, () => {})
}
```

---

### 7. Hardcoded Salt in Session Token Hashing

**Severity:** Medium — The HMAC "salt" is a hardcoded constant visible in source code. If the database leaks, an attacker with the token hashes cannot brute-force them (HMAC is one-way), but the hardcoded key violates cryptographic best practices and fails to provide per-deployment uniqueness.

**Location:** `src/lib/admin/session.ts` line 16

**Exploit Scenario:** In a multi-tenant or forked deployment, all instances share the same `session-hash-salt`, meaning token hashes from one deployment are valid in another if the JTI collides. The hardcoded value also means any source-code reader knows the hashing key.

**Remediation:** Derive the hash key from an environment variable or the `ADMIN_LOGIN_KEY` itself.

```typescript
// src/lib/admin/session.ts
function hashToken(token: string): string {
  const hashKey = process.env.SESSION_HASH_KEY || process.env.ADMIN_LOGIN_KEY
  if (!hashKey) throw new Error('SESSION_HASH_KEY or ADMIN_LOGIN_KEY must be set.')
  return createHmac('sha256', hashKey).update(token).digest('hex')
}
```

---

### 8. Rate Limiter Fails Open on Infrastructure Errors

**Severity:** Medium — If the Supabase RPC is unavailable, all rate-limited endpoints (login, MFA, newsletter, uploads) become unlimited, enabling brute-force attacks on the admin login key or MFA codes. Exploitability requires the database to be down or the RPC to error.

**Location:** `src/lib/rate-limit.ts` lines 71 and 85

**Exploit Scenario:** An attacker triggers a database outage (or the migration hasn't run), then brute-forces `POST /api/admin/session` with rapid key guesses. The rate limiter returns `{ allowed: true }` on every request because the RPC fails.

**Remediation:** For security-critical endpoints (login, MFA), fail closed. For general endpoints, fail open is acceptable.

```typescript
// src/lib/rate-limit.ts — add a failClosed option
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  options: { failClosed?: boolean } = {}
): Promise<RateLimitResult> {
  // ... existing logic ...
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase.rpc('increment_rate_limit', { ... })
    if (error) {
      safeLogError('[rate-limit]', error)
      if (options.failClosed) {
        return { allowed: false, remaining: 0, retryAfter: 60 }
      }
      return { allowed: true, remaining: limit - 1 }
    }
    // ... rest unchanged ...
  } catch (error) {
    safeLogError('[rate-limit]', error)
    if (options.failClosed) {
      return { allowed: false, remaining: 0, retryAfter: 60 }
    }
    return { allowed: true, remaining: limit - 1 }
  }
}
```

Then update auth-critical callers:

```typescript
// src/app/api/admin/session/route.ts line 51
const rl = await rateLimit(`admin-login:${ip}`, 8, 15 * 60 * 1000, { failClosed: true })

// src/app/api/admin/verify-mfa/route.ts line 38
const rl = await rateLimit(`admin-mfa-verify:${challengeToken}`, 5, 5 * 60 * 1000, { failClosed: true })
```

---

### 9. Broken RLS Policies After customer_id Column Drop

**Severity:** Medium — Migration 039 creates RLS policies referencing `customer_id`, but migration 042 drops the `customer_id` column. The policies become invalid, potentially causing errors or silently allowing all access (depending on Postgres behavior). Exploitability depends on whether the policies error or are ignored.

**Location:** `supabase/migrations/039_rls_lockdown.sql` lines 18-23, 37-42, 48-55; `supabase/migrations/042_remove_customer_accounts.sql` line 25

**Exploit Scenario:** After migration 042 runs, the `users_update_own_orders` policy references a non-existent column. If Postgres drops the policy automatically, the table may have no UPDATE policy, blocking all updates. If the policy persists in a broken state, it may error on every query or be silently skipped, allowing unauthorized updates.

**Remediation:** Drop the orphaned policies in migration 042 (or a new migration).

```sql
-- Add to supabase/migrations/042_remove_customer_accounts.sql (or a new migration 047)
DROP POLICY IF EXISTS "users_update_own_orders" ON exp_orders;
DROP POLICY IF EXISTS "users_select_own_order_items" ON exp_order_items;
DROP POLICY IF EXISTS "users_update_own_order_items" ON exp_order_items;

-- Since customer accounts no longer exist, all access goes through the service role.
-- Ensure anon/authenticated have no direct access:
REVOKE ALL ON exp_orders FROM anon, authenticated;
REVOKE ALL ON exp_order_items FROM anon, authenticated;
```

---

### 10. CSRF Origin Validation Bypass via startsWith

**Severity:** Medium — `startsWith` allows a subdomain like `evil.example.com` to match an allowed origin of `example.com`. Exploitability requires the attacker to control a subdomain of the application's domain.

**Location:** `src/lib/security/csrf.ts` lines 42-43

**Exploit Scenario:** If the app is deployed at `rubysrelics.com` and an attacker controls `evil.rubysrelics.com` (e.g., via a stale DNS record or subdomain takeover), they can host a page that submits cross-origin forms to the admin API. The `startsWith` check passes because `evil.rubysrelics.com` starts with `rubysrelics.com`.

**Remediation:** Compare the full origin, not a prefix.

```typescript
// src/lib/security/csrf.ts — replace lines 42-43
function normalizeOrigin(url: string): string {
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.host}`  // host includes port
  } catch {
    return ''
  }
}

const allowed = normalizeOrigin(allowedOrigin)
if (origin && normalizeOrigin(origin) !== allowed) return false
if (referer && !normalizeOrigin(referer).startsWith(allowed + '/')) return false
```

---

### 11. Body Size Limit Uses Character Count Instead of Byte Length

**Severity:** Medium — Multibyte UTF-8 characters (e.g., emoji, CJK) count as one "character" but up to 4 bytes each. A 100KB character limit allows up to ~400KB of actual payload, weakening the DoS protection.

**Location:** `src/lib/security/body.ts` line 35

**Exploit Scenario:** An attacker sends a JSON body of 100,000 emoji characters (each 4 bytes), totaling ~400KB. The `text.length` check (100,000) passes the 100KB limit, but the actual memory consumption is 4x higher.

**Remediation:** Use `Buffer.byteLength` for byte-accurate measurement.

```typescript
// src/lib/security/body.ts — replace line 35
const text = await request.text()
const byteLength = Buffer.byteLength(text, 'utf8')
if (byteLength > maxSize) {
  throw new BodyTooLargeError(maxSize)
}
```

---

### 12. Insecure Custom Quote Payment URL

**Severity:** Medium — The quote payment URL embeds the amount as a query parameter and does not create a real Square payment link. A customer (or MITM) can modify the `amount` parameter before paying, paying less than the quoted amount.

**Location:** `src/app/api/custom-orders/[id]/route.ts` lines 88-91

**Exploit Scenario:** The admin sends a quote for $150.00. The customer receives a link like `/api/square/checkout?amount=15000&requestId=...`. The customer changes the URL to `amount=100` and pays $1.00. The webhook marks the order as paid because the amount reconciliation only checks against `order.order_total`, which was set from the client-supplied amount.

**Remediation:** Create a real Square payment link via the Square API, or store the quote amount server-side and look it up by a token.

```typescript
// src/app/api/custom-orders/[id]/route.ts — replace createSquareQuotePaymentUrl
import { createSquareCheckout } from '@/lib/square/client'

// In the send_quote action:
const checkoutResponse = await createSquareCheckout({
  lineItems: [{
    name: `Custom Order: ${requestRow.item_type}`,
    quantity: '1',
    base_price_money: { amount: Math.round(quoteAmount * 100), currency: 'USD' },
  }],
  idempotencyKey: randomUUID(),
  note: `Custom request ${requestRow.id}`,
  metadata: { request_id: requestRow.id },
})

const paymentLink = {
  paymentLinkId: checkoutResponse.payment_link.id,
  paymentLinkUrl: checkoutResponse.payment_link.url,
}
```

---

### 13. IP Hashing Bypasses Safe getClientIp Logic

**Severity:** Medium — The cart capture endpoint directly trusts `x-forwarded-for` for IP hashing, bypassing the `getClientIp` helper that only trusts this header on Vercel. Outside Vercel, an attacker can spoof their IP, making the IP hash useless for audit and potentially poisoning rate-limit keys.

**Location:** `src/app/api/cart/capture/route.ts` lines 104-105

**Exploit Scenario:** On a non-Vercel deployment, an attacker sets `X-Forwarded-For: 1.2.3.4` on every request. The IP hash is derived from the spoofed IP, so audit logs show fake IPs and the per-IP rate limit is bypassed by varying the header.

**Remediation:** Use `getClientIp` consistently.

```typescript
// src/app/api/cart/capture/route.ts — replace lines 103-108
// Hash the IP for rate-limit audit only — never store raw IP
const clientIp = getClientIp(request)
const ipHash = clientIp !== 'unknown'
  ? createHash('sha256').update(clientIp).digest('hex')
  : null
```

---

### 14. CSP Nonce Placeholder Not Functional

**Severity:** Low — The CSP header contains the literal string `'nonce-{nonce}'` rather than a dynamically generated nonce. This means the CSP either blocks all inline scripts (breaking the app) or is ineffective. Exploitability is limited because the app likely doesn't rely on inline scripts, but the CSP is not providing the intended protection.

**Location:** `next.config.ts` line 7

**Exploit Scenario:** If an XSS vulnerability exists elsewhere, the CSP's `script-src` does not actually enforce nonce-based inline script blocking because `'nonce-{nonce}'` is not a valid nonce. An attacker's injected `<script>` tag would be evaluated if the browser interprets the placeholder as a malformed directive (browsers typically ignore unknown nonce values, falling back to allowing nothing — but this is implementation-dependent).

**Remediation:** Use Next.js's built-in nonce generation in middleware, or remove the nonce directive if inline scripts are not used.

```typescript
// src/middleware.ts — generate a per-request nonce and inject into CSP
import { NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  const nonce = crypto.randomUUID().replace(/-/g, '')
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://vercel.live https://js.stripe.com`,
    // ... rest of CSP ...
  ].join('; ')

  const response = NextResponse.next()
  response.headers.set('Content-Security-Policy', csp)
  // Pass nonce to the app via a request header so pages can use it
  response.headers.set('x-nonce', nonce)
  return response
}
```

Then in `next.config.ts`, remove the static CSP header (let middleware handle it), or use a placeholder that Next.js replaces. The cleanest approach is to handle CSP entirely in middleware.

---

### 15. Debug Endpoint Exposes Internal State

**Severity:** Low — The MFA debug endpoint exposes table row counts, error messages, and environment variable presence. While it requires admin auth, it provides unnecessary information that could aid an attacker who has admin access (or bypassed MFA via #1).

**Location:** `src/app/api/admin/mfa-debug/route.ts` lines 33-93

**Exploit Scenario:** An attacker who bypassed MFA calls `GET /api/admin/mfa-debug` and learns whether the service role key is set, how many MFA codes exist in the table, and whether inserts/deletes work — information useful for planning further attacks.

**Remediation:** Gate the endpoint behind a non-production environment check, or remove it entirely and replace with a health check that returns only `{ ok: boolean }`.

```typescript
// src/app/api/admin/mfa-debug/route.ts — add environment gate
import { isProd } from '@/lib/security/env'

export async function GET(request: NextRequest) {
  if (isProd()) {
    return NextResponse.json({ error: 'Debug endpoint not available in production.' }, { status: 403 })
  }
  // ... existing logic ...
}
```

---

## Correctly Implemented Security Mechanisms

The following security controls are implemented correctly and should be maintained:

1. **Server-side price computation** (`src/app/api/square/checkout/route.ts`): Product prices are fetched from the database and computed via `computeCanonicalLine()` — the client never supplies prices.
2. **Webhook signature verification** (Square and Shippo webhooks): Both use HMAC-SHA256 with `timingSafeEqual` and fail closed if the secret or signature is missing.
3. **MFA code storage fails closed** (`src/lib/admin/mfa-store.ts`): No in-memory fallback; if Supabase is unavailable, MFA verification returns false.
4. **Cryptographically random MFA codes** (`mfa-store.ts` line 46): Uses `crypto.randomInt` instead of `Math.random`.
5. **Session token HMAC with timing-safe comparison** (`session.ts`): Tokens are signed with `createHmac('sha256', adminKey)` and verified with `timingSafeEqual`.
6. **Admin session revocation** (`session.ts`): JTI-based revocation with a database table for defense-in-depth.
7. **Artwork upload ownership verification** (`custom-orders/route.ts` lines 211-235): Files are bound to per-session upload tokens and verified at intake time.
8. **File upload magic bytes verification** (`custom-orders/upload/route.ts`): Prevents MIME-type spoofing.
9. **SVG sanitization with DOMPurify** (`admin/catalog/media/upload/route.ts`): Server-side sanitization of SVG uploads.
10. **Audit logging** (`src/lib/admin/audit.ts`): Admin actions are logged with entity IDs, routes, and status.
11. **RLS lockdown on sensitive tables** (migrations 040, 043-046): `admin_mfa_codes`, `exp_square_webhook_events`, `exp_rate_limit_windows`, `exp_admin_sessions`, and `exp_artwork_uploads` all have RLS enabled with service-role-only access.
12. **Sanitizing logger** (`src/lib/security/logger.ts`): Strips connection strings, API keys, JWTs, and bearer tokens from log output.
13. **Strict cookie attributes**: `httpOnly`, `sameSite: 'strict'`, and `secure: isProd()` are consistently applied.
14. **Security headers** (`next.config.ts`): HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, and Permissions-Policy are set.

---

## Proactive Defense-in-Depth Measure

**Implement Content Security Policy (CSP) with per-request nonces.** The current CSP in `next.config.ts` uses a static placeholder `'nonce-{nonce}'` that is not functional. A properly implemented nonce-based CSP would prevent XSS payloads from executing even if an injection vulnerability exists. Generate a cryptographically random nonce per request in middleware, inject it into the CSP header, and expose it to React Server Components via a header so rendered `<script>` tags can include `nonce="{nonce}"`. This closes the last line of defense against XSS, complementing the existing input validation and output encoding.

---

*End of report.*