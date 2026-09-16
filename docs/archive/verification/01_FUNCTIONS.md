# Functions & RPCs — Final State After All Migrations (001–048)

> This document lists all PL/pgSQL functions and stored procedures that need to exist after applying ALL migrations 001–048.

---

## 1. `exp_set_updated_at()`

**Type:** Trigger function (BEFORE UPDATE)
**Language:** plpgsql
**Source:** Migration 001

**Purpose:** Automatically sets `new.updated_at = now()` on every UPDATE operation. Applied as a trigger on all tables that have an `updated_at` column.

**Tables with this trigger:**
- `exp_taxonomy` → `trg_taxonomy_updated_at`
- `exp_homepage_sections` → `trg_homepage_sections_updated_at`
- `exp_featured_collections` → `trg_featured_collections_updated_at`
- `exp_gallery` → `trg_gallery_updated_at`
- `exp_testimonials` → `trg_testimonials_updated_at`
- `exp_announcement` → `trg_announcement_updated_at`
- `exp_faq` → `trg_faq_updated_at`
- `exp_products` → `trg_products_updated_at`
- `exp_product_variants` → `trg_product_variants_updated_at`
- `exp_product_bulk_discounts` → `trg_product_bulk_discounts_updated_at`
- `exp_product_process_pricing` → `trg_exp_product_process_pricing_updated_at`
- `exp_product_combo_discounts` → `trg_exp_product_combo_discounts_updated_at`
- `exp_storefront_settings` → `trg_storefront_settings_updated_at`
- `exp_orders` → `trg_exp_orders_updated_at`
- `exp_order_production_hooks` → `trg_exp_order_production_hooks_updated_at`
- `exp_admin_notifications` → `trg_exp_admin_notifications_updated_at`
- `exp_material_catalog` → `trg_exp_material_catalog_updated_at`
- `exp_labor_time_entries` → `trg_exp_labor_time_entries_updated_at`
- `exp_order_item_material_usage` → `trg_exp_order_item_material_usage_updated_at`
- `exp_machine_schedule_blocks` → `trg_exp_machine_schedule_blocks_updated_at`
- `exp_back_in_stock_alerts` → `trg_exp_back_in_stock_alerts_updated_at`
- `exp_capacity_reopen_alerts` → `trg_exp_capacity_reopen_alerts_updated_at`
- `exp_cart_captures` → `trg_exp_cart_captures_updated_at`
- `exp_promo_codes` → `trg_exp_promo_codes_updated_at`
- `exp_bundle_deals` → `trg_exp_bundle_deals_updated_at`

**Note:** `exp_product_options` and `exp_product_option_values` also have triggers (`trg_product_options_updated_at`, `trg_product_option_values_updated_at`) but these are NOT created by the migrations — they are listed in the Current_Schema.md but not in any migration file. This is a **discrepancy**: the Current_Schema.md shows these triggers exist, but no migration creates them.

---

## 2. `exp_reserve_order_inventory(p_order_id uuid)`

**Type:** Stored procedure (SECURITY DEFINER)
**Returns:** `jsonb`
**Language:** plpgsql
**Source:** Migration 017

**Purpose:** Atomically reserves inventory for ready-made products in an order. Called during checkout to prevent overselling.

**Parameters:**
- `p_order_id` (uuid) — The order to reserve inventory for

**Behavior:**
1. Checks if order exists and hasn't already been reserved
2. **Preflight check:** For each ready-made product in the order, verifies sufficient stock (respecting `availability_override` and `is_track_inventory` flags)
3. **Apply reservation:** Deducts quantities from `exp_product_inventory`, creates `exp_inventory_adjustments` records
4. Sets `inventory_reserved_at` on the order

**Return values:**
- `{"ok": true, "reason": "reserved"}` — Success
- `{"ok": true, "reason": "already_reserved"}` — Already reserved
- `{"ok": false, "reason": "order_not_found"}` — Order doesn't exist
- `{"ok": false, "reason": "forced_out_of_stock", "product_id": ...}` — Product forced out of stock
- `{"ok": false, "reason": "insufficient_stock", "product_id": ..., "available_qty": ..., "required_qty": ...}` — Not enough stock

**Dependencies:** `exp_orders`, `exp_order_items`, `exp_products`, `exp_product_inventory`, `exp_inventory_adjustments`

---

## 3. `exp_release_order_inventory(p_order_id uuid, p_note text)`

**Type:** Stored procedure (SECURITY DEFINER)
**Returns:** `jsonb`
**Language:** plpgsql
**Source:** Migration 017

**Purpose:** Releases previously reserved inventory when an order fails, expires, or is cancelled (but NOT when paid).

**Parameters:**
- `p_order_id` (uuid) — The order to release inventory for
- `p_note` (text, default NULL) — Optional note for the adjustment record

**Behavior:**
1. Checks if order exists and has reserved inventory
2. Verifies inventory hasn't already been released
3. Verifies order is NOT paid (paid orders keep their inventory)
4. For each ready-made product, adds quantities back to `exp_product_inventory`, creates `exp_inventory_adjustments` records
5. Sets `inventory_released_at` on the order

**Return values:**
- `{"ok": true, "reason": "released"}` — Success
- `{"ok": true, "reason": "not_reserved"}` — No reservation found
- `{"ok": true, "reason": "already_released"}` — Already released
- `{"ok": true, "reason": "paid_not_released"}` — Order is paid, inventory not released
- `{"ok": false, "reason": "order_not_found"}` — Order doesn't exist

**Dependencies:** `exp_orders`, `exp_order_items`, `exp_products`, `exp_product_inventory`, `exp_inventory_adjustments`

---

## 4. `increment_rate_limit(p_expires_at timestamptz, p_key text)`

**Type:** Function (SECURITY DEFINER)
**Returns:** `int`
**Language:** plpgsql
**Source:** Migration 044 (recreated by 048)

**Purpose:** Atomic rate-limit counter increment. Survives cold starts (unlike in-memory Map).

**Parameters (alphabetical order — critical for PostgREST):**
- `p_expires_at` (timestamptz) — When this window expires
- `p_key` (text) — Rate limit key (e.g., IP address + endpoint)

**Behavior:**
- INSERTs a new row if key doesn't exist or window has expired
- ON CONFLICT: increments count if window is still active, resets to 1 if expired
- Returns the new count

**Return value:** The new count for the window

**Dependencies:** `exp_rate_limit_windows`

**Important:** Parameters are in ALPHABETICAL ORDER by name (`p_expires_at` before `p_key`) to match PostgREST's schema cache lookup.

---

## 5. `cleanup_expired_mfa_codes()`

**Type:** Function (SECURITY DEFINER)
**Returns:** `void`
**Language:** plpgsql
**Source:** Migration 040

**Purpose:** Deletes expired MFA codes from `admin_mfa_codes`. Called opportunistically by the application layer.

**Behavior:** `DELETE FROM admin_mfa_codes WHERE expires_at < now()`

**Dependencies:** `admin_mfa_codes`

---

## 6. `cleanup_expired_rate_limits()`

**Type:** Function (SECURITY DEFINER)
**Returns:** `void`
**Language:** plpgsql
**Source:** Migration 044 (recreated by 048)

**Purpose:** Deletes expired rate-limit windows from `exp_rate_limit_windows`. Called opportunistically by the application layer.

**Behavior:** `DELETE FROM exp_rate_limit_windows WHERE expires_at < now()`

**Dependencies:** `exp_rate_limit_windows`

---

## Summary

| # | Function Name | Type | Returns | Source Migration |
|---|--------------|------|---------|-----------------|
| 1 | `exp_set_updated_at()` | Trigger | trigger | 001 |
| 2 | `exp_reserve_order_inventory(p_order_id)` | SECURITY DEFINER | jsonb | 017 |
| 3 | `exp_release_order_inventory(p_order_id, p_note)` | SECURITY DEFINER | jsonb | 017 |
| 4 | `increment_rate_limit(p_expires_at, p_key)` | SECURITY DEFINER | int | 044/048 |
| 5 | `cleanup_expired_mfa_codes()` | SECURITY DEFINER | void | 040 |
| 6 | `cleanup_expired_rate_limits()` | SECURITY DEFINER | void | 044/048 |

**Total: 6 functions**

**Note:** Migration 048 drops any old 3-parameter overload of `increment_rate_limit` (`increment_rate_limit(TEXT, BIGINT, TIMESTAMPTZ)`) and the 2-parameter version with different parameter order (`increment_rate_limit(TEXT, TIMESTAMPTZ)`), ensuring only the correct alphabetical-order version remains.
