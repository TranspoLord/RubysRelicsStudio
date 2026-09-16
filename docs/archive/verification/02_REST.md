# Rest — RLS, Indexes, Triggers, Storage, Data, Privileges (001–048)

> This document covers everything that isn't a table or function: RLS policies, indexes, triggers, storage buckets, views, data inserts, column additions, constraint modifications, privilege grants, and replica identity settings.

---

## 1. RLS Policies

### Public Read Policies (anon + authenticated)

| Table | Policy Name | Command | USING |
|-------|-------------|---------|-------|
| `exp_taxonomy` | `public read taxonomy` | SELECT | `visible = true` |
| `exp_homepage_sections` | `public read homepage sections` | SELECT | `true` |
| `exp_featured_collections` | `public read featured collections` | SELECT | `is_visible = true` |
| `exp_gallery` | `public read published gallery` | SELECT | `moderation_status = 'published' AND visible = true` |
| `exp_testimonials` | `public read visible testimonials` | SELECT | `is_visible = true` |
| `exp_announcement` | `public read active announcement` | SELECT | `is_active = true` |
| `exp_faq` | `public read visible faq` | SELECT | `is_visible = true` |
| `exp_products` | `public_read_active_products` | SELECT | `is_active = true AND is_archived = false` |
| `exp_product_variants` | `public_read_product_variants` | SELECT | subquery on exp_products |
| `exp_product_media` | `public_read_product_media` | SELECT | subquery on exp_products |
| `exp_product_options` | `public_read_product_options` | SELECT | subquery on exp_products |
| `exp_product_option_values` | `public_read_product_option_values` | SELECT | subquery joining exp_product_options + exp_products |
| `exp_product_bulk_discounts` | `public_read_product_bulk_discounts` | SELECT | `is_enabled = true AND subquery on exp_products` |
| `exp_storefront_settings` | `public_read_storefront_settings` | SELECT | `true` |
| `exp_promo_codes` | `exp_promo_codes_public_read` | SELECT | `is_active = true` |
| `exp_bundle_deals` | `exp_bundle_deals_public_read` | SELECT | `is_active = true` |
| `exp_product_process_types` | `public read product process types` | SELECT | `true` |
| `exp_product_process_pricing` | `public read enabled product process pricing` | SELECT | `is_enabled = true` |
| `exp_product_combo_discounts` | `public read enabled product combo discounts` | SELECT | `is_enabled = true` |

### Service-Role Only (No anon/authenticated access)

These tables have RLS enabled but NO public policies. Access is via service_role only.

| Table | Source |
|-------|--------|
| `exp_custom_requests` | 003 |
| `exp_budget_ranges` | 015 |
| `exp_admin_audit_log` | 016 |
| `exp_stripe_webhook_events` | 016 |
| `exp_product_inventory` | 017 |
| `exp_inventory_adjustments` | 017 |
| `exp_order_status_events` | 018 |
| `exp_order_internal_notes` | 018 |
| `exp_order_production_hooks` | 018 |
| `exp_admin_notifications` | 020 |
| `exp_material_catalog` | 021 |
| `exp_material_cost_history` | 021 |
| `exp_labor_time_entries` | 021 |
| `exp_order_item_material_usage` | 021 |
| `exp_machine_schedule_blocks` | 021 |
| `exp_back_in_stock_alerts` | 022 |
| `exp_cart_captures` | 024 |
| `exp_capacity_reopen_alerts` | 026 |
| `exp_square_webhook_events` | 043/048 |
| `exp_rate_limit_windows` | 044/048 |
| `exp_admin_sessions` | 045/048 |
| `exp_artwork_uploads` | 046/048 |
| `admin_mfa_codes` | 040 |
| `exp_newsletter_subscribers` | 014 |

### Dropped Policies (by migration 048)

These policies were created by migration 039 but reference the dropped `customer_id` column. They are **dropped** by migration 048:

| Table | Policy Name | Command |
|-------|-------------|---------|
| `exp_orders` | `users_select_own_orders` | SELECT |
| `exp_orders` | `users_update_own_orders` | UPDATE |
| `exp_order_items` | `users_select_own_order_items` | SELECT |
| `exp_order_items` | `users_update_own_order_items` | UPDATE |

### Dropped Policies (by migration 013)

These auth.uid()-based policies were removed because the app uses custom sessions, not Supabase Auth:

| Table | Policy Name |
|-------|-------------|
| `exp_wishlists` | `Customers can view own wishlists` |
| `exp_recently_viewed` | `Customers can view own recently viewed` |

### View Grants

| View | Grantee | Privilege |
|------|---------|-----------|
| `exp_commission_queue` | `authenticated` | SELECT |

---

## 2. Indexes

### Homepage CMS
| Index | Table | Columns |
|-------|-------|---------|
| `idx_exp_taxonomy_type` | exp_taxonomy | type |
| `idx_exp_taxonomy_visible` | exp_taxonomy | visible |
| `idx_exp_featured_visible` | exp_featured_collections | is_visible |
| `idx_exp_gallery_status` | exp_gallery | moderation_status |
| `idx_exp_gallery_visible` | exp_gallery | visible |
| `idx_exp_testimonials_visible` | exp_testimonials | is_visible |
| `idx_exp_faq_section` | exp_faq | section |

### Product Catalog
| Index | Table | Columns |
|-------|-------|---------|
| `idx_exp_products_category` | exp_products | category_key |
| `idx_exp_products_active` | exp_products | is_active, is_archived |
| `idx_exp_products_slug` | exp_products | slug |
| `idx_exp_products_square_enabled` | exp_products | is_square_enabled (WHERE true) |
| `idx_exp_product_variants_product` | exp_product_variants | product_id |
| `idx_exp_product_media_product` | exp_product_media | product_id |
| `idx_exp_product_options_product` | exp_product_options | product_id |
| `idx_exp_product_option_values_option` | exp_product_option_values | option_id |
| `idx_exp_product_bulk_discounts_product` | exp_product_bulk_discounts | product_id |
| `idx_exp_product_bulk_discounts_enabled` | exp_product_bulk_discounts | is_enabled, sort_order |
| `idx_exp_product_process_types_product` | exp_product_process_types | product_id |
| `idx_exp_product_process_types_key` | exp_product_process_types | process_type_key |
| `idx_exp_product_process_pricing_product` | exp_product_process_pricing | product_id |
| `idx_exp_product_process_pricing_key` | exp_product_process_pricing | process_type_key |
| `idx_exp_product_combo_discounts_product` | exp_product_combo_discounts | product_id |

### Custom Requests
| Index | Table | Columns |
|-------|-------|---------|
| `idx_exp_custom_requests_status` | exp_custom_requests | status |
| `idx_exp_custom_requests_email` | exp_custom_requests | customer_email |
| `idx_exp_custom_requests_created` | exp_custom_requests | created_at DESC |
| `idx_exp_custom_requests_access_token` | exp_custom_requests | customer_access_token (WHERE not null) |
| `idx_exp_custom_requests_access_expires` | exp_custom_requests | customer_access_expires_at (WHERE not null) |
| `idx_exp_custom_requests_quote_expires` | exp_custom_requests | quote_expires_at (WHERE not null) |
| `idx_exp_custom_requests_handoff` | exp_custom_requests | production_handoff_at (WHERE not null) |
| `idx_exp_custom_requests_recovery` | exp_custom_requests | status, recovery_reminder_sent_at, created_at ASC |

### Storefront
| Index | Table | Columns |
|-------|-------|---------|
| `idx_exp_storefront_settings_updated_at` | exp_storefront_settings | updated_at DESC |
| `idx_budget_ranges_active_sort` | exp_budget_ranges | is_active, sort_order |
| `idx_exp_promo_codes_code_unique` | exp_promo_codes | lower(code) |
| `idx_exp_promo_codes_is_active` | exp_promo_codes | is_active |
| `idx_exp_promo_codes_valid_window` | exp_promo_codes | valid_from, valid_to |
| `idx_exp_bundle_deals_code_unique` | exp_bundle_deals | lower(code) (WHERE not null) |
| `idx_exp_bundle_deals_is_active` | exp_bundle_deals | is_active |
| `idx_exp_bundle_deals_trigger_type` | exp_bundle_deals | trigger_type |
| `idx_exp_bundle_deals_valid_window` | exp_bundle_deals | valid_from, valid_to |
| `idx_exp_cart_captures_recovery` | exp_cart_captures | recovery_sent_at, order_id, created_at ASC |
| `idx_exp_cart_captures_email` | exp_cart_captures | email, created_at DESC |

### Orders
| Index | Table | Columns |
|-------|-------|---------|
| `idx_exp_orders_status` | exp_orders | status, payment_status |
| `idx_exp_orders_created` | exp_orders | created_at DESC |
| `idx_exp_orders_guest_tracking_token` | exp_orders | guest_tracking_token (WHERE not null) |
| `idx_exp_orders_guest_tracking_expires` | exp_orders | guest_tracking_expires_at (WHERE not null) |
| `idx_exp_orders_stripe_payment_intent` | exp_orders | stripe_payment_intent_id (WHERE not null) |
| `idx_exp_orders_payment_link_id` | exp_orders | stripe_payment_link_id (WHERE not null) |
| `idx_exp_orders_custom_request` | exp_orders | custom_request_id (WHERE not null) |
| `idx_exp_order_items_order` | exp_order_items | order_id |
| `idx_exp_order_items_source_file` | exp_order_items | source_file_url |
| `idx_exp_order_status_events_order` | exp_order_status_events | order_id, created_at DESC |
| `idx_exp_order_internal_notes_order` | exp_order_internal_notes | order_id, created_at DESC |
| `idx_exp_order_production_hooks_order` | exp_order_production_hooks | order_id, stage, is_completed, created_at DESC |

### Inventory
| Index | Table | Columns |
|-------|-------|---------|
| `idx_exp_product_inventory_tracking` | exp_product_inventory | is_track_inventory, availability_override |
| `idx_exp_inventory_adjustments_product` | exp_inventory_adjustments | product_id, created_at DESC |
| `idx_exp_inventory_adjustments_order` | exp_inventory_adjustments | order_id, created_at DESC |

### Finance & Labor
| Index | Table | Columns |
|-------|-------|---------|
| `idx_exp_material_cost_history_material` | exp_material_cost_history | material_id, effective_from DESC |
| `idx_exp_labor_time_entries_order` | exp_labor_time_entries | order_id, logged_at DESC |
| `idx_exp_labor_time_entries_item` | exp_labor_time_entries | order_item_id, logged_at DESC |
| `idx_exp_labor_time_entries_stage` | exp_labor_time_entries | stage, logged_at DESC |
| `idx_exp_order_item_material_usage_item` | exp_order_item_material_usage | order_item_id, created_at DESC |
| `idx_exp_machine_schedule_blocks_window` | exp_machine_schedule_blocks | start_at ASC, end_at ASC |
| `idx_exp_machine_schedule_blocks_order` | exp_machine_schedule_blocks | order_id, stage, start_at DESC |

### Customer Engagement
| Index | Table | Columns |
|-------|-------|---------|
| `idx_newsletter_subscribers_email` | exp_newsletter_subscribers | email |
| `idx_newsletter_subscribers_subscribed` | exp_newsletter_subscribers | subscribed |
| `idx_exp_back_in_stock_alerts_status` | exp_back_in_stock_alerts | status, created_at DESC |
| `idx_exp_back_in_stock_alerts_product` | exp_back_in_stock_alerts | product_id, status |
| `idx_exp_capacity_reopen_alerts_status` | exp_capacity_reopen_alerts | status, created_at DESC |
| `idx_exp_capacity_reopen_alerts_category` | exp_capacity_reopen_alerts | category_key, status |

### Admin
| Index | Table | Columns |
|-------|-------|---------|
| `idx_admin_audit_log_created_at` | exp_admin_audit_log | created_at DESC |
| `idx_admin_audit_log_entity` | exp_admin_audit_log | entity_type, entity_id |
| `idx_stripe_webhook_events_status_created_at` | exp_stripe_webhook_events | status, created_at DESC |
| `idx_exp_admin_notifications_unread` | exp_admin_notifications | is_read, created_at DESC |
| `idx_exp_admin_notifications_source` | exp_admin_notifications | source_type, source_id, created_at DESC |

### Security & Infrastructure
| Index | Table | Columns |
|-------|-------|---------|
| `idx_exp_square_webhook_events_received` | exp_square_webhook_events | received_at |
| `idx_exp_rate_limit_windows_expires` | exp_rate_limit_windows | expires_at |
| `idx_exp_admin_sessions_token_hash` | exp_admin_sessions | token_hash |
| `idx_exp_admin_sessions_expires` | exp_admin_sessions | expires_at |
| `idx_exp_artwork_uploads_token` | exp_artwork_uploads | upload_token |
| `idx_exp_artwork_uploads_expires` | exp_artwork_uploads | expires_at |
| `idx_admin_mfa_codes_expires` | admin_mfa_codes | expires_at |
| `idx_admin_mfa_codes_challenge_token` | admin_mfa_codes | challenge_token |

### Dropped Indexes
| Index | Table | Dropped By |
|-------|-------|------------|
| `idx_admin_mfa_codes_ip` | admin_mfa_codes | 041 |
| `idx_newsletter_subscribers_customer_id` | exp_newsletter_subscribers | 042 |
| `idx_orders_customer_id` | exp_orders | 042 |

---

## 3. Triggers

### Updated-At Triggers (using `exp_set_updated_at()`)

All triggers are `BEFORE UPDATE ... FOR EACH ROW EXECUTE FUNCTION exp_set_updated_at()`.

| Trigger | Table | Source |
|---------|-------|--------|
| `trg_taxonomy_updated_at` | exp_taxonomy | 001 |
| `trg_homepage_sections_updated_at` | exp_homepage_sections | 001 |
| `trg_featured_collections_updated_at` | exp_featured_collections | 001 |
| `trg_gallery_updated_at` | exp_gallery | 001 |
| `trg_testimonials_updated_at` | exp_testimonials | 001 |
| `trg_announcement_updated_at` | exp_announcement | 001 |
| `trg_faq_updated_at` | exp_faq | 001 |
| `trg_products_updated_at` | exp_products | 002 |
| `trg_product_variants_updated_at` | exp_product_variants | 002 |
| `trg_product_bulk_discounts_updated_at` | exp_product_bulk_discounts | 004 |
| `trg_storefront_settings_updated_at` | exp_storefront_settings | 005 |
| `trg_exp_orders_updated_at` | exp_orders | 006 |
| `trg_exp_product_inventory_updated_at` | exp_product_inventory | 017 |
| `trg_exp_order_production_hooks_updated_at` | exp_order_production_hooks | 018 |
| `trg_exp_admin_notifications_updated_at` | exp_admin_notifications | 020 |
| `trg_exp_material_catalog_updated_at` | exp_material_catalog | 021 |
| `trg_exp_labor_time_entries_updated_at` | exp_labor_time_entries | 021 |
| `trg_exp_order_item_material_usage_updated_at` | exp_order_item_material_usage | 021 |
| `trg_exp_machine_schedule_blocks_updated_at` | exp_machine_schedule_blocks | 021 |
| `trg_exp_back_in_stock_alerts_updated_at` | exp_back_in_stock_alerts | 022 |
| `trg_exp_capacity_reopen_alerts_updated_at` | exp_capacity_reopen_alerts | 026 |
| `trg_exp_cart_captures_updated_at` | exp_cart_captures | 024 |
| `trg_exp_promo_codes_updated_at` | exp_promo_codes | 023 |
| `trg_exp_bundle_deals_updated_at` | exp_bundle_deals | 023 |
| `trg_exp_product_process_pricing_updated_at` | exp_product_process_pricing | 032 |
| `trg_exp_product_combo_discounts_updated_at` | exp_product_combo_discounts | 032 |

### Dropped Triggers
| Trigger | Table | Dropped By |
|---------|-------|------------|
| `trg_exp_promo_codes_updated_at` | exp_promo_codes | 023 (recreated) |
| `trg_exp_bundle_deals_updated_at` | exp_bundle_deals | 023 (recreated) |
| `trg_exp_back_in_stock_alerts_updated_at` | exp_back_in_stock_alerts | 022 (recreated) |
| `trg_exp_capacity_reopen_alerts_updated_at` | exp_capacity_reopen_alerts | 026 (recreated) |
| `trg_exp_cart_captures_updated_at` | exp_cart_captures | 024 (recreated) |

---

## 4. Storage Buckets

### `product-media` (PUBLIC)
| Property | Value |
|----------|-------|
| ID | `product-media` |
| Name | `product-media` |
| Public | `true` |
| File size limit | 10,485,760 (10 MB) |
| Allowed MIME types | image/jpeg, image/png, image/webp, image/gif, image/svg+xml |
| Source | Migration 029 |

**Storage Policy:** `Public read product media assets` — SELECT on `storage.objects` WHERE `bucket_id = 'product-media'`

### `customer-artwork` (PRIVATE)
| Property | Value |
|----------|-------|
| ID | `customer-artwork` |
| Name | `customer-artwork` |
| Public | `false` |
| File size limit | 15,728,640 (15 MB) |
| Allowed MIME types | image/jpeg, image/png, image/webp, image/gif, application/pdf |
| Source | Migration 031 |

**Storage Policy:** None (private — no public read policy). Only service-role key can access files via `createSignedUrl()`.

---

## 5. Column Additions (ALTER TABLE)

### Migration 007 — Guest Order Tracking
| Table | Column | Type |
|-------|--------|------|
| exp_orders | guest_tracking_token | text |
| exp_orders | guest_tracking_expires_at | timestamptz |
| exp_orders | stripe_payment_intent_id | text |

### Migration 009 — Custom Request Tracking + Linkage
| Table | Column | Type |
|-------|--------|------|
| exp_custom_requests | customer_access_token | text |
| exp_custom_requests | customer_access_expires_at | timestamptz |
| exp_orders | custom_request_id | uuid (FK → exp_custom_requests) |
| exp_orders | stripe_payment_link_id | text |

### Migration 010 — Customer Auth
| Table | Column | Type |
|-------|--------|------|
| exp_orders | customer_id | uuid (FK → exp_customers) |
| exp_orders | claimed_at | timestamptz |
| exp_customers | newsletter_consent_at | timestamptz |
| exp_customers | newsletter_consent_ip | text |
| exp_customers | marketing_consent_at | timestamptz |
| exp_customers | marketing_consent_ip | text |
| exp_custom_requests | customer_id | uuid (FK → exp_customers) |

### Migration 017 — Inventory Control
| Table | Column | Type |
|-------|--------|------|
| exp_orders | inventory_reserved_at | timestamptz |
| exp_orders | inventory_released_at | timestamptz |

### Migration 018 — Orders Operations
| Table | Column | Type |
|-------|--------|------|
| exp_orders | cancelled_at | timestamptz |
| exp_orders | refunded_at | timestamptz |
| exp_orders | shipping_carrier | text |
| exp_orders | tracking_number | text |

### Migration 019 — Custom Requests Phase 6
| Table | Column | Type |
|-------|--------|------|
| exp_custom_requests | quote_sent_at | timestamptz |
| exp_custom_requests | quote_expires_at | timestamptz |
| exp_custom_requests | quote_last_resent_at | timestamptz |
| exp_custom_requests | quote_resend_count | int4 (default 0) |
| exp_custom_requests | production_handoff_at | timestamptz |

### Migration 024 — Abandoned Cart Recovery
| Table | Column | Type |
|-------|--------|------|
| exp_orders | cart_recovery_email_sent_at | timestamptz |

### Migration 025 — Custom Request Recovery
| Table | Column | Type |
|-------|--------|------|
| exp_custom_requests | recovery_reminder_sent_at | timestamptz |

### Migration 028 — Order Item Option Snapshot
| Table | Column | Type |
|-------|--------|------|
| exp_order_items | option_snapshot | jsonb (default '{}') |

### Migration 033 — Square Checkout Fields
| Table | Column | Type |
|-------|--------|------|
| exp_products | square_variant_id | text |
| exp_products | is_square_enabled | bool (default false) |

### Migration 035 — Product Designer Fields
| Table | Column | Type |
|-------|--------|------|
| exp_products | has_designer | bool (default false) |
| exp_products | designer_mockup_url | text |
| exp_product_options | min_width | numeric |
| exp_product_options | max_width | numeric |
| exp_product_options | min_height | numeric |
| exp_product_options | max_height | numeric |
| exp_product_options | allowed_colors | text[] |

### Migration 037 — NFC Fields
| Table | Column | Type |
|-------|--------|------|
| exp_products | nfc_price_delta | numeric(12,4) (default 1) |
| exp_order_items | nfc_target_data | text |
| exp_order_items | leave_unlocked | bool (default false) |
| exp_order_items | source_file_url | text |

### Migration 041 — Admin MFA Challenge Token
| Table | Column | Type |
|-------|--------|------|
| admin_mfa_codes | challenge_token | text |
| admin_mfa_codes | device_fingerprint | text |
| admin_mfa_codes | ip | **made nullable** |

### Migration 042 — Remove Customer Accounts (DROP COLUMN)
| Table | Column | Action |
|-------|--------|--------|
| exp_orders | customer_id | DROPPED |
| exp_orders | claimed_at | DROPPED |
| exp_custom_requests | customer_id | DROPPED |
| exp_newsletter_subscribers | customer_id | DROPPED |
| exp_back_in_stock_alerts | customer_id | DROPPED |
| exp_capacity_reopen_alerts | customer_id | DROPPED |

---

## 6. Constraint Modifications

### Migration 030 — Taxonomy Type Check Expansion
- **Dropped:** `exp_taxonomy_type_check` (original: category, customizability_mode, material, product_type, tag)
- **Added:** `exp_taxonomy_type_check` (expanded: + `process_type`)

### Migration 034 — Split Process Types
- **Inserted:** `engraving` and `cutting` as separate process_type taxonomy entries
- **Updated:** `engraving_cutting` set to `visible = false`
- **Updated:** `printing` sort_order → 3, `sublimation` sort_order → 4

### Migration 039 — Replica Identity
| Table | Setting |
|-------|---------|
| exp_orders | REPLICA IDENTITY FULL |
| exp_order_items | REPLICA IDENTITY FULL |

---

## 7. Privilege Grants

### Service Role Grants (all customer-sensitive + security tables)

**Migration 013:**
```sql
GRANT ALL ON TABLE exp_customers TO service_role;
GRANT ALL ON TABLE exp_customer_sessions TO service_role;
GRANT ALL ON TABLE exp_password_reset_tokens TO service_role;
GRANT ALL ON TABLE exp_customer_addresses TO service_role;
GRANT ALL ON TABLE exp_wishlists TO service_role;
GRANT ALL ON TABLE exp_recently_viewed TO service_role;
```

**Migration 014:**
```sql
GRANT ALL ON TABLE exp_newsletter_subscribers TO service_role;
```

**Migration 015:**
```sql
GRANT ALL ON TABLE exp_budget_ranges TO service_role;
```

**Migration 016:**
```sql
GRANT ALL ON TABLE exp_admin_audit_log TO service_role;
GRANT ALL ON TABLE exp_stripe_webhook_events TO service_role;
```

**Migration 040:**
```sql
GRANT ALL ON TABLE admin_mfa_codes TO service_role;
```

**Migration 043/048:**
```sql
GRANT ALL ON TABLE exp_square_webhook_events TO service_role;
```

**Migration 044/048:**
```sql
GRANT ALL ON TABLE exp_rate_limit_windows TO service_role;
```

**Migration 045/048:**
```sql
GRANT ALL ON TABLE exp_admin_sessions TO service_role;
```

**Migration 046/048:**
```sql
GRANT ALL ON TABLE exp_artwork_uploads TO service_role;
```

### Revoked Privileges (anon, authenticated)

**Migration 013:**
```sql
REVOKE ALL ON TABLE exp_customers FROM anon, authenticated;
REVOKE ALL ON TABLE exp_customer_sessions FROM anon, authenticated;
REVOKE ALL ON TABLE exp_password_reset_tokens FROM anon, authenticated;
REVOKE ALL ON TABLE exp_customer_addresses FROM anon, authenticated;
REVOKE ALL ON TABLE exp_wishlists FROM anon, authenticated;
REVOKE ALL ON TABLE exp_recently_viewed FROM anon, authenticated;
```

**Migration 014:**
```sql
REVOKE ALL ON TABLE exp_newsletter_subscribers FROM anon, authenticated;
```

**Migration 015:**
```sql
REVOKE ALL ON TABLE exp_budget_ranges FROM anon, authenticated;
```

**Migration 016:**
```sql
REVOKE ALL ON TABLE exp_admin_audit_log FROM anon, authenticated;
REVOKE ALL ON TABLE exp_stripe_webhook_events FROM anon, authenticated;
```

**Migration 039:**
```sql
REVOKE INSERT ON exp_orders FROM anon;
REVOKE INSERT ON exp_order_items FROM anon;
```

**Migration 040/043/044/045/046/048:**
```sql
REVOKE ALL ON TABLE <table> FROM anon, authenticated;
```
(For: admin_mfa_codes, exp_square_webhook_events, exp_rate_limit_windows, exp_admin_sessions, exp_artwork_uploads)

### View Grants
```sql
GRANT SELECT ON exp_commission_queue TO authenticated;
```

---

## 8. Data Inserts (Seed Data)

### Migration 008 — Guest Order Tracking Setting
```sql
INSERT INTO exp_storefront_settings (setting_key, setting_value, description)
VALUES ('guest_order_tracking', '{"enabled": true, "notify_email": "orders@rubysrelics.com"}', ...);
```

### Migration 015 — Storefront Settings
```sql
INSERT INTO exp_storefront_settings (setting_key, ...) VALUES
  ('contact', ...),
  ('admin_session', ...),
  ('custom_order_intake', ...),
  ('operational_notifications', ...);
```

### Migration 015 — Budget Ranges
```sql
INSERT INTO exp_budget_ranges (label, value, min_amount, max_amount, sort_order) VALUES
  ('Under $50', 'under-50', NULL, 50, 10),
  ('$50 - $150', '50-150', 50, 150, 20),
  ('$150 - $300', '150-300', 150, 300, 30),
  ('$300+', '300-plus', 300, NULL, 40);
```

### Migration 030 — Process Type Taxonomy
```sql
INSERT INTO exp_taxonomy (key, display_name, slug, type, visible, sort_order, emoji, gradient, glow_color, tagline) VALUES
  ('engraving_cutting', 'Engraving & Cutting', 'engraving-cutting', 'process_type', true, 1, ...),
  ('printing', 'Printing', 'printing', 'process_type', true, 2, ...),
  ('sublimation', 'Sublimation', 'sublimation', 'process_type', true, 3, ...);
```

### Migration 030 — Homepage Sections
```sql
INSERT INTO exp_homepage_sections (section_key, is_visible, sort_order, content) VALUES
  ('quick_picks', true, 12, {...}),
  ('process_picks', true, 13, {...});
```

### Migration 034 — Split Process Types
```sql
INSERT INTO exp_taxonomy (key, display_name, ...) VALUES
  ('engraving', 'Engraving', ...),
  ('cutting', 'Cutting', ...);
UPDATE exp_taxonomy SET visible = false WHERE key = 'engraving_cutting' AND type = 'process_type';
UPDATE exp_taxonomy SET sort_order = 3 WHERE key = 'printing';
UPDATE exp_taxonomy SET sort_order = 4 WHERE key = 'sublimation';
```

### Migration 032 — Backfill Process Pricing
```sql
INSERT INTO exp_product_process_pricing (product_id, process_type_key, price_delta, is_enabled)
SELECT eppt.product_id, eppt.process_type_key, 0, true
FROM exp_product_process_types eppt
WHERE NOT EXISTS (...);
```

### Seed Files (run separately)
- **001_homepage_seed.sql:** Homepage sections, announcement, taxonomy (categories + materials), featured collections, gallery items, testimonials, FAQ items
- **002_product_seed.sql:** ~15 products across 6 categories with variants, options, option values, media
- **003_sticker_catalog_seed.sql:** Sticker category, 2 sticker products, variants, options, option values, media, bulk discount tiers
- **004_sticker_sheet_rules.sql:** Disables die-cut product, updates sticker sheet, adds size-type option, sets laminate prices
- **005_storefront_settings_seed.sql:** stripe_checkout_enabled, guest_order_tracking, operational_notifications, recommendations

---

## 9. Dropped Tables (by migration 042)

Migration 042 drops these tables with CASCADE:
1. `exp_wishlists`
2. `exp_customer_addresses`
3. `exp_password_reset_tokens`
4. `exp_customer_sessions`
5. `exp_recently_viewed`
6. `exp_customers`

---

## 10. Dropped Functions (by migration 048)

```sql
DROP FUNCTION IF EXISTS increment_rate_limit(TEXT, BIGINT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS increment_rate_limit(TEXT, TIMESTAMPTZ);
```

These were old overloads with different parameter orders. Migration 048 ensures only the correct alphabetical-order version (`increment_rate_limit(TIMESTAMPTZ, TEXT)`) remains.
