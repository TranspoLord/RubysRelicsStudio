# Ruby's Relics Studio — Security Audit Report (Machine-Consumable)

> **Document type:** Structured findings list for AI / tooling consumption.
> **Companion file:** `docs/SECURITY_AUDIT_REPORT.html` — human-facing visual report.
> **Audit date:** 2026-07-19
> **Auditor:** Red-team static review.
> **Codebase:** Next.js 16.2.10 + Supabase + Square + Shippo + Resend. 217 source files (112 TS, 100 TSX, 5 JS).
> **Methodology:** Static review of every API route handler, auth module, webhook, and migration. Trust-boundary analysis + IDOR hunt + RLS review + signature verification review.

---

## Engagement Goal

> Prevent an external basic-website user from exploiting anything, getting free product, or downloading proprietary or user data that isn't their own.

## Verdict

**FAIL** on free-product axis (C1), **FAIL** on data-protection axis (C2 — account takeover), **WEAK** on integrity axis (C3, C4 — webhook gaps). Authentication, RLS, and input validation otherwise reasonable.

## Counts

| Severity | Count |
|---|---|
| Critical | 4 |
| High | 10 |
| Medium | 10 |
| Low | 7 |
| **Total** | **31** |

---

## Schema (how to read each finding)

Each finding below uses this fixed field set so an AI agent can reliably parse them:

```
ID:           stable identifier (e.g. C1, H5, M3, L2)
SEVERITY:     critical | high | medium | low
TITLE:        one-line summary
LOCATION:     file:line(s), comma-separated if multiple
CWE:          MITRE CWE reference(s)
REACHABLE_BY: unauthenticated | authenticated-customer | authenticated-admin | requires-stolen-cookie
IMPACT:       short impact statement
DESCRIPTION:  detailed explanation
EVIDENCE:     relevant code snippet
EXPLOIT:      step-by-step attack (when applicable)
FIX:          prescriptive remediation
EFFORT:       rough engineering estimate
DEPENDS_ON:   other finding IDs this chains with (when applicable)
```

---

# CRITICAL

---

## C1

- **ID:** C1
- **SEVERITY:** critical
- **TITLE:** Arbitrary-price checkout — customer chooses what they pay
- **LOCATION:** `src/app/api/square/checkout/route.ts:43-52`
- **CWE:** CWE-472 (External Control of Assumed-Immutable Web Parameter), CWE-345 (Insufficient Verification of Data Authenticity)
- **REACHABLE_BY:** unauthenticated
- **IMPACT:** Direct revenue loss; attacker buys any product for any amount ($0.01 confirmed).
- **DESCRIPTION:** The `/api/square/checkout` POST handler accepts `items: [{ productId, unitPrice, quantity, ... }]` directly from the request body and passes `unitPrice` straight through to the Square API as `base_price_money.amount`. The server never queries `exp_products.base_price`, never imports the existing pricing engine (`src/lib/pricing/engine.ts`), and never validates variant deltas, bulk tiers, or quantity. The shipping rate (`body.shippingRate.amount`) is similarly client-supplied. The Square webhook (`src/app/api/webhooks/square/route.ts:76-99`) then marks the resulting order `paid` → `in_production` without reconciling the paid amount against any server-stored expected total.
- **EVIDENCE:**
  ```ts
  // src/app/api/square/checkout/route.ts
  const lineItems = body.items.map((item) => ({
    name: ...,
    quantity: String(item.quantity),
    base_price_money: {
      amount: Math.round(item.unitPrice * 100),  // ← straight from request body
      currency: 'USD',
    },
  }))
  ```
- **EXPLOIT:**
  ```bash
  curl -X POST https://yoursite/api/square/checkout \
    -H "Content-Type: application/json" \
    -d '{"items":[{"productId":"<real-uuid>","title":"Custom Sign","quantity":1,"unitPrice":0.01}],"buyerEmail":"me@evil.com"}'
  ```
  Returned Square URL lets the attacker pay $0.01. Webhook then marks order `paid`.
- **FIX:**
  1. In `/api/square/checkout`, accept ONLY `{ productId, variantId, selectedOptions, quantity }` from the client — never `unitPrice` or `lineTotal`.
  2. Fetch product row + variant + options from Supabase server-side.
  3. Run them through `computeCanonicalLinePricing()` in `src/lib/pricing/engine.ts`.
  4. Use the server-computed `unitAmountCents` as the Square `base_price_money.amount`.
  5. In `src/app/api/webhooks/square/route.ts`, look up the order, compare `payment.total_money.amount` to the stored `order_total`, fail-closed if mismatch.
- **EFFORT:** ~2h
- **DEPENDS_ON:** C3 (webhook must also reconcile amount)

---

## C2

- **ID:** C2
- **SEVERITY:** critical
- **TITLE:** Account takeover via forgot-password token leak
- **LOCATION:** `src/app/api/customer/forgot-password/route.ts:46-54`
- **CWE:** CWE-639 (Authorization Bypass Through User-Controlled Key), CWE-200 (Exposure of Sensitive Information)
- **REACHABLE_BY:** unauthenticated
- **IMPACT:** Full account takeover of any customer. Attacker resets victim's password and logs in.
- **DESCRIPTION:** After calling `requestPasswordReset(validEmail)` (which itself creates a token and sends an email internally), the route handler then issues a SECOND database query to fetch a reset token — but the query has NO `WHERE` clause. It selects the single newest reset token across the entire `exp_password_reset_tokens` table regardless of which customer it belongs to, then embeds that token in a reset link emailed to `validEmail` (the address the attacker typed). Under any concurrent reset request, the attacker can receive a victim's reset token in their own inbox.
- **EVIDENCE:**
  ```ts
  // src/app/api/customer/forgot-password/route.ts
  const { data: resetRecord, error: fetchError } = await supabase
    .from('exp_password_reset_tokens')
    .select('token, customer_id')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  // then emails resetLink containing resetRecord.token to validEmail
  ```
- **EXPLOIT:**
  1. Attacker monitors/triggers a victim's reset request (timing race, or just fire requests concurrently).
  2. Attacker POSTs `/api/customer/forgot-password` with their own email.
  3. Newest token in the DB may belong to the victim.
  4. Handler emails attacker's inbox a reset link containing the victim's token.
  5. Attacker resets victim's password → full account takeover.
- **FIX:** Delete lines 46-83 in `forgot-password/route.ts` entirely. `requestPasswordReset()` in `src/lib/auth/customer.ts:272-354` already creates the token and sends the correct email. The duplicated fetch-and-send in the route is dead-weight code that introduced this bug. Verify `REVOKE SELECT ON exp_password_reset_tokens FROM anon, authenticated;` is in effect (already in migration 013). Never read that table without `.eq('customer_id', ...)`.
- **EFFORT:** ~30min

---

## C3

- **ID:** C3
- **SEVERITY:** critical
- **TITLE:** Square webhook signature verification likely incorrect
- **LOCATION:** `src/app/api/webhooks/square/route.ts:9-24`
- **CWE:** CWE-347 (Improper Verification of Cryptographic Signature)
- **REACHABLE_BY:** unauthenticated (if verification is effectively a no-op)
- **IMPACT:** Forged payment status notifications, free orders if combined with C1.
- **DESCRIPTION:** The verifier computes `HMAC_SHA256(body, signatureKey).hex()` and compares to the `x-square-hmacsha256-signature` header. Square's documented signature scheme is not a plain HMAC-of-body — per Square docs, the signature incorporates the notification URL and uses base64 encoding, and Square ships a dedicated SDK verifier (`WebhooksHelper`). If the implementation here doesn't match Square's actual signature format, the verification will reject valid webhooks (or — worse — silently accept forged ones if the env var is unset). Secondary issues in the same handler:
  - Rate-limited by IP (`square-webhook:${ip}`, 20/min) — Square sends from a fixed pool; legit retries could trip this.
  - No replay protection (no `event.id` dedup table).
  - No amount-reconciliation against `exp_orders.order_total` (this is what turns C1 into "free product" rather than just an interesting bug).
- **EVIDENCE:**
  ```ts
  const expectedSignature = createHmac('sha256', signatureKey)
    .update(body)
    .digest('hex')
  return timingSafeEqual(signature, expectedSignature)
  ```
- **FIX:**
  1. Replace with Square's official `WebhooksHelper.verifySignature` (https://developer.squareup.com/docs/webhooks/step3validate).
  2. Persist processed `event.id` values for ≥24h to reject duplicates.
  3. Look up the order, compare `payment.total_money.amount` to stored `order_total` before marking paid.
- **EFFORT:** ~2h

---

## C4

- **ID:** C4
- **SEVERITY:** critical
- **TITLE:** Shippo webhook signature verification is OPTIONAL (fail-open)
- **LOCATION:** `src/app/api/shippo/webhook/route.ts:32-45`
- **CWE:** CWE-1188 (Insecure Default Initialization), CWE-347 (Improper Verification of Cryptographic Signature)
- **REACHABLE_BY:** unauthenticated (if env var unset OR header absent)
- **IMPACT:** Forged shipping status; arbitrary orders marked `shipped` / `delivered`; spam "Your order has been delivered!" emails to any address stored in `exp_orders.customer_email`.
- **DESCRIPTION:** The webhook guards signature verification behind `if (webhookSecret && signature)`. If `SHIPPO_WEBHOOK_SECRET` is unset (forgetful deploy, experimental branch) OR the `x-shippo-signature` header is absent (trivially controllable by attacker), the webhook is processed WITHOUT verification. Anyone who knows the URL can POST forged tracking updates. Comparison is also not timing-safe (`signature !== expectedSignature`).
- **EVIDENCE:**
  ```ts
  if (webhookSecret && signature) {
    // verify...
  }
  // falls through to processing if env var missing OR header absent
  ```
- **FIX:**
  1. Fail-closed: if `webhookSecret` is unset OR `signature` header is missing → return 401.
  2. Use `crypto.timingSafeEqual` for the comparison (pattern from `webhooks/square/route.ts:26-33`).
  3. Add startup-time validation that `SHIPPO_WEBHOOK_SECRET` is set in production.
- **EFFORT:** ~30min

---

# HIGH

---

## H1

- **ID:** H1
- **SEVERITY:** high
- **TITLE:** Admin MFA codes generated with `Math.random()`
- **LOCATION:** `src/lib/admin/mfa-store.ts:36`
- **CWE:** CWE-338 (Use of Cryptographically Weak Pseudo-Random Number Generator)
- **REACHABLE_BY:** requires-stolen-cookie (then enables admin compromise)
- **IMPACT:** Predictable MFA codes; brute-force / state-recovery attacks feasible.
- **DESCRIPTION:** `Math.random()` is V8's xorshift+ PRNG — not cryptographically secure. With enough observed outputs the internal state can be recovered and future codes predicted. Combined with 10^6 keyspace and H6 (per-instance rate limit), brute force becomes feasible.
- **EVIDENCE:**
  ```ts
  const code = Math.floor(100000 + Math.random() * 900000).toString()
  ```
- **FIX:**
  ```ts
  import { randomInt } from 'node:crypto'
  const code = randomInt(100000, 1000000).toString()
  ```
- **EFFORT:** ~5min
- **DEPENDS_ON:** H3 (no rate limit makes brute force practical)

---

## H2

- **ID:** H2
- **SEVERITY:** high
- **TITLE:** Admin MFA keyed by IP only, not by admin identity
- **LOCATION:** `src/lib/admin/mfa-store.ts:35,76`; `src/app/api/admin/verify-mfa/route.ts:14,24`
- **CWE:** CWE-306 (Missing Authentication for Critical Function)
- **REACHABLE_BY:** requires-stolen-cookie
- **IMPACT:** Shared-NAT attackers (home wifi, coffee shop) and X-Forwarded-For spoofers land on the admin's MFA slot.
- **DESCRIPTION:** The site uses a single shared `ADMIN_LOGIN_KEY` (no admin usernames). MFA codes are keyed only by client IP. Anyone sharing the admin's NAT or able to influence `X-Forwarded-For` lands on the same MFA storage slot, which creates collision and brute-force windows.
- **FIX:** Bind MFA code to a per-session nonce issued at `POST /api/admin/session` (signed like the session token). Require the nonce at both `send-mfa` and `verify-mfa`.
- **EFFORT:** ~3h

---

## H3

- **ID:** H3
- **SEVERITY:** high
- **TITLE:** `/api/admin/verify-mfa` has NO rate limit
- **LOCATION:** `src/app/api/admin/verify-mfa/route.ts:5-45`
- **CWE:** CWE-307 (Improper Restriction of Excessive Authentication Attempts)
- **REACHABLE_BY:** requires-stolen-cookie
- **IMPACT:** Unlimited MFA brute-force attempts.
- **DESCRIPTION:** Unlike every other admin route, the MFA verify endpoint calls `requireAdminApiSession(request)` with NO `rateLimitOptions`. Combined with H1 (Math.random 6-digit) and H6 (per-instance rate limiter), an attacker with a stolen admin cookie has unlimited attempts.
- **EVIDENCE:**
  ```ts
  // verify-mfa/route.ts
  const sessionCheck = await requireAdminApiSession(request)  // ← no rateLimitOptions
  ```
- **FIX:**
  ```ts
  requireAdminApiSession(request, {
    key: 'admin-mfa-verify',
    maxRequests: 5,
    windowMs: 5 * 60 * 1000,
  })
  ```
  Plus a hard DB-backed lockout after 5 failures per session.
- **EFFORT:** ~30min

---

## H4

- **ID:** H4
- **SEVERITY:** high
- **TITLE:** MFA memory-store fallback creates consistency holes
- **LOCATION:** `src/lib/admin/mfa-store.ts:62-69, 103-114`
- **CWE:** CWE-1004 (Sensitive Cookie Without 'HttpOnly' Flag) — conceptual cousin: sensitive facility with insecure fallback
- **REACHABLE_BY:** requires-stolen-cookie (enables bypass of audit trail)
- **IMPACT:** Per-instance state divergence; audit trail bypass.
- **DESCRIPTION:** If the Supabase insert in `createMFACode` fails, the code is silently stored in a per-instance `Map`. On Vercel serverless the verify call may land on a different instance where the Map is empty → legit admin locked out OR attacker's rate limits / DB audit trail bypassed depending on instance affinity. Catch blocks swallow errors and continue silently.
- **FIX:** Remove the in-memory fallback entirely. If Supabase is down, MFA should fail closed with a clear error.
- **EFFORT:** ~30min

---

## H5

- **ID:** H5
- **SEVERITY:** high
- **TITLE:** Legacy password hashes use non-timing-safe comparison
- **LOCATION:** `src/lib/auth/customer.ts:45`
- **CWE:** CWE-208 (Observable Timing Discrepancy)
- **REACHABLE_BY:** unauthenticated (timing side-channel)
- **IMPACT:** Username/password enumeration via timing on legacy accounts.
- **DESCRIPTION:** For any account still on the legacy `salt:hash` format (auto-upgrade-to-bcrypt only fires on successful login), the comparison `computedHash === hash` is a JavaScript string equality — not constant-time. The bcrypt path uses `bcrypt.compare` which is fine.
- **EVIDENCE:**
  ```ts
  const computedHash = createHmac('sha256', salt).update(password).digest('hex')
  const isValid = computedHash === hash   // ← string === string
  ```
- **FIX:**
  ```ts
  import { timingSafeEqual } from 'node:crypto'
  const a = Buffer.from(computedHash)
  const b = Buffer.from(hash)
  const isValid = a.length === b.length && timingSafeEqual(a, b)
  ```
- **EFFORT:** ~5min

---

## H6

- **ID:** H6
- **SEVERITY:** high
- **TITLE:** Rate limiter is per-instance, in-memory only
- **LOCATION:** `src/lib/rate-limit.ts:14-67`
- **CWE:** CWE-770 (Allocation of Resources Without Limits or Throttling)
- **REACHABLE_BY:** unauthenticated
- **IMPACT:** Every rate-limit-based defense in the app is effectively bypassable across Vercel instances.
- **DESCRIPTION:** The store is a module-level `Map`. On Vercel serverless each cold-start instance has its own. Effective allowed QPS = `configured_limit × num_warm_instances`. For login, signup, MFA, search, intake — anywhere with many concurrent users — an attacker distributing requests across instances bypasses the limit nearly entirely. The code acknowledges this in a comment but doesn't fix it.
- **FIX:** Move to Upstash Redis, Vercel KV, or a Supabase-backed counter. The pattern in `mfa-store.ts` (Supabase table) shows the team knows how.
- **EFFORT:** ~4h

---

## H7

- **ID:** H7
- **SEVERITY:** high
- **TITLE:** SVG upload sanitization incomplete (stored XSS in public bucket)
- **LOCATION:** `src/app/api/admin/catalog/media/upload/route.ts:65`
- **CWE:** CWE-79 (Improper Neutralization of Input During Web Page Generation)
- **REACHABLE_BY:** requires-stolen-cookie (admin) — amplifies into customer XSS
- **IMPACT:** Persistent customer-side JavaScript execution under site origin.
- **DESCRIPTION:** The SVG sanitizer only checks for `<script` and `javascript:` substrings. Misses: `onerror=`, `onload=`, `<foreignObject>`, `<use href=...>`, event-handler attributes (`<svg onclick=...>`), `data:text/html,...` payloads. Files land in the PUBLIC `product-media` bucket (migration 029). Direct navigation or `<embed>`/`<object>`/`<iframe>` embedding causes JS to execute under the site origin. CSP includes `'unsafe-inline'` and `'unsafe-eval'` for scripts (`next.config.ts:5`) so inline-script payloads also execute.
- **EVIDENCE:**
  ```ts
  if (/<script[\s>]/i.test(text) || /javascript\s*:/i.test(text)) {
    return NextResponse.json({ error: 'SVG file contains disallowed script content.' }, { status: 400 })
  }
  ```
- **FIX:** Either ban SVG entirely (drop from `ALLOWED_MIME_TYPES` and migration 029), or run each upload through DOMPurify server-side with the SVG profile. Tighten CSP to a nonce-based policy.
- **EFFORT:** ~1h

---

## H8

- **ID:** H8
- **SEVERITY:** high
- **TITLE:** `/api/shippo/rates` and `/api/shippo/validate-address` have NO rate limit
- **LOCATION:** `src/app/api/shippo/rates/route.ts`; `src/app/api/shippo/validate-address/route.ts`
- **CWE:** CWE-770
- **REACHABLE_BY:** unauthenticated
- **IMPACT:** Cost abuse — Shippo API bill inflation; potential API suspension.
- **DESCRIPTION:** Both endpoints call paid Shippo APIs without importing or invoking `rateLimit`. An attacker can fan out requests to drain the Shippo quota / run up bills.
- **FIX:** Add `rateLimit('shippo-rates:' + ip, 20, 60_000)` and require a valid cart / checkout session token before calling.
- **EFFORT:** ~30min

---

## H9

- **ID:** H9
- **SEVERITY:** high
- **TITLE:** Admin session token cannot be revoked per-session
- **LOCATION:** `src/lib/admin/session.ts:13-18`
- **CWE:** CWE-613 (Insufficient Session Expiration)
- **REACHABLE_BY:** requires-stolen-cookie
- **IMPACT:** Stolen admin cookie cannot be invalidated without rotating `ADMIN_LOGIN_KEY` (which kicks out every admin).
- **DESCRIPTION:** The session token format is `v1.{exp}.HMAC(adminKey)` — there is no identifier, no JTI, no per-session DB record. Any valid token is indistinguishable from any other. Customers have `exp_customer_sessions`; admins have no equivalent.
- **FIX:** Create `exp_admin_sessions` table. Store token hash + IP + UA + `created_at` + `revoked_at`. Verify against the table on every admin request. Add a "revoke my other sessions" admin UI.
- **EFFORT:** ~4h

---

## H10

- **ID:** H10
- **SEVERITY:** high
- **TITLE:** No `middleware.ts` — admin auth relies on every route remembering
- **LOCATION:** project root (file does not exist)
- **CWE:** CWE-306 (Missing Authentication for Critical Function)
- **REACHABLE_BY:** unauthenticated (when a new route forgets)
- **IMPACT:** A newly added admin API route that omits `requireAdminApiSession()` exposes admin functionality to the public.
- **DESCRIPTION:** No Next.js middleware exists. Admin auth is enforced by `requireAdminApiSession()` called at the top of each handler. All 36 admin API routes do call it today, but new routes can silently forget. Page-level admin auth lives only in `src/app/admin/(panel)/layout.tsx:78`.
- **FIX:** Add `src/middleware.ts` that blocks `/admin/*` and `/api/admin/*` unless the `rr_admin_session` cookie verifies. Belt-and-suspenders alongside per-route checks.
- **EFFORT:** ~1h

---

# MEDIUM

---

## M1

- **ID:** M1
- **SEVERITY:** medium
- **TITLE:** Search query interpolated into PostgREST `or` filter string
- **LOCATION:** `src/app/api/search/route.ts:55-63`
- **CWE:** CWE-20 (Improper Input Validation), CWE-943 (Improper Control of Internal Data Rep)
- **REACHABLE_BY:** unauthenticated
- **IMPACT:** Filter-syntax injection; possible data-shape probing.
- **DESCRIPTION:** `sanitizeSearchQuery` strips `%`, `_`, `\`, nulls — but NOT `,`, `.`, `(`, `)`. These are PostgREST filter syntax chars. A query like `a,id.eq.<uuid>` rewrites the OR chain. Not trivially weaponizable for data exfiltration (extra conditions, not fewer), but a fragile injection point and could enable product-ID existence probing.
- **FIX:** Strip `[,.()]` too, or use Supabase's typed filter form: `.or([{ title: { ilike: '%X%' } }, ...])`.
- **EFFORT:** ~30min

---

## M2

- **ID:** M2
- **SEVERITY:** medium
- **TITLE:** Logout lacks CSRF protection
- **LOCATION:** `src/app/api/customer/logout/route.ts`
- **CWE:** CWE-352 (Cross-Site Request Forgery)
- **REACHABLE_BY:** unauthenticated (via CSRF)
- **IMPACT:** Force-logout annoyance.
- **DESCRIPTION:** Any third-party site can POST to `/api/customer/logout` via top-level form navigation (`SameSite=Lax` allows top-level POSTs).
- **FIX:** Either require a custom header (e.g., `X-Requested-With`) that cannot be sent cross-origin without CORS preflight, or set cookies to `SameSite=Strict`.
- **EFFORT:** ~15min

---

## M3

- **ID:** M3
- **SEVERITY:** medium
- **TITLE:** Cart-capture endpoint accepts unbounded email spam
- **LOCATION:** `src/app/api/cart/capture/route.ts`
- **CWE:** CWE-770
- **REACHABLE_BY:** unauthenticated
- **IMPACT:** DB pollution with fake-email rows; GDPR cleanup burden.
- **DESCRIPTION:** No IP rate limit; per-email dedup only. An attacker can fill `exp_cart_captures` with thousands of fake-email rows.
- **FIX:** Add `rateLimit('cart-capture:' + ip, 10, 60 * 60 * 1000)`.
- **EFFORT:** ~15min

---

## M4

- **ID:** M4
- **SEVERITY:** medium
- **TITLE:** Newsletter re-subscribe bypasses unsubscribe
- **LOCATION:** `src/app/api/newsletter/subscribe/route.ts:42-57`
- **CWE:** CWE-927 (Use of Wrong Permission Track)
- **REACHABLE_BY:** unauthenticated
- **IMPACT:** Victim can be repeatedly resubscribed to newsletter after opting out.
- **DESCRIPTION:** `upsert` with `subscribed: true, unsubscribed_at: null` overwrites a previous opt-out. Bounded by per-email rate limit (3/day), but still a privacy violation vector.
- **FIX:** If a row exists with `unsubscribed_at` set within the last N days, do not silently re-subscribe; require an explicit confirmation email.
- **EFFORT:** ~30min

---

## M5

- **ID:** M5
- **SEVERITY:** medium
- **TITLE:** HTML email injection (admin and customer notifications)
- **LOCATION:** `src/app/api/custom-orders/route.ts:152-160`; `src/app/api/custom-orders/[id]/route.ts:55-67`
- **CWE:** CWE-79
- **REACHABLE_BY:** unauthenticated (for admin-bound emails); authenticated-admin (for customer-bound emails)
- **IMPACT:** Email layout disruption, tracking pixels, BECDI / phishing setup.
- **DESCRIPTION:** Customer-supplied `customerName`, `customerEmail`, `itemType`, `description` are concatenated into HTML email bodies without escaping. Email clients usually strip `<script>`, but `<img>`, layout-breaking HTML, and tracking pixels all work. Customer-controlled input going to admin inboxes is the worse direction (spear-phishing setup).
- **FIX:** Use `safeHtmlEscape` (already exists in `src/lib/validate.ts:61-68`) on every interpolated value, or migrate to React Email / MJML templates.
- **EFFORT:** ~1h

---

## M6

- **ID:** M6
- **SEVERITY:** medium
- **TITLE:** Custom-order intake doesn't verify artwork ownership
- **LOCATION:** `src/app/api/custom-orders/route.ts:80-82`
- **CWE:** CWE-639
- **REACHABLE_BY:** unauthenticated
- **IMPACT:** Cross-customer artwork path referencing; limited today but a design deficiency.
- **DESCRIPTION:** The `path` regex `UPLOAD_PATH_RE` validates format but not that THIS submitter uploaded THIS file. An attacker can submit an order referencing another user's uploaded artwork path. Limited impact today (admin sees it in review, doesn't forward to attacker), but a deficiency.
- **FIX:** When `/api/custom-orders/upload` runs, also insert a row in `exp_artwork_uploads` with the path + a per-session cookie / signed token. On intake, verify the token ↔ path binding before accepting.
- **EFFORT:** ~2h

---

## M7

- **ID:** M7
- **SEVERITY:** medium
- **TITLE:** Admin MFA `secure` flag uses different env var than rest of app
- **LOCATION:** `src/app/api/admin/verify-mfa/route.ts:34`
- **CWE:** CWE-614 (Sensitive Cookie in HTTPS Session Without 'Secure' Attribute)
- **REACHABLE_BY:** MITM with env-var mismatch
- **IMPACT:** Cookie could be set without `Secure`, allowing MITM to capture.
- **DESCRIPTION:** Uses `process.env.NEXT_PUBLIC_APP_ENV === 'production'` while every other cookie uses `process.env.NODE_ENV === 'production'`. If those diverge in any deploy, the MFA cookie could be set without `Secure`.
- **FIX:** Standardize on a single helper, e.g., `isProd()` returning `process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production'`.
- **EFFORT:** ~10min

---

## M8

- **ID:** M8
- **SEVERITY:** medium
- **TITLE:** Customer reset-token update isn't transactional
- **LOCATION:** `src/lib/auth/customer.ts:399-413`
- **CWE:** CWE-362 (Concurrent Execution using Shared Resource)
- **REACHABLE_BY:** victim with concurrent reset requests
- **IMPACT:** Reset token remains reusable after password change (race).
- **DESCRIPTION:** Password is updated, then the token-marked-used update could fail silently, leaving the token reusable. Low risk because the password has already changed, but violates intent.
- **FIX:** Wrap both writes in a single Postgres function / Supabase RPC, or use a single UPDATE that conditionally marks the token used only when the password update succeeds.
- **EFFORT:** ~1h

---

## M9

- **ID:** M9
- **SEVERITY:** medium
- **TITLE:** Long-lived customer session (30 days, no concurrent-session limit)
- **LOCATION:** `src/lib/auth/customer.ts:6, 238-241`
- **CWE:** CWE-613
- **REACHABLE_BY:** requires-stolen-cookie
- **IMPACT:** Stolen cookie works up to 30 days.
- **DESCRIPTION:** Every `verifyCustomerSession` call updates `last_activity_at` but does NOT extend `expires_at`. So 30 days from creation regardless of activity. No concurrent-session limit. Acceptable but tighter than industry standard.
- **FIX:** Add sliding expiration (renew `expires_at` on activity if remaining window < 1 day), or shorten to 7 days. Optional: cap concurrent sessions per customer.
- **EFFORT:** ~1h

---

## M10

- **ID:** M10
- **SEVERITY:** medium
- **TITLE:** Inconsistent cookie SameSite attribute across routes
- **LOCATION:** `src/app/api/customer/login/route.ts:47`; `src/app/api/admin/session/route.ts:61`; `src/app/api/admin/verify-mfa/route.ts:35`
- **CWE:** CWE-1004 (conceptual cousin)
- **REACHABLE_BY:** CSRF preconditions
- **IMPACT:** Inconsistent CSRF posture; admin session cookie at `Lax` allows some cross-site POSTs.
- **DESCRIPTION:** Customer session cookie uses `sameSite: 'lax'`; admin MFA uses `sameSite: 'strict'`; admin session uses `sameSite: 'lax'`. Consider `strict` for admin session.
- **FIX:** Standardize. Admin session → `Strict`. Customer session → keep `Lax` for usability (login flows from email links), but require custom header on state-changing endpoints.
- **EFFORT:** ~30min

---

# LOW

---

## L1

- **ID:** L1
- **SEVERITY:** low
- **TITLE:** `getClientIp` trusts `X-Forwarded-For` blindly
- **LOCATION:** `src/lib/rate-limit.ts:90-112`
- **CWE:** CWE-441 (Unintended Proxy)
- **DESCRIPTION:** Fine on Vercel (Vercel overwrites the header), but if the app is ever run behind a different proxy that *appends* instead of *sets*, the first hop becomes attacker-controlled.
- **FIX:** Document the assumption with an assert, or check `process.env.VERCEL` and refuse to run without it.

## L2

- **ID:** L2
- **SEVERITY:** low
- **TITLE:** Admin media upload filename uses `Math.random()` for uniqueness
- **LOCATION:** `src/app/api/admin/catalog/media/upload/route.ts:76`
- **CWE:** CWE-338
- **DESCRIPTION:** Same anti-pattern as H1 but for filename uniqueness rather than security-critical randomness.
- **FIX:** `randomBytes(8).toString('hex')`.

## L3

- **ID:** L3
- **SEVERITY:** low
- **TITLE:** `/api/admin/session` GET leaks admin cookie validity
- **LOCATION:** `src/app/api/admin/session/route.ts:20-32`
- **CWE:** CWE-200
- **DESCRIPTION:** Returns `{ authenticated: true/false }`. Minor info disclosure, enables targeted phishing.
- **FIX:** Require the request to come from the admin login page (same-origin check or CSRF token).

## L4

- **ID:** L4
- **SEVERITY:** low
- **TITLE:** Recently-viewed track accepts any product ID
- **LOCATION:** `src/app/api/recently-viewed/route.ts`
- **CWE:** CWE-20
- **DESCRIPTION:** Accepts archived/inactive product IDs and writes a row. Mild DB pollution.
- **FIX:** Validate product exists and `is_active = true` before tracking.

## L5

- **ID:** L5
- **SEVERITY:** low
- **TITLE:** CSP allows `'unsafe-eval'` and `'unsafe-inline'` for scripts
- **LOCATION:** `next.config.ts:5`
- **CWE:** CWE-79
- **DESCRIPTION:** Next.js App Router typically only requires `'unsafe-inline'` for styles, not scripts. Loosening here amplifies H7.
- **FIX:** Migrate to a nonce-based CSP using Next.js's `headers()` + `generateNonce()` pattern.

## L6

- **ID:** L6
- **SEVERITY:** low
- **TITLE:** Verbose error logging may leak env values / connection strings
- **LOCATION:** Throughout (e.g., `console.error('[custom-orders:insert]', error?.message)`)
- **CWE:** CWE-532 (Insertion of Sensitive Information into Log File)
- **DESCRIPTION:** Exception messages logged verbatim could leak env values / DB connection strings to Vercel logs.
- **FIX:** Wrap in a sanitizing logger that strips known-sensitive patterns.

## L7

- **ID:** L7
- **SEVERITY:** low
- **TITLE:** RLS policy references non-existent JWT claim
- **LOCATION:** `supabase/migrations/039_rls_lockdown.sql:20`
- **CWE:** CWE-285 (Improper Authorization)
- **DESCRIPTION:** References `current_setting('request.jwt.claim.session_token', true)`. The app uses a custom cookie session, not Supabase Auth JWTs, so this claim is never set. The OR branch is dead code (fails closed — safe, but indicates confusion about the auth model).
- **FIX:** Remove the dead OR branch. Document that all customer reads go through the service role via API routes.

---

# STRENGTHS (preserve during refactors)

| Pattern | Location |
|---|---|
| Customer tables have `REVOKE ALL FROM anon, authenticated` | `supabase/migrations/013_customer_data_rls_lockdown.sql` |
| `customer-artwork` bucket is private; admin fetches via 1h signed URLs | `supabase/migrations/031_customer_artwork_bucket.sql` |
| Customer file upload does magic-byte verification + MIME allowlist + extension allowlist + UUID folder + size cap | `src/app/api/custom-orders/upload/route.ts` |
| Admin key comparison uses `timingSafeEqual` | `src/lib/admin/auth.ts:42-45` |
| Bcrypt cost 10 for customer passwords; legacy-hash auto-upgrade on login | `src/lib/auth/customer.ts:25-63` |
| All 36 admin API routes call `requireAdminApiSession` | `src/app/api/admin/**/route.ts` |
| Password reset endpoint returns generic "if an account exists" | `src/lib/auth/customer.ts:287-292` |
| Customer login/signup/forgot-password have per-IP and per-email rate limits | `src/app/api/customer/**/route.ts` |
| HSTS, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy set globally | `next.config.ts:18-38` |
| Customer session cookies are `httpOnly`, `secure` in prod, `sameSite=lax` | `src/app/api/customer/login/route.ts:44-50` |
| Order tracking page requires order ID AND `guest_tracking_token` with expiry | `src/app/orders/[id]/page.tsx:34-55` |
| Admin audit log written for every destructive / money-touching action | `src/lib/admin/audit.ts` |

---

# PRIORITIZED FIX ORDER

| Order | Finding(s) | Rationale | Effort |
|---|---|---|---|
| 1 | C1 | Direct revenue loss; one curl. | ~2h |
| 2 | C2 | Silent customer account takeover. | ~30min |
| 3 | C3 + C4 | Closes the integrity loop on C1. | ~3h |
| 4 | H1 + H3 | Admin compromise enabler. | ~1h |
| 5 | H6 | Undermines every other rate-limit-based defense. | ~4h |
| 6 | H7 | Pair with H3 for full customer XSS. | ~1h |
| 7 | All Medium / Low | Hardening & defense in depth. | ~1 day |

**Total critical-path effort:** ~1 day to close every Critical and High finding.

---

# APPENDIX — Files Touched by Fixes

| File | Findings Addressed |
|---|---|
| `src/app/api/square/checkout/route.ts` | C1 |
| `src/app/api/webhooks/square/route.ts` | C3, C1 (amount reconciliation) |
| `src/app/api/webhooks/shippo/route.ts` | C4 |
| `src/app/api/customer/forgot-password/route.ts` | C2 |
| `src/lib/admin/mfa-store.ts` | H1, H2, H4 |
| `src/app/api/admin/verify-mfa/route.ts` | H2, H3, M7 |
| `src/lib/auth/customer.ts` | H5, M8, M9 |
| `src/lib/rate-limit.ts` | H6 |
| `src/app/api/admin/catalog/media/upload/route.ts` | H7, L2 |
| `src/app/api/shippo/rates/route.ts`, `src/app/api/shippo/validate-address/route.ts` | H8 |
| `src/lib/admin/session.ts` + new `exp_admin_sessions` migration | H9 |
| `src/middleware.ts` (NEW) | H10 |
| `src/app/api/search/route.ts` | M1 |
| `src/app/api/customer/logout/route.ts` | M2 |
| `src/app/api/cart/capture/route.ts` | M3 |
| `src/app/api/newsletter/subscribe/route.ts` | M4 |
| `src/app/api/custom-orders/route.ts`, `src/app/api/custom-orders/[id]/route.ts` | M5, M6 |
| `next.config.ts` | L5 |
| `supabase/migrations/039_rls_lockdown.sql` | L7 |

---

*End of report. For the visual / human-facing version of this document, see `docs/SECURITY_AUDIT_REPORT.html`.*
