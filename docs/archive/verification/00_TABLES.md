# Tables — Final State After All Migrations (001–048)

> **Note:** This document reflects the schema state after applying ALL migrations 001–048 in sequence. It differs from `Current_Schema.md` in the following ways:
> - Customer tables (`exp_customers`, `exp_customer_sessions`, `exp_password_reset_tokens`, `exp_customer_addresses`, `exp_wishlists`, `exp_recently_viewed`) are **NOT present** — dropped by migration 042.
> - Security tables (`exp_square_webhook_events`, `exp_rate_limit_windows`, `exp_admin_sessions`, `exp_artwork_uploads`, `admin_mfa_codes`) **ARE present** — created by migrations 040–046 (recreated by 048).
> - `customer_id` columns have been **dropped** from `exp_orders`, `exp_custom_requests`, `exp_newsletter_subscribers`, `exp_back_in_stock_alerts`, `exp_capacity_reopen_alerts` by migration 042.
> - Dead RLS policies referencing `customer_id` on `exp_orders` and `exp_order_items` have been **dropped** by migration 048.

---

## 1. Homepage CMS

### `exp_taxonomy`
| Column | Type | Constraints |
|--------|------|-------------|
| `key` | `text` | PK |
| `display_name` | `text` | NOT NULL |
| `slug` | `text` | NOT NULL, UNIQUE |
| `parent_key` | `text` | FK → `exp_taxonomy(key)`, nullable |
| `type` | `text` | NOT NULL, CHECK (category, customizability_mode, material, product_type, tag, process_type) |
| `visible` | `bool` | NOT NULL, default true |
| `sort_order` | `int4` | NOT NULL, default 0 |
| `how_it_works_anchor` | `text` | nullable |
| `alias_keys` | `text` | nullable (comma-separated) |
| `emoji` | `text` | nullable |
| `gradient` | `text` | nullable |
| `glow_color` | `text` | nullable |
| `tagline` | `text` | nullable |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |

**Indexes:** `idx_exp_taxonomy_type`, `idx_exp_taxonomy_visible`
**Triggers:** `trg_taxonomy_updated_at`
**RLS:** Enabled. Policy: `public read taxonomy` (SELECT, anon+authenticated, `visible = true`)
**Source:** Migration 001. Type constraint expanded in 030.

---

### `exp_homepage_sections`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `section_key` | `text` | NOT NULL, UNIQUE |
| `is_visible` | `bool` | NOT NULL, default true |
| `sort_order` | `int4` | NOT NULL, default 0 |
| `content` | `jsonb` | NOT NULL, default '{}' |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |

**Triggers:** `trg_homepage_sections_updated_at`
**RLS:** Enabled. Policy: `public read homepage sections` (SELECT, anon+authenticated, `true`)
**Source:** Migration 001.

---

### `exp_featured_collections`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `title` | `text` | NOT NULL |
| `tagline` | `text` | NOT NULL |
| `description` | `text` | NOT NULL, default '' |
| `slug` | `text` | NOT NULL, UNIQUE |
| `image_url` | `text` | nullable |
| `emoji` | `text` | nullable |
| `tag_label` | `text` | nullable |
| `gradient` | `text` | NOT NULL, default '' |
| `border_color` | `text` | NOT NULL, default '' |
| `is_visible` | `bool` | NOT NULL, default true |
| `sort_order` | `int4` | NOT NULL, default 0 |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |

**Indexes:** `idx_exp_featured_visible`
**Triggers:** `trg_featured_collections_updated_at`
**RLS:** Enabled. Policy: `public read featured collections` (SELECT, anon+authenticated, `is_visible = true`)
**Source:** Migration 001.

---

### `exp_gallery`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `title` | `text` | NOT NULL |
| `caption` | `text` | nullable |
| `category_key` | `text` | FK → `exp_taxonomy(key)`, nullable |
| `media_url` | `text` | NOT NULL, default '' |
| `media_alt` | `text` | NOT NULL, default '' |
| `emoji` | `text` | nullable |
| `gradient` | `text` | NOT NULL, default '' |
| `material_used` | `text` | nullable |
| `turnaround_band` | `text` | nullable |
| `display_permission` | `bool` | NOT NULL, default false |
| `moderation_status` | `text` | NOT NULL, default 'pending_review', CHECK (pending_review, approved, scheduled, published, archived) |
| `publish_date` | `date` | nullable |
| `tags` | `text[]` | NOT NULL, default '{}' |
| `visible` | `bool` | NOT NULL, default true |
| `sort_order` | `int4` | NOT NULL, default 0 |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |

**Indexes:** `idx_exp_gallery_status`, `idx_exp_gallery_visible`
**Triggers:** `trg_gallery_updated_at`
**RLS:** Enabled. Policy: `public read published gallery` (SELECT, anon+authenticated, `moderation_status = 'published' AND visible = true`)
**Source:** Migration 001.

---

### `exp_testimonials`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `quote` | `text` | NOT NULL |
| `author` | `text` | NOT NULL |
| `location` | `text` | nullable |
| `product_label` | `text` | nullable |
| `stars` | `int4` | NOT NULL, default 5, CHECK (1–5) |
| `emoji` | `text` | nullable |
| `is_visible` | `bool` | NOT NULL, default false |
| `sort_order` | `int4` | NOT NULL, default 0 |
| `source` | `text` | nullable |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |

**Indexes:** `idx_exp_testimonials_visible`
**Triggers:** `trg_testimonials_updated_at`
**RLS:** Enabled. Policy: `public read visible testimonials` (SELECT, anon+authenticated, `is_visible = true`)
**Source:** Migration 001.

---

### `exp_announcement`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `message` | `text` | NOT NULL |
| `cta_label` | `text` | nullable |
| `cta_href` | `text` | nullable |
| `is_active` | `bool` | NOT NULL, default false |
| `dismiss_key` | `text` | NOT NULL, default 'rr_announcement_v1' |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |

**Triggers:** `trg_announcement_updated_at`
**RLS:** Enabled. Policy: `public read active announcement` (SELECT, anon+authenticated, `is_active = true`)
**Source:** Migration 001.

---

### `exp_faq`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `question` | `text` | NOT NULL |
| `answer` | `text` | NOT NULL |
| `link_label` | `text` | nullable |
| `link_href` | `text` | nullable |
| `is_visible` | `bool` | NOT NULL, default true |
| `sort_order` | `int4` | NOT NULL, default 0 |
| `section` | `text` | NOT NULL, default 'homepage' |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |

**Indexes:** `idx_exp_faq_section`
**Triggers:** `trg_faq_updated_at`
**RLS:** Enabled. Policy: `public read visible faq` (SELECT, anon+authenticated, `is_visible = true`)
**Source:** Migration 001.

---

## 2. Product Catalog

### `exp_products`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `title` | `text` | NOT NULL |
| `slug` | `text` | NOT NULL, UNIQUE |
| `short_description` | `text` | NOT NULL, default '' |
| `description` | `text` | NOT NULL, default '' |
| `category_key` | `text` | NOT NULL, FK → `exp_taxonomy(key)` |
| `base_price` | `numeric(10,2)` | NOT NULL, default 0 |
| `is_ready_made` | `bool` | NOT NULL, default false |
| `is_customizable` | `bool` | NOT NULL, default true |
| `is_active` | `bool` | NOT NULL, default true |
| `is_archived` | `bool` | NOT NULL, default false |
| `sort_order` | `int4` | NOT NULL, default 0 |
| `production_estimate_band` | `text` | NOT NULL, default '3–5 business days' |
| `how_it_works_anchor` | `text` | nullable |
| `seo_title` | `text` | nullable |
| `seo_description` | `text` | nullable |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |
| `has_designer` | `bool` | NOT NULL, default false — **added by 035** |
| `designer_mockup_url` | `text` | nullable — **added by 035** |
| `nfc_price_delta` | `numeric(12,4)` | NOT NULL, default 1, CHECK (>= 0) — **added by 037** |
| `square_variant_id` | `text` | nullable — **added by 033** |
| `is_square_enabled` | `bool` | NOT NULL, default false — **added by 033** |

**Indexes:** `idx_exp_products_category`, `idx_exp_products_active`, `idx_exp_products_slug`, `idx_exp_products_square_enabled` (WHERE is_square_enabled = true)
**Triggers:** `trg_products_updated_at`
**RLS:** Enabled. Policy: `public_read_active_products` (SELECT, public, `is_active = true AND is_archived = false`)
**Source:** Migration 002. Columns added by 033, 035, 037.

---

### `exp_product_variants`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `product_id` | `uuid` | NOT NULL, FK → `exp_products(id)` ON DELETE CASCADE |
| `label` | `text` | NOT NULL |
| `sku` | `text` | nullable |
| `price_delta` | `numeric(10,2)` | NOT NULL, default 0 |
| `capacity_weight` | `numeric(6,2)` | nullable |
| `is_enabled` | `bool` | NOT NULL, default true |
| `sort_order` | `int4` | NOT NULL, default 0 |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |

**Indexes:** `idx_exp_product_variants_product`
**Triggers:** `trg_product_variants_updated_at`
**RLS:** Enabled. Policy: `public_read_product_variants` (SELECT, public, subquery on exp_products)
**Source:** Migration 002.

---

### `exp_product_media`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `product_id` | `uuid` | NOT NULL, FK → `exp_products(id)` ON DELETE CASCADE |
| `url` | `text` | NOT NULL, default '' |
| `alt` | `text` | NOT NULL, default '' |
| `emoji` | `text` | nullable |
| `gradient` | `text` | nullable |
| `is_featured` | `bool` | NOT NULL, default false |
| `sort_order` | `int4` | NOT NULL, default 0 |
| `created_at` | `timestamptz` | NOT NULL, default now() |

**Indexes:** `idx_exp_product_media_product`
**RLS:** Enabled. Policy: `public_read_product_media` (SELECT, public, subquery on exp_products)
**Source:** Migration 002.

---

### `exp_product_options`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `product_id` | `uuid` | NOT NULL, FK → `exp_products(id)` ON DELETE CASCADE |
| `option_key` | `text` | NOT NULL |
| `label` | `text` | NOT NULL |
| `option_type` | `text` | NOT NULL, CHECK (select, text, textarea, file, checkbox, number) |
| `placeholder` | `text` | nullable |
| `help_text` | `text` | nullable |
| `is_required` | `bool` | NOT NULL, default false |
| `sort_order` | `int4` | NOT NULL, default 0 |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `min_width` | `numeric` | nullable — **added by 035** |
| `max_width` | `numeric` | nullable — **added by 035** |
| `min_height` | `numeric` | nullable — **added by 035** |
| `max_height` | `numeric` | nullable — **added by 035** |
| `allowed_colors` | `text[]` | nullable — **added by 035** |

**Indexes:** `idx_exp_product_options_product`
**Triggers:** `trg_product_options_updated_at`
**RLS:** Enabled. Policy: `public_read_product_options` (SELECT, public, subquery on exp_products)
**Source:** Migration 002. Columns added by 035.

---

### `exp_product_option_values`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `option_id` | `uuid` | NOT NULL, FK → `exp_product_options(id)` ON DELETE CASCADE |
| `label` | `text` | NOT NULL |
| `value` | `text` | NOT NULL |
| `price_delta` | `numeric(10,2)` | NOT NULL, default 0 |
| `is_enabled` | `bool` | NOT NULL, default true |
| `sort_order` | `int4` | NOT NULL, default 0 |
| `created_at` | `timestamptz` | NOT NULL, default now() |

**Indexes:** `idx_exp_product_option_values_option`
**Triggers:** `trg_product_option_values_updated_at`
**RLS:** Enabled. Policy: `public_read_product_option_values` (SELECT, public, subquery joining exp_product_options + exp_products)
**Source:** Migration 002.

---

### `exp_product_bulk_discounts`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `product_id` | `uuid` | NOT NULL, FK → `exp_products(id)` ON DELETE CASCADE |
| `min_qty` | `int4` | NOT NULL, CHECK (> 0) |
| `max_qty` | `int4` | nullable, CHECK (max_qty >= min_qty or null) |
| `discount_type` | `text` | NOT NULL, CHECK (percent, fixed_amount, unit_price) |
| `discount_value` | `numeric(10,2)` | NOT NULL, CHECK (>= 0) |
| `label` | `text` | nullable |
| `is_enabled` | `bool` | NOT NULL, default true |
| `sort_order` | `int4` | NOT NULL, default 0 |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |

**Indexes:** `idx_exp_product_bulk_discounts_product`, `idx_exp_product_bulk_discounts_enabled`
**Triggers:** `trg_product_bulk_discounts_updated_at`
**RLS:** Enabled. Policy: `public_read_product_bulk_discounts` (SELECT, public, `is_enabled = true AND subquery on exp_products`)
**Source:** Migration 004.

---

### `exp_product_process_types`
| Column | Type | Constraints |
|--------|------|-------------|
| `product_id` | `uuid` | PK, FK → `exp_products(id)` ON DELETE CASCADE |
| `process_type_key` | `text` | PK, FK → `exp_taxonomy(key)` |

**Indexes:** `idx_exp_product_process_types_product`, `idx_exp_product_process_types_key`
**RLS:** Enabled. Policy: `public read product process types` (SELECT, anon+authenticated, `true`)
**Source:** Migration 030.

---

### `exp_product_process_pricing`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `product_id` | `uuid` | NOT NULL, FK → `exp_products(id)` ON DELETE CASCADE |
| `process_type_key` | `text` | NOT NULL, FK → `exp_taxonomy(key)` |
| `price_delta` | `numeric(10,2)` | NOT NULL, default 0 |
| `is_enabled` | `bool` | NOT NULL, default true |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |

**Unique:** `(product_id, process_type_key)`
**Indexes:** `idx_exp_product_process_pricing_product`, `idx_exp_product_process_pricing_key`
**Triggers:** `trg_exp_product_process_pricing_updated_at`
**RLS:** Enabled. Policy: `public read enabled product process pricing` (SELECT, anon+authenticated, `is_enabled = true`)
**Source:** Migration 032.

---

### `exp_product_combo_discounts`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `product_id` | `uuid` | NOT NULL, FK → `exp_products(id)` ON DELETE CASCADE |
| `min_processes` | `int4` | NOT NULL, default 2 |
| `discount_type` | `text` | NOT NULL, CHECK (percent, fixed_amount, cheapest_free) |
| `discount_value` | `numeric(10,2)` | nullable (null for cheapest_free) |
| `label` | `text` | nullable |
| `is_enabled` | `bool` | NOT NULL, default true |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |

**Indexes:** `idx_exp_product_combo_discounts_product`
**Triggers:** `trg_exp_product_combo_discounts_updated_at`
**RLS:** Enabled. Policy: `public read enabled product combo discounts` (SELECT, anon+authenticated, `is_enabled = true`)
**Source:** Migration 032.

---

## 3. Custom Requests

### `exp_custom_requests`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `status` | `text` | NOT NULL, default 'awaiting_quote', CHECK (awaiting_quote, quote_sent, paid, expired, cancelled, restricted_pending_review, restricted_rejected, restricted_approved) |
| `customer_name` | `text` | NOT NULL |
| `customer_email` | `text` | NOT NULL |
| `item_type` | `text` | NOT NULL |
| `quantity` | `int4` | NOT NULL, default 1, CHECK (> 0) |
| `deadline` | `date` | nullable |
| `budget_range` | `text` | nullable |
| `description` | `text` | NOT NULL |
| `files` | `jsonb` | NOT NULL, default '[]' |
| `design_help_needed` | `bool` | NOT NULL, default false |
| `ip_rights_confirmed` | `bool` | NOT NULL, default false |
| `age_confirmed` | `bool` | NOT NULL, default false |
| `tos_accepted` | `bool` | NOT NULL, default false |
| `branch` | `text` | NOT NULL, default 'DEV', CHECK (DEV, TEST, PROD) |
| `quote_amount` | `numeric(10,2)` | nullable |
| `stripe_payment_link_id` | `text` | nullable |
| `stripe_payment_link_url` | `text` | nullable |
| `admin_notes` | `text` | nullable |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |
| `customer_access_token` | `text` | nullable — **added by 009** |
| `customer_access_expires_at` | `timestamptz` | nullable — **added by 009** |
| `customer_id` | `uuid` | **DROPPED by 042** |
| `quote_sent_at` | `timestamptz` | nullable — **added by 019** |
| `quote_expires_at` | `timestamptz` | nullable — **added by 019** |
| `quote_last_resent_at` | `timestamptz` | nullable — **added by 019** |
| `quote_resend_count` | `int4` | NOT NULL, default 0 — **added by 019** |
| `production_handoff_at` | `timestamptz` | nullable — **added by 019** |
| `recovery_reminder_sent_at` | `timestamptz` | nullable — **added by 025** |

**Indexes:** `idx_exp_custom_requests_status`, `idx_exp_custom_requests_email`, `idx_exp_custom_requests_created`, `idx_exp_custom_requests_access_token` (WHERE not null), `idx_exp_custom_requests_access_expires` (WHERE not null), `idx_exp_custom_requests_quote_expires` (WHERE not null), `idx_exp_custom_requests_handoff` (WHERE not null), `idx_exp_custom_requests_recovery`
**RLS:** Enabled. No public read policy (submissions via service-role only).
**Source:** Migration 003. Columns added by 009, 010 (customer_id later dropped by 042), 019, 025.

---

## 4. Storefront

### `exp_storefront_settings`
| Column | Type | Constraints |
|--------|------|-------------|
| `setting_key` | `text` | PK |
| `setting_value` | `jsonb` | NOT NULL, default '{}' |
| `description` | `text` | nullable |
| `updated_at` | `timestamptz` | NOT NULL, default now() |

**Indexes:** `idx_exp_storefront_settings_updated_at`
**Triggers:** `trg_storefront_settings_updated_at`
**RLS:** Enabled. Policy: `public_read_storefront_settings` (SELECT, public, `true`)
**Source:** Migration 005.

---

### `exp_budget_ranges`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `label` | `text` | NOT NULL |
| `value` | `text` | NOT NULL, UNIQUE |
| `min_amount` | `numeric(10,2)` | nullable |
| `max_amount` | `numeric(10,2)` | nullable |
| `is_active` | `bool` | NOT NULL, default true |
| `sort_order` | `int4` | NOT NULL, default 0 |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |

**Indexes:** `idx_budget_ranges_active_sort`
**RLS:** Enabled. No anon/authenticated access. service_role only.
**Source:** Migration 015.

---

### `exp_promo_codes`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `code` | `text` | NOT NULL |
| `description` | `text` | NOT NULL, default '' |
| `discount_type` | `text` | NOT NULL, CHECK (percent, fixed_amount, free_shipping) |
| `discount_value` | `numeric(12,2)` | NOT NULL, default 0 |
| `is_active` | `bool` | NOT NULL, default true |
| `usage_limit` | `int4` | nullable |
| `usage_count` | `int4` | NOT NULL, default 0 |
| `valid_from` | `timestamptz` | nullable |
| `valid_to` | `timestamptz` | nullable |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |

**Indexes:** `idx_exp_promo_codes_code_unique` (lower(code)), `idx_exp_promo_codes_is_active`, `idx_exp_promo_codes_valid_window`
**Triggers:** `trg_exp_promo_codes_updated_at`
**RLS:** Enabled. Policy: `exp_promo_codes_public_read` (SELECT, public, `is_active = true`)
**Source:** Migration 023.

---

### `exp_bundle_deals`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `name` | `text` | NOT NULL |
| `description` | `text` | NOT NULL, default '' |
| `trigger_type` | `text` | NOT NULL, CHECK (automatic, code) |
| `code` | `text` | nullable |
| `conditions_json` | `jsonb` | NOT NULL, default '{}' |
| `rewards_json` | `jsonb` | NOT NULL, default '{}' |
| `is_active` | `bool` | NOT NULL, default true |
| `is_stackable` | `bool` | NOT NULL, default true |
| `usage_limit` | `int4` | nullable |
| `usage_count` | `int4` | NOT NULL, default 0 |
| `valid_from` | `timestamptz` | nullable |
| `valid_to` | `timestamptz` | nullable |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |

**Check:** `((trigger_type = 'code' AND code IS NOT NULL AND length(trim(code)) > 0) OR trigger_type = 'automatic')`
**Indexes:** `idx_exp_bundle_deals_code_unique` (lower(code) WHERE not null), `idx_exp_bundle_deals_is_active`, `idx_exp_bundle_deals_trigger_type`, `idx_exp_bundle_deals_valid_window`
**Triggers:** `trg_exp_bundle_deals_updated_at`
**RLS:** Enabled. Policy: `exp_bundle_deals_public_read` (SELECT, public, `is_active = true`)
**Source:** Migration 023.

---

### `exp_cart_captures`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `email` | `text` | NOT NULL |
| `cart_json` | `jsonb` | NOT NULL, default '[]' |
| `recovery_sent_at` | `timestamptz` | nullable |
| `order_id` | `uuid` | nullable, FK → `exp_orders(id)` ON DELETE SET NULL |
| `ip_hash` | `text` | nullable |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |

**Indexes:** `idx_exp_cart_captures_recovery`, `idx_exp_cart_captures_email`
**Triggers:** `trg_exp_cart_captures_updated_at`
**RLS:** Enabled. No public reads. service_role only.
**Source:** Migration 024.

---

## 5. Orders

### `exp_orders`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `order_path` | `text` | NOT NULL, default 'shop', CHECK (shop, ready_made, custom) |
| `payment_mode` | `text` | NOT NULL, default 'stripe_checkout', CHECK (stripe_checkout, stripe_payment_link) |
| `payment_status` | `text` | NOT NULL, default 'pending', CHECK (pending, paid, failed, refunded) |
| `status` | `text` | NOT NULL, default 'awaiting_payment', CHECK (awaiting_payment, paid, in_production, ready_to_ship, shipped, delivered, cancelled) |
| `stripe_session_id` | `text` | UNIQUE |
| `production_estimate_band` | `text` | NOT NULL, default 'To be confirmed' |
| `subtotal` | `numeric(10,2)` | NOT NULL, default 0 |
| `discount_amount` | `numeric(10,2)` | NOT NULL, default 0 |
| `shipping_cost` | `numeric(10,2)` | NOT NULL, default 0 |
| `order_total` | `numeric(10,2)` | NOT NULL, default 0 |
| `shipping_method` | `text` | NOT NULL, default 'standard' |
| `shipping_address` | `jsonb` | NOT NULL, default '{}' |
| `cart_snapshot` | `jsonb` | NOT NULL, default '{}' |
| `branch` | `text` | NOT NULL, default 'DEV', CHECK (DEV, TEST, PROD) |
| `paid_at` | `timestamptz` | nullable |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |
| `guest_tracking_token` | `text` | nullable — **added by 007** |
| `guest_tracking_expires_at` | `timestamptz` | nullable — **added by 007** |
| `stripe_payment_intent_id` | `text` | nullable — **added by 007** |
| `custom_request_id` | `uuid` | nullable, FK → `exp_custom_requests(id)` — **added by 009** |
| `stripe_payment_link_id` | `text` | nullable — **added by 009** |
| `customer_id` | `uuid` | **DROPPED by 042** |
| `claimed_at` | `timestamptz` | **DROPPED by 042** |
| `inventory_reserved_at` | `timestamptz` | nullable — **added by 017** |
| `inventory_released_at` | `timestamptz` | nullable — **added by 017** |
| `cancelled_at` | `timestamptz` | nullable — **added by 018** |
| `refunded_at` | `timestamptz` | nullable — **added by 018** |
| `shipping_carrier` | `text` | nullable — **added by 018** |
| `tracking_number` | `text` | nullable — **added by 018** |
| `cart_recovery_email_sent_at` | `timestamptz` | nullable — **added by 024** |

**Indexes:** `idx_exp_orders_status`, `idx_exp_orders_created`, `idx_exp_orders_guest_tracking_token` (WHERE not null), `idx_exp_orders_guest_tracking_expires` (WHERE not null), `idx_exp_orders_stripe_payment_intent` (WHERE not null), `idx_exp_orders_payment_link_id` (WHERE not null), `idx_exp_orders_custom_request` (WHERE not null). `idx_orders_customer_id` **DROPPED by 042**.
**Triggers:** `trg_exp_orders_updated_at`
**RLS:** Enabled. **No public SELECT policy** (dropped by 048). No UPDATE policy (dropped by 048).
**Replica Identity:** FULL (set by 039)
**Source:** Migration 006. Columns added by 007, 009, 010 (customer_id/claimed_at later dropped by 042), 017, 018, 024. Policies dropped by 039/048.

---

### `exp_order_items`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `order_id` | `uuid` | NOT NULL, FK → `exp_orders(id)` ON DELETE CASCADE |
| `product_id` | `uuid` | nullable |
| `product_title` | `text` | NOT NULL |
| `variant_label` | `text` | nullable |
| `selected_options` | `jsonb` | NOT NULL, default '{}' |
| `unit_price` | `numeric(10,2)` | NOT NULL, default 0 |
| `quantity` | `int4` | NOT NULL, CHECK (> 0) |
| `line_subtotal` | `numeric(10,2)` | NOT NULL, default 0 |
| `line_discount` | `numeric(10,2)` | NOT NULL, default 0 |
| `line_total` | `numeric(10,2)` | NOT NULL, default 0 |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `option_snapshot` | `jsonb` | NOT NULL, default '{}' — **added by 028** |
| `nfc_target_data` | `text` | nullable — **added by 037** |
| `leave_unlocked` | `bool` | NOT NULL, default false — **added by 037** |
| `source_file_url` | `text` | nullable — **added by 037** |

**Indexes:** `idx_exp_order_items_order`, `idx_exp_order_items_source_file` (added by 037)
**RLS:** Enabled. **No public SELECT policy** (dropped by 048). No UPDATE policy (dropped by 048).
**Replica Identity:** FULL (set by 039)
**Source:** Migration 006. Columns added by 028, 037. Policies dropped by 039/048.

---

### `exp_order_status_events`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `order_id` | `uuid` | NOT NULL, FK → `exp_orders(id)` ON DELETE CASCADE |
| `action_type` | `text` | NOT NULL, CHECK (status_transition, cancel, refund_marked, note, schedule_hook, hook_completed) |
| `previous_status` | `text` | nullable |
| `next_status` | `text` | nullable |
| `previous_payment_status` | `text` | nullable |
| `next_payment_status` | `text` | nullable |
| `note` | `text` | nullable |
| `metadata` | `jsonb` | NOT NULL, default '{}' |
| `created_by` | `text` | nullable |
| `created_at` | `timestamptz` | NOT NULL, default now() |

**Indexes:** `idx_exp_order_status_events_order`
**RLS:** Enabled. No public read policy (service_role only).
**Source:** Migration 018.

---

### `exp_order_internal_notes`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `order_id` | `uuid` | NOT NULL, FK → `exp_orders(id)` ON DELETE CASCADE |
| `note` | `text` | NOT NULL |
| `is_pinned` | `bool` | NOT NULL, default false |
| `created_by` | `text` | nullable |
| `created_at` | `timestamptz` | NOT NULL, default now() |

**Indexes:** `idx_exp_order_internal_notes_order`
**RLS:** Enabled. No public read policy (service_role only).
**Source:** Migration 018.

---

### `exp_order_production_hooks`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `order_id` | `uuid` | NOT NULL, FK → `exp_orders(id)` ON DELETE CASCADE |
| `stage` | `text` | NOT NULL, CHECK (design, setup, production, finishing, packing) |
| `scheduled_for` | `timestamptz` | nullable |
| `estimated_hours` | `numeric(8,2)` | nullable |
| `assignee` | `text` | nullable |
| `note` | `text` | nullable |
| `is_completed` | `bool` | NOT NULL, default false |
| `completed_at` | `timestamptz` | nullable |
| `created_by` | `text` | nullable |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |

**Indexes:** `idx_exp_order_production_hooks_order`
**Triggers:** `trg_exp_order_production_hooks_updated_at`
**RLS:** Enabled. No public read policy (service_role only).
**Source:** Migration 018.

---

## 6. Inventory

### `exp_product_inventory`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `product_id` | `uuid` | NOT NULL, FK → `exp_products(id)` ON DELETE CASCADE, UNIQUE |
| `available_qty` | `int4` | NOT NULL, default 0, CHECK (>= 0) |
| `low_stock_threshold` | `int4` | NOT NULL, default 3, CHECK (>= 0) |
| `availability_override` | `text` | NOT NULL, default 'inherit', CHECK (inherit, force_in_stock, force_out_of_stock) |
| `is_track_inventory` | `bool` | NOT NULL, default false |
| `last_adjusted_at` | `timestamptz` | nullable |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |

**Indexes:** `idx_exp_product_inventory_tracking`
**Triggers:** `trg_exp_product_inventory_updated_at`
**RLS:** Enabled. No public read policy (service_role only).
**Source:** Migration 017.

---

### `exp_inventory_adjustments`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `inventory_id` | `uuid` | nullable, FK → `exp_product_inventory(id)` ON DELETE SET NULL |
| `product_id` | `uuid` | nullable, FK → `exp_products(id)` ON DELETE SET NULL |
| `order_id` | `uuid` | nullable, FK → `exp_orders(id)` ON DELETE SET NULL |
| `change_qty` | `int4` | NOT NULL |
| `quantity_before` | `int4` | nullable |
| `quantity_after` | `int4` | nullable |
| `reason_code` | `text` | NOT NULL, CHECK (initial_set, manual_correction, restock, damaged, order_reserved, order_released, bulk_update) |
| `note` | `text` | nullable |
| `adjusted_by` | `text` | nullable |
| `created_at` | `timestamptz` | NOT NULL, default now() |

**Indexes:** `idx_exp_inventory_adjustments_product`, `idx_exp_inventory_adjustments_order`
**RLS:** Enabled. No public read policy (service_role only).
**Source:** Migration 017.

---

## 7. Finance & Labor

### `exp_material_catalog`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `key` | `text` | NOT NULL, UNIQUE |
| `name` | `text` | NOT NULL |
| `unit_name` | `text` | NOT NULL, default 'unit' |
| `is_active` | `bool` | NOT NULL, default true |
| `notes` | `text` | nullable |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |

**Triggers:** `trg_exp_material_catalog_updated_at`
**RLS:** Enabled. No public read policy (service_role only).
**Source:** Migration 021.

---

### `exp_material_cost_history`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `material_id` | `uuid` | NOT NULL, FK → `exp_material_catalog(id)` ON DELETE CASCADE |
| `cost_per_unit` | `numeric(12,4)` | NOT NULL, CHECK (>= 0) |
| `effective_from` | `timestamptz` | NOT NULL, default now() |
| `supplier_label` | `text` | nullable |
| `notes` | `text` | nullable |
| `created_at` | `timestamptz` | NOT NULL, default now() |

**Indexes:** `idx_exp_material_cost_history_material`
**RLS:** Enabled. No public read policy (service_role only).
**Source:** Migration 021.

---

### `exp_labor_time_entries`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `order_id` | `uuid` | nullable, FK → `exp_orders(id)` ON DELETE SET NULL |
| `order_item_id` | `uuid` | nullable, FK → `exp_order_items(id)` ON DELETE SET NULL |
| `stage` | `text` | NOT NULL, CHECK (design, setup, production, finishing, packing) |
| `minutes` | `int4` | NOT NULL, CHECK (> 0) |
| `hourly_rate` | `numeric(10,2)` | NOT NULL, default 0, CHECK (>= 0) |
| `note` | `text` | nullable |
| `logged_by` | `text` | nullable |
| `logged_at` | `timestamptz` | NOT NULL, default now() |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |

**Indexes:** `idx_exp_labor_time_entries_order`, `idx_exp_labor_time_entries_item`, `idx_exp_labor_time_entries_stage`
**Triggers:** `trg_exp_labor_time_entries_updated_at`
**RLS:** Enabled. No public read policy (service_role only).
**Source:** Migration 021.

---

### `exp_order_item_material_usage`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `order_item_id` | `uuid` | NOT NULL, FK → `exp_order_items(id)` ON DELETE CASCADE |
| `material_id` | `uuid` | nullable, FK → `exp_material_catalog(id)` ON DELETE SET NULL |
| `quantity_used` | `numeric(12,4)` | NOT NULL, CHECK (>= 0) |
| `unit_cost_snapshot` | `numeric(12,4)` | NOT NULL, CHECK (>= 0) |
| `total_cost_snapshot` | `numeric(12,4)` | GENERATED ALWAYS AS (quantity_used * unit_cost_snapshot) STORED |
| `note` | `text` | nullable |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |

**Indexes:** `idx_exp_order_item_material_usage_item`
**Triggers:** `trg_exp_order_item_material_usage_updated_at`
**RLS:** Enabled. No public read policy (service_role only).
**Source:** Migration 021.

---

### `exp_machine_schedule_blocks`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `order_id` | `uuid` | nullable, FK → `exp_orders(id)` ON DELETE SET NULL |
| `order_item_id` | `uuid` | nullable, FK → `exp_order_items(id)` ON DELETE SET NULL |
| `custom_request_id` | `uuid` | nullable, FK → `exp_custom_requests(id)` ON DELETE SET NULL |
| `stage` | `text` | NOT NULL, CHECK (design, setup, production, finishing, packing) |
| `start_at` | `timestamptz` | NOT NULL |
| `end_at` | `timestamptz` | NOT NULL |
| `estimated_hours` | `numeric(8,2)` | NOT NULL, CHECK (>= 0) |
| `is_locked` | `bool` | NOT NULL, default false |
| `note` | `text` | nullable |
| `created_by` | `text` | nullable |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |

**Check:** `end_at > start_at`
**Indexes:** `idx_exp_machine_schedule_blocks_window`, `idx_exp_machine_schedule_blocks_order`
**Triggers:** `trg_exp_machine_schedule_blocks_updated_at`
**RLS:** Enabled. No public read policy (service_role only).
**Source:** Migration 021.

---

## 8. Customer Engagement

### `exp_newsletter_subscribers`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `email` | `text` | NOT NULL, UNIQUE |
| `customer_id` | `uuid` | **DROPPED by 042** |
| `source` | `text` | nullable |
| `subscribed` | `bool` | NOT NULL, default true |
| `subscribed_at` | `timestamptz` | NOT NULL, default now() |
| `unsubscribed_at` | `timestamptz` | nullable |
| `consent_ip` | `text` | nullable |
| `consent_user_agent` | `text` | nullable |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |

**Indexes:** `idx_newsletter_subscribers_email`, `idx_newsletter_subscribers_subscribed`. `idx_newsletter_subscribers_customer_id` **DROPPED by 042**.
**RLS:** Enabled. No anon/authenticated access. service_role only.
**Source:** Migration 014. `customer_id` dropped by 042.

---

### `exp_back_in_stock_alerts`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `product_id` | `uuid` | NOT NULL, FK → `exp_products(id)` ON DELETE CASCADE |
| `email` | `text` | NOT NULL |
| `customer_id` | `uuid` | **DROPPED by 042** |
| `status` | `text` | NOT NULL, default 'active', CHECK (active, notified, unsubscribed) |
| `source` | `text` | NOT NULL, default 'product_page' |
| `consent_ip` | `text` | nullable |
| `consent_user_agent` | `text` | nullable |
| `subscribed_at` | `timestamptz` | NOT NULL, default now() |
| `notified_at` | `timestamptz` | nullable |
| `unsubscribed_at` | `timestamptz` | nullable |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |

**Unique:** `(product_id, email)`
**Indexes:** `idx_exp_back_in_stock_alerts_status`, `idx_exp_back_in_stock_alerts_product`
**Triggers:** `trg_exp_back_in_stock_alerts_updated_at`
**RLS:** Enabled. No public read policy (service_role only).
**Source:** Migration 022. `customer_id` dropped by 042.

---

### `exp_capacity_reopen_alerts`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `category_key` | `text` | NOT NULL |
| `email` | `text` | NOT NULL |
| `customer_id` | `uuid` | **DROPPED by 042** |
| `status` | `text` | NOT NULL, default 'active', CHECK (active, notified, unsubscribed) |
| `source` | `text` | NOT NULL, default 'category_page' |
| `subscribed_at` | `timestamptz` | NOT NULL, default now() |
| `notified_at` | `timestamptz` | nullable |
| `unsubscribed_at` | `timestamptz` | nullable |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |

**Unique:** `(category_key, email)`
**Indexes:** `idx_exp_capacity_reopen_alerts_status`, `idx_exp_capacity_reopen_alerts_category`
**Triggers:** `trg_exp_capacity_reopen_alerts_updated_at`
**RLS:** Enabled. No public read policy (service_role only).
**Source:** Migration 026. `customer_id` dropped by 042.

---

## 9. Admin

### `exp_admin_audit_log`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `action` | `text` | NOT NULL |
| `entity_type` | `text` | NOT NULL |
| `entity_id` | `text` | nullable |
| `route` | `text` | NOT NULL |
| `request_ip` | `text` | nullable |
| `user_agent` | `text` | nullable |
| `status` | `text` | NOT NULL, CHECK (success, failure) |
| `details` | `jsonb` | NOT NULL, default '{}' |
| `branch` | `text` | NOT NULL |
| `created_at` | `timestamptz` | NOT NULL, default now() |

**Indexes:** `idx_admin_audit_log_created_at`, `idx_admin_audit_log_entity`
**RLS:** Enabled. No anon/authenticated access. service_role only.
**Source:** Migration 016.

---

### `exp_stripe_webhook_events`
| Column | Type | Constraints |
|--------|------|-------------|
| `event_id` | `text` | PK |
| `event_type` | `text` | NOT NULL |
| `status` | `text` | NOT NULL, CHECK (processing, processed, failed), default 'processing' |
| `last_error` | `text` | nullable |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |
| `processed_at` | `timestamptz` | nullable |

**Indexes:** `idx_stripe_webhook_events_status_created_at`
**RLS:** Enabled. No anon/authenticated access. service_role only.
**Source:** Migration 016.

---

### `exp_admin_notifications`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `source_type` | `text` | NOT NULL, CHECK (order, custom_request, system) |
| `source_id` | `text` | NOT NULL |
| `event_type` | `text` | NOT NULL |
| `title` | `text` | NOT NULL |
| `body` | `text` | nullable |
| `href` | `text` | nullable |
| `is_read` | `bool` | NOT NULL, default false |
| `read_at` | `timestamptz` | nullable |
| `metadata` | `jsonb` | NOT NULL, default '{}' |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `updated_at` | `timestamptz` | NOT NULL, default now() |

**Unique:** `(source_type, source_id, event_type)`
**Indexes:** `idx_exp_admin_notifications_unread`, `idx_exp_admin_notifications_source`
**Triggers:** `trg_exp_admin_notifications_updated_at`
**RLS:** Enabled. No public read policy (service_role only).
**Source:** Migration 020.

---

## 10. Security & Infrastructure

### `exp_square_webhook_events`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `text` | PK (Square event.id) |
| `event_type` | `text` | NOT NULL |
| `received_at` | `timestamptz` | NOT NULL, default now() |
| `processed` | `bool` | NOT NULL, default true |

**Indexes:** `idx_exp_square_webhook_events_received`
**RLS:** Enabled. No anon/authenticated access. service_role only.
**Source:** Migration 043 (recreated by 048).

---

### `exp_rate_limit_windows`
| Column | Type | Constraints |
|--------|------|-------------|
| `key` | `text` | NOT NULL, PK |
| `window_start` | `bigint` | NOT NULL |
| `count` | `int4` | NOT NULL, default 1 |
| `expires_at` | `timestamptz` | NOT NULL |

**Indexes:** `idx_exp_rate_limit_windows_expires` (added by 048)
**RLS:** Enabled. No anon/authenticated access. service_role only.
**Source:** Migration 044 (recreated by 048).

---

### `exp_admin_sessions`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `token_hash` | `text` | NOT NULL, UNIQUE |
| `jti` | `text` | NOT NULL, UNIQUE |
| `ip_address` | `text` | nullable |
| `user_agent` | `text` | nullable |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `expires_at` | `timestamptz` | NOT NULL |
| `revoked_at` | `timestamptz` | nullable |
| `last_activity_at` | `timestamptz` | nullable |

**Indexes:** `idx_exp_admin_sessions_token_hash`, `idx_exp_admin_sessions_expires`
**RLS:** Enabled. No anon/authenticated access. service_role only.
**Source:** Migration 045 (recreated by 048).

---

### `exp_artwork_uploads`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default gen_random_uuid() |
| `upload_token` | `text` | NOT NULL, UNIQUE |
| `file_path` | `text` | NOT NULL |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `expires_at` | `timestamptz` | NOT NULL, default `now() + interval '24 hours'` |

**Indexes:** `idx_exp_artwork_uploads_token`, `idx_exp_artwork_uploads_expires`
**RLS:** Enabled. No anon/authenticated access. service_role only.
**Source:** Migration 046 (recreated by 048).

---

### `admin_mfa_codes`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `bigint` | PK, GENERATED ALWAYS AS IDENTITY |
| `ip` | `text` | nullable — **made nullable by 041** |
| `code` | `text` | NOT NULL |
| `created_at` | `timestamptz` | NOT NULL, default now() |
| `expires_at` | `timestamptz` | NOT NULL |
| `used` | `bool` | NOT NULL, default false |
| `challenge_token` | `text` | nullable — **added by 041** |
| `device_fingerprint` | `text` | nullable — **added by 041** |

**Indexes:** `idx_admin_mfa_codes_expires`, `idx_admin_mfa_codes_challenge_token` (added by 041). `idx_admin_mfa_codes_ip` **dropped by 041**.
**RLS:** Enabled. No anon/authenticated access. service_role only.
**Source:** Migration 040. Modified by 041.

---

## 11. Views

### `exp_commission_queue` (VIEW)
Anonymized production queue view. Contains only masked order IDs, character names (if provided), and fabrication status. No PII exposed.

| Column | Source |
|--------|--------|
| `order_id` | `exp_orders.id` |
| `order_path` | `exp_orders.order_path` |
| `item_id` | `exp_order_items.id` |
| `product_title` | `exp_order_items.product_title` |
| `variant_label` | `exp_order_items.variant_label` |
| `display_name` | `selected_options->>'character_name'` or masked order ID |
| `status` | `exp_orders.status` |
| `nfc_target_data` | `exp_order_items.nfc_target_data` |
| `leave_unlocked` | `exp_order_items.leave_unlocked` |
| `production_estimate_band` | `exp_orders.production_estimate_band` |
| `order_created_at` | `exp_orders.created_at` |
| `paid_at` | `exp_orders.paid_at` |

**Filter:** `exp_orders.status NOT IN ('cancelled', 'delivered') AND exp_orders.payment_status = 'paid'`
**Grants:** SELECT to `authenticated`
**Source:** Migration 038.

---

## Summary

| Domain | Table Count |
|--------|-------------|
| Homepage CMS | 7 |
| Product Catalog | 9 |
| Custom Requests | 1 |
| Storefront | 4 |
| Orders | 5 |
| Inventory | 2 |
| Finance & Labor | 5 |
| Customer Engagement | 3 |
| Admin | 3 |
| Security & Infrastructure | 5 |
| Views | 1 |
| **Total** | **45 tables + 1 view** |

**Tables dropped by migration 042 (NOT in final state):** `exp_customers`, `exp_customer_sessions`, `exp_password_reset_tokens`, `exp_customer_addresses`, `exp_wishlists`, `exp_recently_viewed` (6 tables)
