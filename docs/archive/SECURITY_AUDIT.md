# 🔒 Security Audit & Remediation Plan

**Project:** Ruby's Relics Studio  
**Date:** July 19, 2026  
**Scope:** Full-stack Next.js application with Supabase, Square Payments, Shippo shipping, Resend email

---

## Priority Legend

| Priority | Label | Meaning |
|----------|-------|---------|
| 🔴 P0 | Critical | Immediate action required — active exploit risk |
| 🟠 P1 | High | Should be addressed within the current sprint |
| 🟡 P2 | Medium | Address within the next sprint |
| 🟢 P3 | Low | Address when convenient / tech debt |

---

## 🔴 P0 — Critical

### C1. Timing Attack in Legacy Password Verification

**File:** `src/lib/auth/customer.ts` — Line 45

```typescript
// ❌ Vulnerable: string comparison allows timing-based character enumeration
const isValid = computedHash === hash
```

**Problem:** The legacy SHA256-HMAC password verification uses standard string comparison (`===`) instead of a timing-safe comparison. An attacker can measure response times to brute-force the hash character-by-character. The admin module (`admin/auth.ts:44`) correctly uses `timingSafeEqual`, but the customer path does not.

**Fix:**
```typescript
import { timingSafeEqual } from 'node:crypto'

// Replace line 45 with:
const isValid = timingSafeEqual(Buffer.from(computedHash), Buffer.from(hash))
```

**Effort:** 15 minutes  
**Risk:** An attacker with network access could recover password hashes through timing differentials.

---

### C2. In-Memory Rate Limiter Ineffective on Serverless

**File:** `src/lib/rate-limit.ts` — Lines 20-21

```typescript
// ❌ Module-level Map resets on every cold start
const store = new Map<string, Window>()
```

**Problem:** The rate limiter uses an in-memory `Map` that is lost on every Vercel serverless cold start. An attacker can bypass rate limits by:
- Spreading requests across different serverless instances
- Waiting for cold starts (rate limit resets)
- Sending requests faster than the prune interval

**Affected endpoints:**
- `POST /api/customer/login` — 5 req/15min (login:ip)
- `POST /api/customer/signup` — 3 req/10min (signup:ip)
- `POST /api/customer/forgot-password` — 5 req/15min (forgot-pw-ip:ip)
- `POST /api/admin/session` — 8 req/15min (admin-login:ip)
- `POST /api/admin/send-mfa` — 3 req/10min (admin-mfa-send:ip)
- `POST /api/webhooks/square` — 20 req/min (square-webhook:ip)

**Fix:** Replace the in-memory store with a persistent store:

**Option A — Upstash Redis (recommended):**
```typescript
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const now = Date.now()
  const windowKey = `${key}:${Math.floor(now / windowMs)}`
  const count = await redis.incr(windowKey)
  if (count === 1) await redis.expire(windowKey, Math.ceil(windowMs / 1000))
  // ... rest of logic
}
```

**Option B — Supabase (already in project):**
```typescript
// Use a rate_limit table in Supabase instead of in-memory Map
```

**Effort:** 4 hours  
**Risk:** Without persistent rate limiting, brute-force attacks on login, signup, and admin endpoints are feasible.

---

### C3. No Rate Limiting on MFA Verification

**File:** `src/app/api/admin/verify-mfa/route.ts`

**Problem:** The MFA verification endpoint has **no rate limiting**. A 6-digit code (1,000,000 combinations) can be brute-forced with ~500,000 requests on average. An attacker who obtains the admin session cookie (e.g., via XSS, network interception) can bypass MFA.

**Fix:** Add aggressive rate limiting to the verify-mfa endpoint:

```typescript
// In verify-mfa/route.ts, before verification:
const rl = rateLimit(`admin-mfa-verify:${challengeToken}`, 5, 10 * 60 * 1000)
if (!rl.allowed) {
  // Invalidate the challenge token after 5 failed attempts
  return NextResponse.json({ error: 'Too many attempts. Request a new code.' }, { status: 429 })
}
```

Also invalidate the challenge token in the database after 5 failed attempts.

**Effort:** 1 hour  
**Risk:** MFA bypass via brute-force on the verification code.

---

## 🟠 P1 — High

### H1. Shippo Webhook Signature Verification Is Optional

**File:** `src/app/api/shippo/webhook/route.ts` — Line 32

```typescript
// ❌ Verification is skipped if webhookSecret or signature is missing
if (webhookSecret && signature) {
  // ... verify
}
```

**Problem:** The Shippo webhook signature verification is wrapped in a conditional. If `SHIPPO_WEBHOOK_SECRET` is not configured (currently set to `your_webhook_secret`), **anyone** can send fake shipping webhooks to:
- Mark orders as delivered fraudulently
- Send fake delivery emails to customers
- Update order statuses arbitrarily

Additionally, line 41 uses `!==` instead of `timingSafeEqual`:
```typescript
if (signature !== expectedSignature) {  // ❌ Timing attack vector
```

**Fix:**
1. Make the webhook secret required at startup
2. Always verify signatures
3. Use `timingSafeEqual` for comparison

```typescript
const webhookSecret = process.env.SHIPPO_WEBHOOK_SECRET
if (!webhookSecret) {
  console.error('[shippo:webhook] SHIPPO_WEBHOOK_SECRET not configured')
  return new NextResponse('Webhook not configured', { status: 500 })
}

const signature = request.headers.get('x-shippo-signature')
if (!signature) {
  return new NextResponse('Missing signature', { status: 401 })
}

// Use timingSafeEqual instead of !==
const crypto = await import('node:crypto')
const expectedSignature = crypto
  .createHmac('sha256', webhookSecret)
  .update(body)
  .digest('hex')

if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
  return new NextResponse('Invalid signature', { status: 401 })
}
```

**Effort:** 1 hour  
**Risk:** Unauthenticated order status manipulation and fraudulent customer notifications.

---

### H2. Square Checkout Has No Server-Side Price Validation

**File:** `src/app/api/square/checkout/route.ts` — Lines 29-100

**Problem:** The Square checkout endpoint accepts prices directly from the client without verifying them against the database. A malicious user could:
- Modify the `unitPrice` to $0.01
- Set negative prices
- Create orders with arbitrary amounts

```typescript
// ❌ Client-provided prices are used without server-side verification
const lineItems = body.items.map((item) => ({
  base_price_money: {
    amount: Math.round(item.unitPrice * 100),  // Trusts client input
  },
}))
```

**Fix:** Look up product prices from the database and verify them server-side:

```typescript
// Before creating line items, verify prices against database
const supabase = getSupabaseAdmin()
const productIds = body.items.map(i => i.productId)
const { data: products } = await supabase
  .from('exp_products')
  .select('id, base_price')
  .in('id', productIds)

const priceMap = new Map(products?.map(p => [p.id, p.base_price]) ?? [])

for (const item of body.items) {
  const dbPrice = priceMap.get(item.productId)
  if (!dbPrice || Math.abs(dbPrice - item.unitPrice) > 0.01) {
    return NextResponse.json({ error: 'Price mismatch detected' }, { status: 400 })
  }
}
```

**Effort:** 2 hours  
**Risk:** Customers could purchase items at arbitrary prices.

---

### H3. Admin Session Cookie Uses `sameSite: 'lax'`

**Files:**
- `src/app/api/admin/session/route.ts` — Line 61
- `src/app/api/admin/send-mfa/route.ts` — Line 83
- `src/app/api/admin/verify-mfa/route.ts` — Line 49

```typescript
// ❌ 'lax' allows CSRF via top-level navigations
sameSite: 'lax',
```

**Problem:** Admin cookies use `sameSite: 'lax'`, which means they're sent on top-level GET navigations from external sites. This enables CSRF attacks where an attacker tricks an authenticated admin into visiting a crafted link.

**Fix:** Change all admin cookies to `sameSite: 'strict'`:

```typescript
sameSite: 'strict',
```

**Effort:** 15 minutes  
**Risk:** CSRF attacks against admin endpoints.

---

### H4. Password Reset Token in URL (Referrer Leak)

**File:** `src/app/api/customer/forgot-password/route.ts` — Line 57

```typescript
// ❌ Reset token exposed in URL
const resetLink = `${baseUrl}/reset-password/${resetRecord.token}`
```

**Problem:** The password reset token is included in the URL. This creates two risks:
1. **Referrer header leak:** If the user clicks a link from their email that navigates to another site, the `Referer` header leaks the token
2. **Server logs:** The token appears in server access logs
3. **Browser history:** The token is stored in browser history

**Fix:** Use a POST-based flow instead:

```typescript
// Option A: Send the token in a POST form
const resetLink = `${baseUrl}/reset-password`
// Email contains a form that POSTs the token, or the user enters it manually

// Option B: Add rel="noreferrer" to all links in emails
// Option C: Use a one-time use code instead of a URL token
```

**Effort:** 2 hours  
**Risk:** Account takeover via leaked reset token.

---

## 🟡 P2 — Medium

### M1. No CSRF Protection

**Files:** All API routes

**Problem:** No CSRF tokens are implemented anywhere in the application. While `sameSite` cookies provide some protection, they don't cover all attack vectors (e.g., subdomain attacks, `sameSite: 'lax'` GET-based CSRF).

**Fix:** Implement CSRF protection:

```typescript
// Option A: Double-submit cookie pattern
// Set a random CSRF token as a non-httpOnly cookie, require it in a header

// Option B: Origin/Referer header validation
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

**Effort:** 4 hours  
**Risk:** Cross-site request forgery on state-changing operations.

---

### M2. Square Webhook Rate Limiting by IP Is Incorrect

**File:** `src/app/api/webhooks/square/route.ts` — Line 44

```typescript
// ❌ Square webhooks come from Square's IPs, not the end user
const rl = rateLimit(`square-webhook:${ip}`, 20, 60 * 1000)
```

**Problem:** Square webhooks originate from Square's infrastructure IPs. Rate limiting by source IP could:
- Block legitimate webhooks if multiple orders are processed simultaneously
- Be bypassed by sending requests through Square's IPs

**Fix:** Rate limit by webhook event type or use a higher, more appropriate limit:

```typescript
// Rate limit by event type instead of IP
const eventType = event?.type || 'unknown'
const rl = rateLimit(`square-webhook:${eventType}`, 100, 60 * 1000)
```

**Effort:** 30 minutes  
**Risk:** Legitimate payment webhooks could be dropped, causing order status inconsistencies.

---

### M3. Square Checkout Idempotency Key Is Not Truly Idempotent

**File:** `src/app/api/square/checkout/route.ts` — Line 74

```typescript
// ❌ Date.now() has millisecond precision — collisions possible
idempotencyKey: `${items.map(i => i.productId).join('-')}-${Date.now()}`
```

**Problem:** The idempotency key uses `Date.now()` which has millisecond precision. If two identical requests arrive in the same millisecond, they'd have the same key. More importantly, if a request fails after creating a checkout but before returning the response, a retry would create a **new** checkout with a different key.

**Fix:** Use a UUID or hash of the full request payload:

```typescript
import { randomUUID } from 'node:crypto'

// Generate a true UUID for each unique checkout attempt
idempotencyKey: randomUUID()
```

**Effort:** 15 minutes  
**Risk:** Duplicate payment links could be created for the same order.

---

### M4. MFA Debug Endpoint Exposes Service Role Key Prefix

**File:** `src/app/api/admin/mfa-debug/route.ts` — Line 39

```typescript
// ❌ Exposes first 20 characters of the service role key
serviceRoleKeyPrefix: process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 20)
```

**Problem:** The debug endpoint returns the first 20 characters of the Supabase service role key. While not the full key, it reduces the search space for brute-forcing and provides information about the key format.

**Fix:** Only expose a boolean:

```typescript
hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
```

**Effort:** 15 minutes  
**Risk:** Information disclosure that aids targeted attacks.

---

### M5. No Request Body Size Limits

**Files:** Multiple API routes

**Problem:** API routes use `request.json()` without any size limits. An attacker can send arbitrarily large JSON payloads to exhaust server memory and cause denial of service.

**Fix:** Add body size validation:

```typescript
// Add to a shared middleware or utility
export async function parseJsonBody(request: Request, maxSize = 1024 * 100): Promise<any> {
  const text = await request.text()
  if (text.length > maxSize) {
    throw new Error('Request body too large')
  }
  return JSON.parse(text)
}
```

**Effort:** 1 hour  
**Risk:** Denial of service via memory exhaustion.

---

### M6. Client-Side Admin Auth Flag in sessionStorage

**File:** `src/app/admin/login/page.tsx` — Line 42

```typescript
// ❌ Client-side flag provides no real security
sessionStorage.setItem('admin_authenticated', 'true')
```

**Problem:** This flag is cosmetic and provides no actual security. It could mislead developers into thinking it provides authentication, and it's trivially manipulable by the client.

**Fix:** Remove the flag — server-side session verification is the only valid auth check:

```typescript
// Remove line 42 entirely
// The server-side session cookie is the real authentication mechanism
```

**Effort:** 5 minutes  
**Risk:** Low — cosmetic issue, but could lead to security theater.

---

## 🟢 P3 — Low

### L1. Missing Security Headers

**File:** `next.config.ts`

**Problem:** The application doesn't set important security headers:
- `Content-Security-Policy` — Prevents XSS and data injection
- `X-Frame-Options: DENY` — Prevents clickjacking
- `X-Content-Type-Options: nosniff` — Prevents MIME type sniffing
- `Strict-Transport-Security` — Enforces HTTPS
- `Referrer-Policy` — Controls referrer header leakage

**Fix:** Add headers in `next.config.ts`:

```typescript
// next.config.ts
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.goshippo.com https://*.supabase.co;" },
        ],
      },
    ]
  },
}
```

**Effort:** 2 hours  
**Risk:** Low — defense in depth improvement.

---

### L2. No Automated Dependency Vulnerability Scanning

**File:** `package.json`

**Problem:** There's no automated scanning for vulnerable dependencies. The project uses several npm packages that could have known CVEs.

**Fix:** Add to `package.json` scripts and CI:

```json
{
  "scripts": {
    "audit": "npm audit --audit-level=high",
    "test:security": "npm run test:security:rls && npm run audit"
  }
}
```

Also consider adding:
- `snyk` or `socket.dev` for continuous monitoring
- GitHub Dependabot for automated PRs on vulnerable deps
- `npm audit` in CI pipeline

**Effort:** 30 minutes  
**Risk:** Low — known vulnerabilities in dependencies could be exploited.

---

### L3. Customer Session Cookie Uses `sameSite: 'lax'`

**Files:**
- `src/app/api/customer/login/route.ts` — Line 47
- `src/app/api/customer/signup/route.ts` — Line 58

```typescript
sameSite: 'lax',
```

**Fix:** Change to `sameSite: 'strict'` for better CSRF protection on customer endpoints.

**Effort:** 5 minutes  
**Risk:** Low — CSRF on customer endpoints is less critical than admin.

---

### L4. No Account Lockout on Failed Login Attempts

**Files:** `src/lib/auth/customer.ts`, `src/app/api/customer/login/route.ts`

**Problem:** While IP-based rate limiting exists, there's no per-account lockout after N failed attempts. An attacker can brute-force a specific account's password from multiple IPs.

**Fix:** Add a per-email failed attempt counter in the database:

```typescript
// Track failed attempts per email
const { data: attempts } = await supabase
  .from('exp_login_attempts')
  .select('count')
  .eq('email', email)
  .single()

if (attempts?.count >= 10) {
  return { error: 'Account temporarily locked. Try again later.' }
}
```

**Effort:** 2 hours  
**Risk:** Low — IP-based rate limiting provides partial protection.

---

## ✅ Positive Security Practices (Keep Doing)

The project already implements several good security practices:

| Practice | Location | Notes |
|----------|----------|-------|
| bcrypt password hashing | `customer.ts:26` | Cost factor 10 — good balance |
| Timing-safe admin auth | `admin/auth.ts:44` | Uses `timingSafeEqual` |
| HMAC-signed admin tokens | `admin/session.ts:9-11` | SHA256 HMAC with expiration |
| Email-based MFA | `admin/mfa-store.ts` | Challenge token in httpOnly cookie |
| Device fingerprint binding | `admin/mfa-store.ts:159-168` | Optional but available |
| Admin audit logging | `admin/audit.ts` | All catalog operations logged |
| RLS policies on Supabase | Migrations | With verification script |
| Generic error messages | Multiple routes | Prevents email enumeration |
| Legacy hash upgrade | `customer.ts:47-56` | SHA256 → bcrypt on login |
| Session invalidation on reset | `customer.ts:415-419` | Kills all sessions |
| Input sanitization | `validate.ts` | Null byte stripping, length limits |
| Parameterized queries | All routes | Supabase client prevents SQLi |
| httpOnly + secure cookies | All routes | Prevents XSS token theft |
| One-time use tokens | MFA + password reset | Prevents replay attacks |

---

## 📋 Remediation Checklist

### Sprint 1 (Immediate — P0)
- [ ] **C1:** Fix timing attack in `src/lib/auth/customer.ts:45`
- [ ] **C2:** Replace in-memory rate limiter with persistent store (Upstash Redis or Supabase)
- [ ] **C3:** Add rate limiting to `src/app/api/admin/verify-mfa/route.ts`

### Sprint 2 (High — P1)
- [ ] **H1:** Make Shippo webhook signature verification mandatory with timing-safe comparison
- [ ] **H2:** Add server-side price validation to Square checkout endpoint
- [ ] **H3:** Change all admin cookies to `sameSite: 'strict'`
- [ ] **H4:** Migrate password reset to POST-based flow or add referrer protection

### Sprint 3 (Medium — P2)
- [ ] **M1:** Implement CSRF protection (Origin header validation or double-submit cookie)
- [ ] **M2:** Fix Square webhook rate limiting to use event type instead of IP
- [ ] **M3:** Use UUID for Square checkout idempotency key
- [ ] **M4:** Remove service role key prefix from MFA debug endpoint
- [ ] **M5:** Add request body size limits to all API routes
- [ ] **M6:** Remove client-side `admin_authenticated` sessionStorage flag

### Backlog (Low — P3)
- [ ] **L1:** Add security headers (CSP, HSTS, X-Frame-Options, etc.)
- [ ] **L2:** Add `npm audit` to CI pipeline and enable Dependabot
- [ ] **L3:** Change customer session cookies to `sameSite: 'strict'`
- [ ] **L4:** Implement per-account lockout on failed login attempts

---

## 📊 Risk Summary

| Severity | Count | Key Areas |
|----------|-------|-----------|
| 🔴 Critical | 3 | Timing attack, rate limiting, MFA brute-force |
| 🟠 High | 4 | Webhook auth, price validation, CSRF, token leakage |
| 🟡 Medium | 6 | CSRF, idempotency, info disclosure, body limits |
| 🟢 Low | 4 | Security headers, dependency scanning, cookie config |
| **Total** | **17** | |

---

*Generated from comprehensive codebase audit. All findings verified against source code.*