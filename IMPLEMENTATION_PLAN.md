# Implementation Plan: Homepage Product Card, Future Products Page, and Notify Form

> **Author:** Senior Software Engineer (AI Assistant)
> **Date:** August 6, 2026
> **Mode:** Plan → Act (ACT MODE confirmed)
> **Scope:** Three interrelated features for Ruby's Relics Studio storefront
> **Security Priority:** Highest — all public-facing endpoints hardened with OWASP-first principles

---

## Table of Contents

1. [Overview](#1-overview)
2. [Feature 1: Embedded "Shop All" Card on Homepage](#2-feature-1-embedded-shop-all-card-on-homepage)
3. [Feature 2: Future Products Roadmap Page](#3-feature-2-future-products-roadmap-page)
4. [Feature 3: "Notify for Future Products" Form](#4-feature-3-notify-for-future-products-form)
5. [Feature 4: Admin Management — Future Products (Catalog Sub-Module)](#5-feature-4-admin-management--future-products-catalog-sub-module)
6. [Feature 5: Homepage "Notify" Card](#6-feature-5-homepage-notify-card)
7. [Security Checklist](#7-security-checklist)
8. [Testing Plan](#8-testing-plan)
9. [Analytics Events](#9-analytics-events)
10. [Dependencies](#10-dependencies)
11. [Deployment & Rollout](#11-deployment--rollout)
12. [File Inventory](#12-file-inventory)

---

## 1. Overview

This document details the implementation of three interconnected features:

1. **Shop-All Embedded Card** — A homepage section that displays a configurable number of products with client-side filters (category, price, ready-made/customizable), plus a "View All" button linking to `/shop/all` (preserving filter state) and a "Future Products" button linking to `/future-products`.

2. **Future Products Page** — A new `/future-products` route displaying a roadmap of upcoming offerings, managed entirely via the admin panel (Catalog → Future Products). Includes per-item fields: title, description (rich text), estimated release date, category, media, status (admin-configurable dropdown), visibility toggle, and sort order.

3. **Notify for Future Products Form** — A reusable email capture form (email required, name, idea text, comments) appearing on both the homepage (as a toggleable card) and the Future Products page. Submissions are stored in the existing `exp_newsletter_subscribers` table with `source = 'future_products_interest'` and are viewable/moderable in the admin response tab.

### Key Design Principles

- **Revertibility:** Every new homepage section (`shop_all_preview`, `future_products_notify`) is toggleable via the standard homepage visibility panel. Turning it off instantly removes it from the storefront with zero code changes.
- **Admin-first:** All business-critical content (product count, roadmap items, statuses, form toggle) is admin-managed — no hardcoded values in frontend components.
- **OWASP-first security:** Rate limiting, input sanitization, output escaping, CSRF-safe patterns, consent logging, and defense-in-depth all applied.
- **UX-first:** Client-side filtering, persistent filter state on navigation, responsive grid, `prefers-reduced-motion` compliance, proper ARIA labels.

---

## 2. Feature 1: Embedded "Shop All" Card on Homepage

### 2.1 New Homepage Section Key: `shop_all_preview`

This section is **content-managed** (like `hero_collage`) — meaning the admin can configure:
- `product_count` (number of products to display, default: 6)
- `show_filters` (boolean, whether to show filter controls)
- `heading` (optional override)
- `subheading` (optional override)

The section is **toggleable** via the standard homepage visibility panel — turning it off hides the entire card instantly.

### 2.2 Database Changes

**No new tables.** This section uses the existing `exp_homepage_sections` table.

**New seed entry** (in `supabase/seed/006_future_products_seed.sql`):
```sql
insert into exp_homepage_sections (section_key, is_visible, sort_order, content)
values ('shop_all_preview', true, 75, '{"product_count": 6, "show_filters": true}')
on conflict (section_key) do nothing;
```

Placement: Between `featured_collections` (sort_order 40) and `fresh_from_forge` (sort_order 50), so sort_order 75 places it before `materials_teaser` (60). Adjust as needed.

### 2.3 Homepage Page Integration

**File: `src/app/page.tsx`**

Add `shop_all_preview` section rendering between `featured_collections` and `fresh_from_forge`:

```tsx
{/* 7a. Shop All Preview (embedded shop-all card) */}
{sections['shop_all_preview']?.is_visible !== false && (
  <HomepageProductGrid
    products={products}          // fetched server-side via getAllActiveProducts()
    categories={categories}     // already fetched for category_grid
    content={sections['shop_all_preview']?.content}
    sectionKey="shop_all_preview"
  />
)}
```

**Server-side data fetching** — add `getAllActiveProducts()` to the parallel `Promise.all` in the existing `HomePage()` function. This re-uses the exact same data source as `/shop/all`, ensuring consistency.

### 2.4 New Component: `HomepageProductGrid`

**File: `src/components/home/HomepageProductGrid.tsx`**

A **client component** (`'use client'`) that:
- Receives `products: DbProduct[]`, `categories: TaxonomyEntry[]`, and `content` as props
- Renders the section header (heading/subheading from content or fallback defaults)
- Renders **filter controls** above the product grid:
  - **Category filter**: Multi-select chip group or dropdown (all categories + "All")
  - **Price range slider**: Min/max based on product prices
  - **Ready-made toggle**: Show/hide ready-made products
  - **Customizable toggle**: Show/hide customizable products
  - **Search box**: Text input filtering by product title/description
- Renders the **product grid** using the same card styling as `/shop/all` (image, category chip, title, description, price)
- Renders **"View All" button**: Links to `/shop/all` with current filter state encoded as URL query params
- Renders **"Future Products" button**: Links to `/future-products`

**Filter state**: Managed via React `useState` with `useMemo` for filtered product computation. Filter state is NOT persisted in URL on the homepage card (it's in-place filtering), but when "View All" is clicked, the current filters are encoded into the `/shop/all` URL.

**Props interface:**
```ts
interface HomepageProductGridProps {
  products: DbProduct[]
  categories: TaxonomyEntry[]
  content: Record<string, unknown> | null | undefined
  sectionKey: string
}
```

**Content parsing** (same pattern as `ShortcutSection`):
```ts
const productCount = typeof content?.product_count === 'number' ? content.product_count : 6
const showFilters = content?.show_filters !== false
const heading = typeof content?.heading === 'string' && content.heading.trim()
  ? content.heading
  : 'Shop All Products'
const subheading = typeof content?.subheading === 'string' ? content.subheading : ''
```

### 2.5 Admin Homepage Integration

**File: `src/app/api/admin/homepage/sections/route.ts`**
- Add `'shop_all_preview'` to `ALL_SECTION_KEYS` array
- Add `'shop_all_preview'` to the seed order is handled by `sort_order` in the DB

**File: `src/app/api/admin/homepage/sections/[key]/route.ts`**
- Add `'shop_all_preview'` to `ALL_SECTION_KEYS` set
- Add a new branch in the `PATCH` handler (between the `hero_collage` branch and the simple section branch) that accepts a content payload with `product_count`, `show_filters`, `heading`, `subheading`, and `is_visible`
- This branch validates that `product_count` is a positive integer (clamp to 1–50), `show_filters` is boolean, and strings are sanitized

**File: `src/app/admin/(panel)/homepage/page.tsx`**
- Add `'shop_all_preview'` to `SECTION_ORDER` array
- Add `SECTION_META['shop_all_preview']` = `{ title: 'Shop All Preview', description: 'Product grid card showing a configurable number of products with filters. Links to the full shop-all page and the future products roadmap.' }`
- Add `shop_all_preview` to `TILE_KEYS` set OR add a dedicated editor panel (like hero collage)

**Recommended approach:** Add a dedicated editor panel similar to the Hero Collage editor, since the content schema differs from tile sections (no `items` array). The editor would include:
- Number-of-products input field
- "Show filters" toggle
- Optional heading/subheading text fields
- "View All" CTA button text (optional custom label)

### 2.6 `/shop/all` Page Updates

**File: `src/app/shop/all/page.tsx`**

Add support for the new query params (so filter state from the homepage card is preserved):
- `?category=<key>` — filter by category key
- `?price_min=<number>&price_max=<number>` — filter by price range
- `?ready_made=true|false` — filter by ready-made status
- `?customizable=true|false` — filter by customizable status
- `?search=<string>` — text search in title/description

**Important:** The existing `?process=<key>` param must continue to work for backward compatibility.

The homepage "View All" button builds the URL by encoding the current filter state:
```tsx
const buildViewAllUrl = () => {
  const params = new URLSearchParams()
  if (activeCategory !== 'all') params.set('category', activeCategory)
  if (priceRange.min > minPrice) params.set('price_min', String(priceRange.min))
  if (priceRange.max < maxPrice) params.set('price_max', String(priceRange.max))
  if (!showReadyMade) params.set('ready_made', 'false')
  if (!showCustomizable) params.set('customizable', 'false')
  if (searchTerm) params.set('search', searchTerm)
  return `/shop/all${params.toString() ? `?${params.toString()}` : ''}`
}
```

### 2.7 Revert Path

To revert Feature 1:
1. In the admin homepage panel, toggle `shop_all_preview` → `is_visible = false`
2. (Optional, permanent removal): Remove `'shop_all_preview'` from `ALL_SECTION_KEYS` in both API route files, remove from `SECTION_ORDER` and `SECTION_META` in the admin page, remove the rendering block in `page.tsx`, and delete the seed entry.

---

## 3. Feature 2: Future Products Roadmap Page

### 3.1 Database Migration

**File: `supabase/migrations/055_future_products_roadmap.sql`**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 055: Future Products Roadmap
-- Supports the /future-products public page and admin CRUD management.
-- ─────────────────────────────────────────────────────────────────────────────

-- Statuses table — admin-managed dropdown values (not hardcoded)
create table if not exists exp_future_product_statuses (
  id          uuid        primary key default gen_random_uuid(),
  label       text        not null,
  color       text        not null default '#6A7AC4',
  sort_order  integer     not null default 0,
  is_default  boolean     not null default false,
  is_visible  boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists idx_future_product_statuses_label on exp_future_product_statuses(label);
create index if not exists idx_future_product_statuses_order on exp_future_product_statuses(sort_order);

-- Future products table — roadmap items
create table if not exists exp_future_products (
  id                    uuid        primary key default gen_random_uuid(),
  title                 text        not null,
  description           text,
  estimated_release     date,
  category_key          text        references exp_taxonomy(key),
  media_url             text,
  media_alt             text,
  status_id             uuid        references exp_future_product_statuses(id),
  is_visible            boolean     not null default true,
  sort_order            integer     not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_future_products_visible on exp_future_products(is_visible);
create index if not exists idx_future_products_status on exp_future_products(status_id);
create index if not exists idx_future_products_sort on exp_future_products(sort_order);

-- Extend exp_newsletter_subscribers for future-product interest tracking
alter table exp_newsletter_subscribers
  add column if not exists name              text,
  add column if not exists interest_details  jsonb not null default '{}'::jsonb,
  add column if not exists response_status   text not null default 'new'
    check (response_status in ('new', 'viewed', 'responded', 'denied')),
  add column if not exists denial_reason     text;

-- RLS: public can read visible future products + active statuses
alter table exp_future_products enable row level security;
alter table exp_future_product_statuses enable row level security;

create policy "public read visible future products"
  on exp_future_products for select
  to anon, authenticated
  using (is_visible = true);

create policy "public read visible future product statuses"
  on exp_future_product_statuses for select
  to anon, authenticated
  using (is_visible = true);

-- Newsletter subscribers: already locked to service_role only (no anon access)
-- New columns are server-side only; no additional policies needed.

-- updated_at triggers
create trigger trg_exp_future_products_updated_at
  before update on exp_future_products
  for each row execute function exp_set_updated_at();

create trigger trg_exp_future_product_statuses_updated_at
  before update on exp_future_product_statuses
  for each row execute function exp_set_updated_at();
```

**RLS Analysis:**
- `exp_future_products` — public read of visible rows only; writes restricted to service_role (anon has NO write access, matching the `exp_newsletter_subscribers` pattern)
- `exp_future_product_statuses` — public read of visible rows only
- New `exp_newsletter_subscribers` columns — no additional RLS needed since the table is already `REVOKE ALL ... FROM anon, authenticated; GRANT ALL ... TO service_role`

### 3.2 Seed Data

**File: `supabase/seed/006_future_products_seed.sql`**

```sql
-- Seed future product statuses (admin can add/edit/remove via admin panel)
insert into exp_future_product_statuses (label, color, sort_order, is_default, is_visible) values
  ('Planned',           '#6A7AC4', 10, true,  true),
  ('In Development',    '#F59E0B', 20, false, true),
  ('Under Review',      '#EF4444', 30, false, true),
  ('Completed',         '#10B981', 40, false, true),
  ('Discontinued',      '#6B7280', 50, false, true)
on conflict do nothing;

-- Seed example future products
insert into exp_future_products
  (title, description, estimated_release, category_key, media_url, media_alt, status_id, is_visible, sort_order)
values
  ('Engraved Jewelry',
   'Delicate engraved pendants, rings, and bracelets — coming soon.',
   '2027-03-01',
   'engraved_drinkware',  -- placeholder; admin can update category
   null, '✨',
   (select id from exp_future_product_statuses where label = 'Planned'),
   true, 10),
  ('Wooden Home Decor',
   'Engraved wooden signs, cutting boards, and decorative panels.',
   '2027-06-01',
   null, null, '🪵',
   (select id from exp_future_product_statuses where label = 'In Development'),
   true, 20)
on conflict do nothing;

-- Seed homepage sections
insert into exp_homepage_sections (section_key, is_visible, sort_order, content) values
  ('shop_all_preview',         true,  75, '{"product_count": 6, "show_filters": true}'),
  ('future_products_notify',   true, 105, '{}')
on conflict (section_key) do nothing;
```

### 3.3 Types

**File: `src/types/index.ts`** — Add:

```typescript
export interface FutureProductStatus {
  id: string
  label: string
  color: string
  sort_order: number
  is_default: boolean
  is_visible: boolean
  created_at: string
  updated_at: string
}

export interface FutureProduct {
  id: string
  title: string
  description: string | null
  estimated_release: string | null  // ISO date string
  category_key: string | null
  media_url: string | null
  media_alt: string | null
  status_id: string | null
  is_visible: boolean
  sort_order: number
  created_at: string
  updated_at: string
  // Joined display fields
  status_label?: string | null
  status_color?: string | null
  category_display_name?: string | null
  category_slug?: string | null
}
```

### 3.4 Query Functions

**File: `src/lib/supabase/queries/future-products.ts`** (NEW)

```typescript
import { getSupabaseAdmin } from '@/lib/supabase/client'
import type { FutureProduct, FutureProductStatus } from '@/types'

const supabase = getSupabaseAdmin()

/**
 * Fetch all visible future products (ordered by sort_order).
 * Joins status labels, category display names.
 */
export async function getFutureProducts(): Promise<FutureProduct[]> {
  const { data, error } = await supabase
    .from('exp_future_products')
    .select(`
      id, title, description, estimated_release,
      category_key, media_url, media_alt,
      status_id, is_visible, sort_order,
      exp_future_product_statuses!inner (label, color),
      exp_taxonomy!category_key (display_name, slug)
    `)
    .eq('is_visible', true)
    .order('sort_order', { ascending: true })

  if (error || !data) {
    console.error('[future-products:get]', error?.message)
    return []
  }

  return data.map(row => {
    const status = Array.isArray(row.exp_future_product_statuses)
      ? row.exp_future_product_statuses[0]
      : row.exp_future_product_statuses
    const category = Array.isArray(row.exp_taxonomy)
      ? row.exp_taxonomy[0]
      : row.exp_taxonomy
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      estimated_release: row.estimated_release,
      category_key: row.category_key,
      media_url: row.media_url,
      media_alt: row.media_alt,
      status_id: row.status_id,
      is_visible: row.is_visible,
      sort_order: row.sort_order,
      created_at: row.created_at,
      updated_at: row.updated_at,
      status_label: status?.label ?? null,
      status_color: status?.color ?? null,
      category_display_name: category?.display_name ?? null,
      category_slug: category?.slug ?? null,
    }
  }) as FutureProduct[]
}

/**
 * Fetch all visible status values (for dropdowns on the public page).
 */
export async function getFutureProductStatuses(): Promise<FutureProductStatus[]> {
  const { data, error } = await supabase
    .from('exp_future_product_statuses')
    .select('id, label, color, sort_order, is_default, is_visible, created_at, updated_at')
    .eq('is_visible', true)
    .order('sort_order', { ascending: true })

  if (error || !data) {
    console.error('[future-products:statuses:get]', error?.message)
    return []
  }

  return data as FutureProductStatus[]
}
```

### 3.5 Public-Facing Page

**File: `src/app/future-products/page.tsx`** (NEW)

Server component that:
- Fetches future products + statuses via the query functions above
- Renders a page header with title + description
- Renders roadmap items as cards in a responsive grid (title, status badge, description via sanitized HTML, estimated release date, category, media/emoji)
- Includes the `NotifyForFutureProductsForm` component at the bottom
- Uses standard `Header`, `Footer`, `Breadcrumb` components
- Metadata: `title: 'Future Products — Ruby's Relics Studio'`, `description: 'What''s coming next in our forge...'`

**File: `src/components/future-products/FutureProductsGrid.tsx`** (NEW — client component for any interactive elements)

If the future products page needs client-side interactions (e.g., filtering by status, expanding descriptions), this component handles that. Otherwise, the page can be a pure server component.

**Rendering description (rich text HTML):**
Since descriptions are created via Tiptap's rich text editor, they'll be stored as HTML. On the public page, we must **sanitize and render safely**:
```tsx
// Server component — renderDescription safely
import DOMPurify from 'dompurify'
// OR simpler: use dangerouslySetInnerHTML with server-side sanitization
```

**Decision:** For the initial implementation, descriptions will be stored as HTML from Tiptap. On the server component, we'll render them with a `dangerouslySetInnerHTML` after server-side sanitization. We should add `dompurify` as a dependency for server-side HTML sanitization.

Wait — Tiptap generates HTML. If we need to sanitize on the server, we should use a server-side HTML sanitizer. The existing codebase doesn't have one. Options:
- `dompurify` (works in Node.js with `jsdom` setup)
- `sanitize-html` (Node.js focused, simpler)
- `xss` (lightweight)

I'll use `sanitize-html` — it's Node.js focused, simple to configure, and doesn't require a DOM environment. Actually, `dompurify` can work with `jsdom` on the server. But `sanitize-html` is the most straightforward for Next.js server components. Let me add `sanitize-html` as a dependency.

Actually, looking at the existing code, the `safeHtmlEscape` function is used for simple text content in emails. For rich text from the admin, we need a proper HTML sanitizer. Let me add `sanitize-html` as a dependency and create a helper function.

### 3.6 Navigation

**File: `src/components/layout/Header.tsx`**

Add "Future Products" to the `NAV_LINKS` array:
```typescript
const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Shop', href: '/shop' },
  { label: 'Future Products', href: '/future-products' },
  { label: 'Custom Orders', href: '/custom-orders' },
  { label: 'Resources', href: '/resources' },
  { label: 'About', href: '/about' },
]
```

---

## 4. Feature 3: "Notify for Future Products" Form

### 4.1 Reusable Form Component

**File: `src/components/common/NotifyForFutureProductsForm.tsx`** (NEW)

A client component that:
- Accepts props: `source: string` (for analytics + API), `containerSx?: object` (optional styling override)
- Fields:
  - **Email** (required `TextField`, type="email", autoComplete="email")
  - **Name** (optional `TextField`)
  - **What would you like to see?** (optional `TextField` as textarea, maxLength 1000)
  - **Comments** (optional `TextField` as textarea, maxLength 2000)
  - Help text below email field: *"Privacy-minded? Use **anon@anon.com** to submit anonymously."*
- Client-side validation:
  - Email format check (before submit)
  - All text fields sanitized client-side (trim, strip null bytes)
- Submit states: `idle` → `loading` → `success` / `error`
- Success state: Shows confirmation message (no form)
- Error state: Shows error message below form
- Analytics: `Analytics.futureProductNotifyAttempted(source)`

**The form submits to a single reusable API endpoint** (`/api/future-products/notify`) — used by both the homepage card and the Future Products page. The `source` field distinguishes where the signup came from.

### 4.2 API Route

**File: `src/app/api/future-products/notify/route.ts`** (NEW)

Mirrors the pattern in `/api/newsletter/subscribe/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/client'
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { sanitizeText, validateEmail } from '@/lib/validate'
import { writeAdminAuditLog } from '@/lib/admin/audit'  // No — this is public API, use safeLogError

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)

    // Rate limit: 5 requests per 10 minutes per IP
    const rlIp = await rateLimit('future-products-ip:${ip}', 5, 10 * 60 * 1000)
    if (!rlIp.allowed) return rateLimitResponse(rlIp.retryAfter ?? 60)

    const body = (await request.json().catch(() => ({}))) as {
      email?: unknown
      name?: unknown
      idea_text?: unknown
      comments?: unknown
      source?: unknown
    }

    const email = validateEmail(body.email)
    const source = sanitizeText(body.source, 80) || 'future_products_page'

    if (!email) {
      return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 })
    }

    // Rate limit: 3 submissions per 24 hours per email
    const rlEmail = await rateLimit(`future-products-email:${email}`, 3, 24 * 60 * 60 * 1000)
    if (!rlEmail.allowed) {
      return NextResponse.json(
        { message: 'You have already submitted your interest recently. We''ll be in touch!' },
        { status: 200 }
      )
    }

    const supabase = getSupabaseAdmin()
    const now = new Date().toISOString()

    const name = sanitizeText(body.name, 120)
    const ideaText = sanitizeText(body.idea_text, 1000)
    const comments = sanitizeText(body.comments, 2000)

    const { error } = await supabase
      .from('exp_newsletter_subscribers')
      .insert({
        email,
        name,
        source,
        subscribed: true,
        subscribed_at: now,
        unsubscribed_at: null,
        interest_details: { idea_text: ideaText, comments },
        response_status: 'new',
        consent_ip: ip,
        consent_user_agent: request.headers.get('user-agent') || 'unknown',
        updated_at: now,
      })

    if (error) {
      // If email already exists (unique constraint), upsert instead
      if (error.code === '23505') {
        const { error: upsertError } = await supabase
          .from('exp_newsletter_subscribers')
          .update({
            name,
            source,
            subscribed: true,
            subscribed_at: now,
            unsubscribed_at: null,
            interest_details: { idea_text: ideaText, comments },
            response_status: 'new',
            consent_ip: ip,
            consent_user_agent: request.headers.get('user-agent') || 'unknown',
            updated_at: now,
          })
          .eq('email', email)

        if (upsertError) {
          safeLogError('[future-products-notify]', upsertError)
          return NextResponse.json({ error: 'Failed to save your interest.' }, { status: 500 })
        }
      } else {
        safeLogError('[future-products-notify]', error)
        return NextResponse.json({ error: 'Failed to save your interest.' }, { status: 500 })
      }
    }

    // Note: No email confirmation for this form — it's an interest capture, not a newsletter subscription
    // If we want to send a confirmation, we can add it later

    return NextResponse.json({ message: 'Thank you! Your feedback has been received.' }, { status: 200 })
  } catch (error) {
    safeLogError('[future-products-notify]', error)
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}
```

**Security measures in this route:**
- ✅ Rate limiting (IP + email)
- ✅ Email format validation (`validateEmail`)
- ✅ Text sanitization (`sanitizeText` with length limits)
- ✅ Consent IP + user agent logging
- ✅ Unique email constraint handling (upsert on conflict)
- ✅ Error logging via `safeLogError` (strips sensitive patterns)
- ✅ No PII in analytics events
- ✅ `response_status` defaults to 'new' for admin tracking

### 4.3 Storefront Setting for Form Toggle

**File: `src/lib/storefront-settings.ts`**

Add a new setting type and getter:

```typescript
export interface FutureProductNotifyFormSettings {
  enabled: boolean
}

const DEFAULT_FUTURE_PRODUCT_NOTIFY_SETTINGS: FutureProductNotifyFormSettings = {
  enabled: true,
}

export async function getFutureProductNotifySettings(): Promise<FutureProductNotifyFormSettings> {
  const settings = await getStorefrontSettings(['future_products_notify_form'])
  const value = settings.get('future_products_notify_form')

  return {
    enabled:
      typeof value?.enabled === 'boolean'
        ? value.enabled
        : DEFAULT_FUTURE_PRODUCT_NOTIFY_SETTINGS.enabled,
  }
}
```

**Seed entry** in storefront settings:
```sql
insert into exp_storefront_settings (setting_key, setting_value, description)
values ('future_products_notify_form', '{"enabled": true}', 'Toggle the notify-for-future-products form on/off storefront-wide')
on conflict (setting_key) do nothing;
```

**Usage in pages:** Both the homepage `future_products_notify` card and the `/future-products` page check this setting before rendering the form component.

---

## 5. Feature 4: Admin Management — Future Products (Catalog Sub-Module)

### 5.1 Admin Route Structure

```
/admin/catalog/future-products/           — Main CRUD page (tabbed: Products | Statuses | Responses)
/admin/catalog/future-products/statuses/  — Status management (sub-route or in-page tab)
```

This is a **sub-section within the existing Catalog admin module** — no new top-level admin module needed.

### 5.2 Admin Page

**File: `src/app/admin/(panel)/catalog/future-products/page.tsx`** (NEW)

A tabbed admin page with three tabs:

#### Tab 1: Products (CRUD)
- Table/list view of all future products (visible + hidden)
- Columns: Title, Status, Category, Est. Release, Visible, Sort Order, Created
- Actions per row: Edit (pencil icon), Delete (trash icon with confirmation)
- "Add New Product" button → opens a modal/drawer with:
  - Title (required, TextField, maxLength 120)
  - Description (Tiptap rich text editor)
  - Estimated Release Date (DatePicker)
  - Category (dropdown from `exp_taxonomy` where `type = 'category'`)
  - Media URL (TextField with preview, maxLength 500)
  - Media Alt Text (TextField, maxLength 200)
  - Status (dropdown populated from `exp_future_product_statuses`)
  - Is Visible (Switch)
  - Sort Order (number input)
  - Save / Cancel buttons
- Drag-to-reorder support (updates `sort_order`)

#### Tab 2: Statuses
- List of all status values with drag-to-reorder
- Add new status (label + color picker)
- Edit existing status (label + color picker + is_default toggle + is_visible toggle)
- Delete status (only if no future products reference it — DB FK prevents orphan, but admin gets a soft check)

#### Tab 3: Responses
- List of all newsletter subscribers with `source = 'future_products_interest'`
- Columns: Email, Name, Idea Text (truncated), Comments (truncated), Response Status, Submitted At, Consent IP
- Filter by response_status (new/viewed/responded/denied)
- Per-row action menu:
  - **Mark as Viewed** → sets `response_status = 'viewed'`
  - **Mark as Responded** → sets `response_status = 'responded'`
  - **Deny** → sets `response_status = 'denied'`, opens a required textarea for `denial_reason`
- Bulk actions: Select multiple → bulk mark as viewed/responded/denied

### 5.3 API Routes

**File: `src/app/api/admin/future-products/route.ts`** (NEW)

```typescript
// GET — list all future products (admin sees all, including hidden)
// POST — create a new future product
// Both require requireAdminApiSession + rate limiting
// Audit log on create/update/delete
```

**File: `src/app/api/admin/future-products/[id]/route.ts`** (NEW)

```typescript
// GET — fetch a single future product by id
// PATCH — update a future product by id
// DELETE — archive (soft delete) a future product by id
// All require requireAdminApiSession + rate limiting
// Audit log on all mutations
```

**File: `src/app/api/admin/future-products/statuses/route.ts`** (NEW)

```typescript
// GET — list all status values
// POST — create a new status value
// Rate limited + audit logged
```

**File: `src/app/api/admin/future-products/statuses/[id]/route.ts`** (NEW)

```typescript
// PATCH — update a status value
// DELETE — delete a status value (only if no future products reference it)
// Rate limited + audit logged
```

**File: `src/app/api/admin/future-products/responses/route.ts`** (NEW)

```typescript
// GET — list all future-product interest responses
//   Query params: ?status=new|viewed|responded|denied (filter)
//   Returns: { id, email, name, interest_details, response_status, denial_reason, consent_ip, consent_user_agent, subscribed_at, updated_at }
// Rate limited + audit logged (for access)
```

**File: `src/app/api/admin/future-products/responses/[id]/route.ts`** (NEW)

```typescript
// PATCH — update response status (viewed/responded/denied)
//   Required fields: { response_status: 'denied', denial_reason: '...' } when status is 'denied'
// Rate limited + audit logged
```

### 5.4 Admin Catalog Nav Link

**File: `src/app/admin/(panel)/catalog/page.tsx`** or the catalog layout

Add a link to the Future Products sub-section. This could be:
- A tab in the existing catalog page, or
- A nav link in the catalog page that links to `/admin/catalog/future-products`

### 5.5 Admin Homepage Integration (for shop_all_preview editor)

Add a dedicated editor panel in `src/app/admin/(panel)/homepage/page.tsx`:

```tsx
// After the Hero Collage Editor, add:
<Box sx={{ /* card styling */ }}>
  <Typography variant="h6">Shop All Preview</Typography>
  <Typography variant="body2" sx={{ color: alpha(brandTokens.parchment, 0.55) }}>
    Configure the product grid card on the homepage. Controls how many products display
    and whether filter controls are shown.
  </Typography>
  <Stack spacing={2} sx={{ mb: 3 }}>
    <TextField
      size="small"
      type="number"
      label="Products to display"
      value={shopAllConfig.product_count}
      onChange={(e) => setShopAllConfig(prev => ({ ...prev, product_count: Math.min(20, Math.max(1, Number(e.target.value) || 6)) }))}
      inputProps={{ min: 1, max: 20 }}
      sx={{ width: 180 }}
    />
    <FormControlLabel
      control={<Switch checked={shopAllConfig.show_filters} onChange={(e) => setShopAllConfig(prev => ({ ...prev, show_filters: e.target.checked }))} />}
      label="Show filter controls"
    />
    <TextField
      size="small"
      label="Section heading (optional override)"
      value={shopAllConfig.heading ?? ''}
      onChange={(e) => setShopAllConfig(prev => ({ ...prev, heading: e.target.value }))}
      inputProps={{ maxLength: 100 }}
      fullWidth
    />
    <TextField
      size="small"
      label="Subheading (optional)"
      value={shopAllConfig.subheading ?? ''}
      onChange={(e) => setShopAllConfig(prev => ({ ...prev, subheading: e.target.value }))}
      inputProps={{ maxLength: 200 }}
      fullWidth
    />
  </Stack>
  {shopAllMessage && <Alert severity={shopAllMessage.type}>{shopAllMessage.text}</Alert>}
  <Button variant="contained" onClick={() => void handleSaveShopAll()} disabled={savingShopAll}>
    Save Shop All Preview
  </Button>
</Box>
```

The save handler PATCHes to `/api/admin/homepage/sections/shop_all_preview` with the content payload.

---

## 6. Feature 5: Homepage "Notify" Card

**New homepage section key: `future_products_notify`**

This is a **simple visibility-only section** — it only needs `is_visible` toggled, which is handled by the existing batch PATCH endpoint. No content management needed.

**Rendering in `page.tsx`:**
```tsx
{/* Notify for future products */}
{sections['future_products_notify']?.is_visible !== false && (
  <Box component="section" sx={{ py: { xs: 8, md: 10 } }}>
    <Container maxWidth="sm">
      <Typography variant="h2" component="h2" sx={{ textAlign: 'center', mb: 3 }}>
        Notify for Future Products
      </Typography>
      <Typography sx={{ color: alpha(brandTokens.parchment, 0.7), textAlign: 'center', mb: 4 }}>
        Want to be the first to know when we launch new product lines?
        Drop your email and tell us what you''d like to see.
      </Typography>
      <NotifyForFutureProductsForm source="homepage_notify_card" />
    </Container>
  </Box>
)}
```

The form itself checks the `future_products_notify_form.enabled` storefront setting before rendering.

**Revert:** Toggle `is_visible = false` in the admin homepage panel.

---

## 7. Security Checklist

| Threat | Mitigation | Location |
|--------|-----------|----------|
| **Brute-force / spam submissions** | Rate limiting: 5 req/10min per IP, 3/24h per email | `/api/future-products/notify` |
| **Invalid email addresses** | `validateEmail()` — RFC 5322 regex, max 254 chars, lowercased | API route |
| **XSS via form fields** | `sanitizeText()` strips null bytes, collapses whitespace, truncates; `safeHtmlEscape()` on any HTML rendering | API route + components |
| **XSS via rich text (Future Products description)** | Server-side HTML sanitization with `sanitize-html` library before rendering | Page render |
| **CSRF on public API** | JSON content-type verification (Next.js API routes reject form-encoded POSTs); rate limiting as defense-in-depth | Middleware + API |
| **SQL injection** | All Supabase queries use parameterized RPC/select — no string interpolation | All queries |
| **Data exfiltration** | RLS policies: `exp_future_products` and `exp_future_product_statuses` only readable by anon/authenticated for visible rows; all writes require service_role | Migration 055 |
| **Consent compliance** | `consent_ip` + `consent_user_agent` + `subscribed_at` stored for every submission | `exp_newsletter_subscribers` |
| **Sensitive data logging** | `safeLogError()` strips API keys, JWTs, connection strings, Resend keys from error logs | API routes |
| **Admin auth bypass** | Middleware blocks all `/admin/*` and `/api/admin/*`; MFA required; HMAC-signed session tokens with timing-safe comparison | `middleware.ts` |
| **Admin audit trail** | `writeAdminAuditLog()` on all admin mutations | Admin API routes |
| **Rate limit bypass** | `getClientIp()` only trusts `X-Forwarded-For` on Vercel; fail-closed option for security-critical endpoints | `src/lib/rate-limit.ts` |

### OWASP Top 10 Alignment

- **A01 Broken Access Control**: RLS + service_role-only writes + admin middleware ✅
- **A02 Cryptographic Failures**: HMAC-SHA256 for admin sessions, timing-safe comparison ✅
- **A03 Injection**: Parameterized queries, no string interpolation, `sanitizeSearchQuery()` ✅
- **A04 Insecure Design**: Rate limiting, defense-in-depth, input validation ✅
- **A05 Security Misconfiguration**: CSP headers, no hardcoded secrets, env-based config ✅
- **A07 XSS**: `sanitizeText()`, `safeHtmlEscape()`, `sanitize-html` for rich text ✅
- **A08 Software & Data Integrity**: Audit logging, version-controlled migrations ✅
- **A09 Security Logging**: `safeLogError()` with sensitive pattern stripping ✅

---

## 8. Testing Plan

### 8.1 API Route Tests

**File: `src/app/api/future-products/notify/route.test.ts`** (NEW)

Following the pattern in `src/app/api/back-in-stock/subscribe/route.test.ts`:
- Test: returns 400 when email is missing or invalid
- Test: returns 200 on successful submission (mocks Supabase upsert)
- Test: returns 429 when rate limited
- Test: rate limiting per-email deduplication (3/24h)
- Test: name, idea_text, comments are sanitized (null bytes stripped, length truncated)
- Test: `anon@anon.com` is accepted as valid email

**File: `src/app/api/admin/future-products/route.test.ts`** (NEW)
- Test: returns 401 when not admin-authenticated
- Test: returns 403 when admin not MFA-verified
- Test: GET returns all products (including hidden)
- Test: POST creates a new product with validation
- Test: POST rejects invalid data

**File: `src/app/api/admin/future-products/responses/[id]/route.test.ts`** (NEW)
- Test: PATCH with denial_reason when marking as denied
- Test: PATCH rejects denial without reason
- Test: PATCH with valid response_status updates

### 8.2 RLS Lockdown Test

**Script: update `scripts/test-rls-lockdown.mjs`**
- Add test for `exp_future_products` — anon cannot insert/update/delete
- Add test for `exp_future_product_statuses` — anon cannot insert/update/delete
- Verify anon can only SELECT visible future products
- Verify anon can only SELECT visible statuses

### 8.3 Manual QA Checklist

- [ ] Homepage: `shop_all_preview` card shows N products (admin-configurable)
- [ ] Homepage: filter controls work (category, price, ready-made, customizable, search)
- [ ] Homepage: "View All" button navigates to `/shop/all` with filter params
- [ ] Homepage: "Future Products" button navigates to `/future-products`
- [ ] Homepage: `future_products_notify` card shows form when enabled
- [ ] Homepage: admin can toggle both cards on/off instantly
- [ ] `/future-products`: roadmap items display with status badges
- [ ] `/future-products`: notify form works with all fields
- [ ] Admin: Catalog → Future Products → Products tab CRUD works
- [ ] Admin: Catalog → Future Products → Statuses tab add/edit/delete works
- [ ] Admin: Catalog → Future Products → Responses tab mark viewed/responded/denied works
- [ ] Admin: Homepage editor can configure product_count for shop_all_preview
- [ ] Rate limiting triggers after threshold
- [ ] Mobile: filters collapse into accordion on small screens
- [ ] `prefers-reduced-motion`: no animations on reduced motion
- [ ] CSRF: form submissions use JSON, not form-encoded

---

## 9. Analytics Events

**File: `src/lib/analytics/events.ts`** — Add:

```typescript
// ─── Future Products ──────────────────────────────────────────────────────────
futureProductViewed(productId: string) {
  track('future_product_viewed', { product_id: productId })
},

futureProductCategoryClicked(categoryKey: string | null) {
  track('future_product_category_clicked', { category_key: categoryKey })
},

futureProductNotifyAttempted(source: string) {
  track('future_product_notify_attempted', { source })
},

futureProductNotifySubmitted() {
  track('future_product_notify_submitted')
},

// ─── Homepage Product Grid ─────────────────────────────────────────────────────
homepageProductFilterApplied(filterType: string, value: string) {
  track('homepage_product_filter_applied', { filter_type: filterType, value })
},

homepageProductViewAllClicked() {
  track('homepage_product_view_all_clicked')
},

homepageFutureProductsLinkClicked() {
  track('homepage_future_products_link_clicked')
},
```

**Important — OWASP compliance for analytics:** No PII (email, name, idea text) is ever sent to analytics. Only the `source` field is tracked.

---

## 10. Dependencies

### 10.1 New Dependencies

| Package | Purpose | Version |
|---------|---------|---------|
| `@tiptap/react` | Rich text editor (React wrapper) | `^2.7.0` |
| `@tiptap/starter-kit` | Basic editor extensions (bold, italic, lists, etc.) | `^2.7.0` |
| `sanitize-html` | Server-side HTML sanitization for Tiptap output | `^2.13.0` |

### 10.2 Dev Dependencies (for testing)

No new dev dependencies — existing `vitest` is sufficient.

### 10.3 package.json Update

```json
{
  "dependencies": {
    "@tiptap/react": "^2.7.0",
    "@tiptap/starter-kit": "^2.7.0",
    "sanitize-html": "^2.13.0",
    // ... existing dependencies
  }
}
```

---

## 11. Deployment & Rollout

### 11.1 Migration Order

1. Run migration `055_future_products_roadmap.sql` (creates tables, adds columns)
2. Run seed `006_future_products_seed.sql` (seeds statuses, example products, homepage sections)
3. Deploy application code
4. No downtime required — all new tables/columns are additive

### 11.2 Rollback Plan

If issues arise:
1. Toggle all new homepage sections to `is_visible = false` via admin panel (immediate)
2. Optionally run a rollback migration to drop the new tables/columns
3. No data loss risk — existing tables/columns are unchanged

### 11.3 Feature Flags

All three features are controlled by database values:
- `shop_all_preview` — `exp_homepage_sections.is_visible`
- `future_products_notify` — `exp_homepage_sections.is_visible`
- `future_products_notify_form` — `exp_storefront_settings.setting_value.enabled`
- `/future-products` page — always accessible if any visible future products exist

---

## 12. File Inventory

### New Files (15)

| # | File | Type | Purpose |
|---|------|------|---------|
| 1 | `supabase/migrations/055_future_products_roadmap.sql` | Migration | New tables: `exp_future_products`, `exp_future_product_statuses`; new columns on `exp_newsletter_subscribers` |
| 2 | `supabase/seed/006_future_products_seed.sql` | Seed | Seeds statuses, example products, homepage sections, storefront setting |
| 3 | `src/lib/supabase/queries/future-products.ts` | Query | `getFutureProducts()`, `getFutureProductStatuses()` |
| 4 | `src/components/home/HomepageProductGrid.tsx` | Component | Client component: product grid with filters, View All button, Future Products link |
| 5 | `src/components/common/NotifyForFutureProductsForm.tsx` | Component | Reusable notify form (email, name, idea text, comments) |
| 6 | `src/app/future-products/page.tsx` | Page | Roadmap display page with notify form |
| 7 | `src/components/future-products/FutureProductsGrid.tsx` | Component | Roadmap item card grid (client-side for status filtering if needed) |
| 8 | `src/app/api/future-products/notify/route.ts` | API | Public notify form submission endpoint |
| 9 | `src/app/api/future-products/notify/route.test.ts` | Test | Tests for notify API |
| 10 | `src/app/admin/(panel)/catalog/future-products/page.tsx` | Admin | Tabbed CRUD page (Products, Statuses, Responses) |
| 11 | `src/app/api/admin/future-products/route.ts` | API | Admin list/create future products |
| 12 | `src/app/api/admin/future-products/[id]/route.ts` | API | Admin get/update/delete single product |
| 13 | `src/app/api/admin/future-products/statuses/route.ts` | API | Admin list/create statuses |
| 14 | `src/app/api/admin/future-products/statuses/[id]/route.ts` | API | Admin update/delete status |
| 15 | `src/app/api/admin/future-products/responses/route.ts` | API | Admin list responses |

### Modified Files (13)

| # | File | Changes |
|---|------|---------|
| 1 | `src/app/page.tsx` | Add `getAllActiveProducts()` to data fetching; render `shop_all_preview` + `future_products_notify` sections; render `NotifyForFutureProductsForm` |
| 2 | `src/app/shop/all/page.tsx` | Add `?category=`, `?price_min=`, `?price_max=`, `?ready_made=`, `?customizable=`, `?search=` query param support |
| 3 | `src/app/api/admin/homepage/sections/route.ts` | Add `'shop_all_preview'` and `'future_products_notify'` to `ALL_SECTION_KEYS` |
| 4 | `src/app/api/admin/homepage/sections/[key]/route.ts` | Add `'shop_all_preview'` and `'future_products_notify'` to `ALL_SECTION_KEYS`; add content-management branch for `shop_all_preview` |
| 5 | `src/app/admin/(panel)/homepage/page.tsx` | Add new sections to `SECTION_ORDER`, `SECTION_META`; add `shop_all_preview` content editor panel |
| 6 | `src/lib/storefront-settings.ts` | Add `FutureProductNotifyFormSettings` type + `getFutureProductNotifySettings()` |
| 7 | `src/lib/analytics/events.ts` | Add Future Products + Homepage Product Grid events |
| 8 | `src/components/layout/Header.tsx` | Add "Future Products" nav link |
| 9 | `src/types/index.ts` | Add `FutureProduct`, `FutureProductStatus` types |
| 10 | `package.json` | Add `@tiptap/react`, `@tiptap/starter-kit`, `sanitize-html` |
| 11 | `supabase/seed/005_storefront_settings_seed.sql` | Add `future_products_notify_form` seed entry (if this file exists; otherwise add to migration 055) |
| 12 | `scripts/test-rls-lockdown.mjs` | Add RLS tests for `exp_future_products` + `exp_future_product_statuses` |
| 13 | `next.config.ts` | Add `sanitize-html` to server-side dependencies (if needed for SSR) |

### New Admin API Responses Route Test

| # | File | Type | Purpose |
|---|------|------|---------|
| 16 | `src/app/api/admin/future-products/responses/[id]/route.ts` | API | Admin update response status (viewed/responded/denied) |
| 17 | `src/app/api/admin/future-products/responses/route.test.ts` | Test | Tests for response management |

---

## Implementation Order (Recommended)

1. **Migration + Seed** — Create DB tables and seed data (foundation everything else builds on)
2. **Types + Queries** — Add TypeScript types and Supabase query functions
3. **Homepage sections** — Add `shop_all_preview` and `future_products_notify` to API routes, admin UI, and page.tsx (toggleable, so safe even if frontend isn't complete)
4. **HomepageProductGrid component** — Build the embedded product card with filters
5. **Notify form component + API route** — Build the reusable form and its endpoint
6. **Future Products page** — Build the public roadmap page
7. **Admin CRUD** — Build the Catalog sub-module (products, statuses, responses tabs)
8. **Storefront setting + Header nav** — Add the form toggle + navigation link
9. **Analytics events** — Wire up event tracking
10. **Tests + RLS lockdown** — Add test coverage
11. **Dependency installation** — `npm install @tiptap/react @tiptap/starter-kit sanitize-html`

---

## Notes & Decisions Log

- **Rich text editor**: Tiptap v2 confirmed by user. Output is HTML, sanitized server-side with `sanitize-html` before rendering on the public `/future-products` page.
- **Filter state persistence**: Client-side on homepage card (in React state). "View All" encodes filters as query params on `/shop/all`.
- **Notify form storage**: Reuses `exp_newsletter_subscribers` with `source = 'future_products_interest'`. New columns added for `name`, `interest_details` (JSONB), `response_status`, `denial_reason`.
- **Status dropdown**: Seeded with 5 values; admin can add/edit/remove/reorder via Catalog → Future Products → Statuses tab.
- **Form fields**: email (required), name (optional), what-would-you-like-to-see (optional textarea), comments (optional textarea). All sanitized with `sanitizeText()` and length-limited.
- **Admin response tab**: Read + status management (viewed/responded/denied with reason). No edit of the subscriber's email/name/interest data.
- **No email confirmation** for the notify form — it captures interest, not a newsletter subscription. Admin follows up manually if desired.
- **Revertibility**: All features are toggleable via homepage visibility settings or storefront settings. No code deployment needed to turn off.

---

## 13. Addendum: WYSIWYG Product Designer Popup

This addendum captures the separate art-placement popup effort discussed after the future-products plan. It does not replace the plan above. It extends the storefront with a secure, print-accurate design editor for custom product artwork.

### 13.1 Scope

1. Replace the current prototype designer with a production-ready popup editor.
2. Support both shop products and custom orders in v1, but keep the first release 2D-only.
3. Make the editor mobile-friendly, theme-aligned, and usable on desktop and touch devices.
4. Allow multiple layers, duplicate artwork instances, and a configurable image limit.
5. Generate both PNG and PDF print-ready exports at product-specific physical dimensions.
6. Keep 3D architecture-ready, but defer true interactive 3D until a later phase.

### 13.2 Security Gates Before Feature Work

1. Fix the customer custom-order submission flow so uploaded artwork tokens are preserved end to end.
2. Remove any customer-facing dependency on admin upload routes.
3. Delete the unused direct-browser upload component rather than hardening dead code.
4. Set sensitive upload, intake, and export endpoints to fail closed when rate limiting infrastructure is unavailable.
5. Add audit logging and shorter-lived signed URLs for private artwork retrieval.
6. Enforce strict server-side design schema validation and reject unknown fields.
7. Add explicit export limits for canvas size, layer count, source asset size, and render time.

### 13.3 Architecture Plan

1. Define a shared DesignDocument model that is renderer-agnostic.
2. Store design metadata and export artifacts in private storage, not public product-media buckets.
3. Add per-product print templates in the admin product builder so each product can define exact sizing, bleed, and safe areas.
4. Persist design state through cart and order submission so customers can reopen and edit before checkout.
5. Add a server export endpoint that produces both PNG and PDF artifacts and returns customer-downloadable URLs.

### 13.4 Execution Phases

1. Phase 0: lock the design schema and security constraints.
2. Phase 1: add storefront settings for image limits, export toggles, and future 3D flags.
3. Phase 2: replace the prototype editor shell and wire customer-safe uploads.
4. Phase 3: add product template management in the admin product builder.
5. Phase 4: integrate design persistence into cart and order flow.
6. Phase 5: build the PNG/PDF export pipeline.
7. Phase 6: add tests, abuse cases, and rollout controls.

### 13.5 Known Concerns And Required Fixes

1. ProductDesigner currently uses an admin upload endpoint and must be switched to a customer-safe route.
2. ArtUploadPortal is unused and should be removed instead of left as a risk.
3. Custom-order submission currently needs the uploadToken carried through the submit payload.
4. Artwork retrieval should use shorter signed URL lifetimes and log access events.
5. Upload and export routes should use fail-closed rate limiting.
6. True 3D should remain out of v1 because WebGL/mobile stability risk is materially higher than the 2D path.

### 13.6 Primary Files To Touch

1. [src/components/shop/ProductDesigner.tsx](src/components/shop/ProductDesigner.tsx)
2. [src/components/shop/ProductConfigurator.tsx](src/components/shop/ProductConfigurator.tsx)
3. [src/components/custom-orders/CustomOrderIntakeForm.tsx](src/components/custom-orders/CustomOrderIntakeForm.tsx)
4. [src/components/shop/ArtUploadPortal.tsx](src/components/shop/ArtUploadPortal.tsx)
5. [src/app/api/custom-orders/upload/route.ts](src/app/api/custom-orders/upload/route.ts)
6. [src/app/api/custom-orders/route.ts](src/app/api/custom-orders/route.ts)
7. [src/app/api/admin/custom-requests/[id]/artwork/route.ts](src/app/api/admin/custom-requests/[id]/artwork/route.ts)
8. [src/lib/rate-limit.ts](src/lib/rate-limit.ts)
9. [src/lib/storefront-settings.ts](src/lib/storefront-settings.ts)
10. [src/app/api/admin/settings/route.ts](src/app/api/admin/settings/route.ts)
11. [src/app/admin/(panel)/settings/page.tsx](src/app/admin/(panel)/settings/page.tsx)
12. [src/lib/supabase/queries/products.ts](src/lib/supabase/queries/products.ts)
13. [src/app/admin/(panel)/catalog/products/[id]/builder/page.tsx](src/app/admin/(panel)/catalog/products/[id]/builder/page.tsx)
14. [supabase/migrations/006_orders_foundation.sql](supabase/migrations/006_orders_foundation.sql)
15. [supabase/migrations/046_artwork_uploads.sql](supabase/migrations/046_artwork_uploads.sql)

### 13.7 Verification Checklist

1. Customer cannot reach admin upload paths from the designer.
2. Upload token ownership is preserved through submit and validated server-side.
3. Private artwork downloads are signed, short-lived, and auditable.
4. Designer exports are limited, deterministic, and print-size accurate.
5. Mobile touch interactions remain usable on small screens.
6. 2D remains the production path; 3D stays deferred behind a feature boundary.