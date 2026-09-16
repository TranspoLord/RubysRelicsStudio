## Table `exp_taxonomy`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `key` | `text` | Primary |
| `display_name` | `text` |  |
| `slug` | `text` |  Unique |
| `parent_key` | `text` |  Nullable |
| `type` | `text` |  |
| `visible` | `bool` |  |
| `sort_order` | `int4` |  |
| `how_it_works_anchor` | `text` |  Nullable |
| `alias_keys` | `text` |  Nullable |
| `emoji` | `text` |  Nullable |
| `gradient` | `text` |  Nullable |
| `glow_color` | `text` |  Nullable |
| `tagline` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `exp_homepage_sections`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `section_key` | `text` |  Unique |
| `is_visible` | `bool` |  |
| `sort_order` | `int4` |  |
| `content` | `jsonb` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `exp_featured_collections`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `title` | `text` |  |
| `tagline` | `text` |  |
| `description` | `text` |  |
| `slug` | `text` |  Unique |
| `image_url` | `text` |  Nullable |
| `emoji` | `text` |  Nullable |
| `tag_label` | `text` |  Nullable |
| `gradient` | `text` |  |
| `border_color` | `text` |  |
| `is_visible` | `bool` |  |
| `sort_order` | `int4` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `exp_gallery`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `title` | `text` |  |
| `caption` | `text` |  Nullable |
| `category_key` | `text` |  Nullable |
| `media_url` | `text` |  |
| `media_alt` | `text` |  |
| `emoji` | `text` |  Nullable |
| `gradient` | `text` |  |
| `material_used` | `text` |  Nullable |
| `turnaround_band` | `text` |  Nullable |
| `display_permission` | `bool` |  |
| `moderation_status` | `text` |  |
| `publish_date` | `date` |  Nullable |
| `tags` | `_text` |  |
| `visible` | `bool` |  |
| `sort_order` | `int4` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `exp_testimonials`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `quote` | `text` |  |
| `author` | `text` |  |
| `location` | `text` |  Nullable |
| `product_label` | `text` |  Nullable |
| `stars` | `int4` |  |
| `emoji` | `text` |  Nullable |
| `is_visible` | `bool` |  |
| `sort_order` | `int4` |  |
| `source` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `exp_announcement`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `message` | `text` |  |
| `cta_label` | `text` |  Nullable |
| `cta_href` | `text` |  Nullable |
| `is_active` | `bool` |  |
| `dismiss_key` | `text` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `exp_faq`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `question` | `text` |  |
| `answer` | `text` |  |
| `link_label` | `text` |  Nullable |
| `link_href` | `text` |  Nullable |
| `is_visible` | `bool` |  |
| `sort_order` | `int4` |  |
| `section` | `text` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `exp_products`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `title` | `text` |  |
| `slug` | `text` |  Unique |
| `short_description` | `text` |  |
| `description` | `text` |  |
| `category_key` | `text` |  |
| `base_price` | `numeric` |  |
| `is_ready_made` | `bool` |  |
| `is_customizable` | `bool` |  |
| `is_active` | `bool` |  |
| `is_archived` | `bool` |  |
| `sort_order` | `int4` |  |
| `production_estimate_band` | `text` |  |
| `how_it_works_anchor` | `text` |  Nullable |
| `seo_title` | `text` |  Nullable |
| `seo_description` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |
| `has_designer` | `bool` |  |
| `designer_mockup_url` | `text` |  Nullable |
| `nfc_price_delta` | `numeric` |  |

## Table `exp_product_variants`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `product_id` | `uuid` |  |
| `label` | `text` |  |
| `sku` | `text` |  Nullable |
| `price_delta` | `numeric` |  |
| `capacity_weight` | `numeric` |  Nullable |
| `is_enabled` | `bool` |  |
| `sort_order` | `int4` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `exp_product_media`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `product_id` | `uuid` |  |
| `url` | `text` |  |
| `alt` | `text` |  |
| `emoji` | `text` |  Nullable |
| `gradient` | `text` |  Nullable |
| `is_featured` | `bool` |  |
| `sort_order` | `int4` |  |
| `created_at` | `timestamptz` |  |

## Table `exp_product_options`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `product_id` | `uuid` |  |
| `option_key` | `text` |  |
| `label` | `text` |  |
| `option_type` | `text` |  |
| `placeholder` | `text` |  Nullable |
| `help_text` | `text` |  Nullable |
| `is_required` | `bool` |  |
| `sort_order` | `int4` |  |
| `created_at` | `timestamptz` |  |
| `min_width` | `numeric` |  Nullable |
| `max_width` | `numeric` |  Nullable |
| `min_height` | `numeric` |  Nullable |
| `max_height` | `numeric` |  Nullable |
| `allowed_colors` | `_text` |  Nullable |

## Table `exp_product_option_values`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `option_id` | `uuid` |  |
| `label` | `text` |  |
| `value` | `text` |  |
| `price_delta` | `numeric` |  |
| `is_enabled` | `bool` |  |
| `sort_order` | `int4` |  |
| `created_at` | `timestamptz` |  |

## Table `exp_custom_requests`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `status` | `text` |  |
| `customer_name` | `text` |  |
| `customer_email` | `text` |  |
| `item_type` | `text` |  |
| `quantity` | `int4` |  |
| `deadline` | `date` |  Nullable |
| `budget_range` | `text` |  Nullable |
| `description` | `text` |  |
| `files` | `jsonb` |  |
| `design_help_needed` | `bool` |  |
| `ip_rights_confirmed` | `bool` |  |
| `age_confirmed` | `bool` |  |
| `tos_accepted` | `bool` |  |
| `branch` | `text` |  |
| `quote_amount` | `numeric` |  Nullable |
| `stripe_payment_link_id` | `text` |  Nullable |
| `stripe_payment_link_url` | `text` |  Nullable |
| `admin_notes` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |
| `customer_access_token` | `text` |  Nullable |
| `customer_access_expires_at` | `timestamptz` |  Nullable |
| `customer_id` | `uuid` |  Nullable |
| `quote_sent_at` | `timestamptz` |  Nullable |
| `quote_expires_at` | `timestamptz` |  Nullable |
| `quote_last_resent_at` | `timestamptz` |  Nullable |
| `quote_resend_count` | `int4` |  |
| `production_handoff_at` | `timestamptz` |  Nullable |
| `recovery_reminder_sent_at` | `timestamptz` |  Nullable |

## Table `exp_product_bulk_discounts`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `product_id` | `uuid` |  |
| `min_qty` | `int4` |  |
| `max_qty` | `int4` |  Nullable |
| `discount_type` | `text` |  |
| `discount_value` | `numeric` |  |
| `label` | `text` |  Nullable |
| `is_enabled` | `bool` |  |
| `sort_order` | `int4` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `exp_storefront_settings`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `setting_key` | `text` | Primary |
| `setting_value` | `jsonb` |  |
| `description` | `text` |  Nullable |
| `updated_at` | `timestamptz` |  |

## Table `exp_orders`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `order_path` | `text` |  |
| `payment_mode` | `text` |  |
| `payment_status` | `text` |  |
| `status` | `text` |  |
| `stripe_session_id` | `text` |  Nullable Unique |
| `production_estimate_band` | `text` |  |
| `subtotal` | `numeric` |  |
| `discount_amount` | `numeric` |  |
| `shipping_cost` | `numeric` |  |
| `order_total` | `numeric` |  |
| `shipping_method` | `text` |  |
| `shipping_address` | `jsonb` |  |
| `cart_snapshot` | `jsonb` |  |
| `branch` | `text` |  |
| `paid_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |
| `guest_tracking_token` | `text` |  Nullable |
| `guest_tracking_expires_at` | `timestamptz` |  Nullable |
| `stripe_payment_intent_id` | `text` |  Nullable |
| `custom_request_id` | `uuid` |  Nullable |
| `stripe_payment_link_id` | `text` |  Nullable |
| `customer_id` | `uuid` |  Nullable |
| `claimed_at` | `timestamptz` |  Nullable |
| `inventory_reserved_at` | `timestamptz` |  Nullable |
| `inventory_released_at` | `timestamptz` |  Nullable |
| `cancelled_at` | `timestamptz` |  Nullable |
| `refunded_at` | `timestamptz` |  Nullable |
| `shipping_carrier` | `text` |  Nullable |
| `tracking_number` | `text` |  Nullable |
| `cart_recovery_email_sent_at` | `timestamptz` |  Nullable |

## Table `exp_order_items`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `order_id` | `uuid` |  |
| `product_id` | `uuid` |  Nullable |
| `product_title` | `text` |  |
| `variant_label` | `text` |  Nullable |
| `selected_options` | `jsonb` |  |
| `unit_price` | `numeric` |  |
| `quantity` | `int4` |  |
| `line_subtotal` | `numeric` |  |
| `line_discount` | `numeric` |  |
| `line_total` | `numeric` |  |
| `created_at` | `timestamptz` |  |
| `nfc_target_data` | `text` |  Nullable |
| `leave_unlocked` | `bool` |  |
| `source_file_url` | `text` |  Nullable |

## Table `exp_customers`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `email` | `text` |  Unique |
| `email_verified` | `bool` |  Nullable |
| `email_verified_at` | `timestamptz` |  Nullable |
| `password_hash` | `text` |  Nullable |
| `first_name` | `text` |  Nullable |
| `last_name` | `text` |  Nullable |
| `phone` | `text` |  Nullable |
| `preferred_language` | `text` |  Nullable |
| `receives_newsletter` | `bool` |  Nullable |
| `receives_order_updates` | `bool` |  Nullable |
| `receives_marketing` | `bool` |  Nullable |
| `receives_back_in_stock` | `bool` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |
| `last_login_at` | `timestamptz` |  Nullable |
| `newsletter_consent_at` | `timestamptz` |  Nullable |
| `newsletter_consent_ip` | `text` |  Nullable |
| `marketing_consent_at` | `timestamptz` |  Nullable |
| `marketing_consent_ip` | `text` |  Nullable |

## Table `exp_customer_sessions`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `customer_id` | `uuid` |  |
| `session_token` | `text` |  Unique |
| `ip_address` | `text` |  Nullable |
| `user_agent` | `text` |  Nullable |
| `expires_at` | `timestamptz` |  |
| `created_at` | `timestamptz` |  Nullable |
| `last_activity_at` | `timestamptz` |  Nullable |

## Table `exp_password_reset_tokens`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `customer_id` | `uuid` |  |
| `token` | `text` |  Unique |
| `used` | `bool` |  Nullable |
| `used_at` | `timestamptz` |  Nullable |
| `expires_at` | `timestamptz` |  |
| `created_at` | `timestamptz` |  Nullable |

## Table `exp_customer_addresses`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `customer_id` | `uuid` |  |
| `label` | `text` |  Nullable |
| `full_name` | `text` |  |
| `street_1` | `text` |  |
| `street_2` | `text` |  Nullable |
| `city` | `text` |  |
| `state_province` | `text` |  |
| `postal_code` | `text` |  |
| `country` | `text` |  |
| `phone` | `text` |  Nullable |
| `is_default` | `bool` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |

## Table `exp_wishlists`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `customer_id` | `uuid` |  |
| `product_id` | `uuid` |  |
| `created_at` | `timestamptz` |  Nullable |

## Table `exp_recently_viewed`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `customer_id` | `uuid` |  |
| `product_id` | `uuid` |  |
| `viewed_at` | `timestamptz` |  Nullable |

## Table `exp_newsletter_subscribers`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `email` | `text` |  Unique |
| `customer_id` | `uuid` |  Nullable |
| `source` | `text` |  Nullable |
| `subscribed` | `bool` |  |
| `subscribed_at` | `timestamptz` |  |
| `unsubscribed_at` | `timestamptz` |  Nullable |
| `consent_ip` | `text` |  Nullable |
| `consent_user_agent` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `exp_budget_ranges`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `label` | `text` |  |
| `value` | `text` |  Unique |
| `min_amount` | `numeric` |  Nullable |
| `max_amount` | `numeric` |  Nullable |
| `is_active` | `bool` |  |
| `sort_order` | `int4` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `exp_admin_audit_log`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `action` | `text` |  |
| `entity_type` | `text` |  |
| `entity_id` | `text` |  Nullable |
| `route` | `text` |  |
| `request_ip` | `text` |  Nullable |
| `user_agent` | `text` |  Nullable |
| `status` | `text` |  |
| `details` | `jsonb` |  |
| `branch` | `text` |  |
| `created_at` | `timestamptz` |  |

## Table `exp_stripe_webhook_events`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `event_id` | `text` | Primary |
| `event_type` | `text` |  |
| `status` | `text` |  |
| `last_error` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |
| `processed_at` | `timestamptz` |  Nullable |

## Table `exp_product_inventory`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `product_id` | `uuid` |  Unique |
| `available_qty` | `int4` |  |
| `low_stock_threshold` | `int4` |  |
| `availability_override` | `text` |  |
| `is_track_inventory` | `bool` |  |
| `last_adjusted_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `exp_inventory_adjustments`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `inventory_id` | `uuid` |  Nullable |
| `product_id` | `uuid` |  Nullable |
| `order_id` | `uuid` |  Nullable |
| `change_qty` | `int4` |  |
| `quantity_before` | `int4` |  Nullable |
| `quantity_after` | `int4` |  Nullable |
| `reason_code` | `text` |  |
| `note` | `text` |  Nullable |
| `adjusted_by` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `exp_order_status_events`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `order_id` | `uuid` |  |
| `action_type` | `text` |  |
| `previous_status` | `text` |  Nullable |
| `next_status` | `text` |  Nullable |
| `previous_payment_status` | `text` |  Nullable |
| `next_payment_status` | `text` |  Nullable |
| `note` | `text` |  Nullable |
| `metadata` | `jsonb` |  |
| `created_by` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `exp_order_internal_notes`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `order_id` | `uuid` |  |
| `note` | `text` |  |
| `is_pinned` | `bool` |  |
| `created_by` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `exp_order_production_hooks`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `order_id` | `uuid` |  |
| `stage` | `text` |  |
| `scheduled_for` | `timestamptz` |  Nullable |
| `estimated_hours` | `numeric` |  Nullable |
| `assignee` | `text` |  Nullable |
| `note` | `text` |  Nullable |
| `is_completed` | `bool` |  |
| `completed_at` | `timestamptz` |  Nullable |
| `created_by` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `exp_admin_notifications`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `source_type` | `text` |  |
| `source_id` | `text` |  |
| `event_type` | `text` |  |
| `title` | `text` |  |
| `body` | `text` |  Nullable |
| `href` | `text` |  Nullable |
| `is_read` | `bool` |  |
| `read_at` | `timestamptz` |  Nullable |
| `metadata` | `jsonb` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `exp_material_catalog`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `key` | `text` |  Unique |
| `name` | `text` |  |
| `unit_name` | `text` |  |
| `is_active` | `bool` |  |
| `notes` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `exp_material_cost_history`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `material_id` | `uuid` |  |
| `cost_per_unit` | `numeric` |  |
| `effective_from` | `timestamptz` |  |
| `supplier_label` | `text` |  Nullable |
| `notes` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `exp_labor_time_entries`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `order_id` | `uuid` |  Nullable |
| `order_item_id` | `uuid` |  Nullable |
| `stage` | `text` |  |
| `minutes` | `int4` |  |
| `hourly_rate` | `numeric` |  |
| `note` | `text` |  Nullable |
| `logged_by` | `text` |  Nullable |
| `logged_at` | `timestamptz` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `exp_order_item_material_usage`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `order_item_id` | `uuid` |  |
| `material_id` | `uuid` |  Nullable |
| `quantity_used` | `numeric` |  |
| `unit_cost_snapshot` | `numeric` |  |
| `total_cost_snapshot` | `numeric` |  Nullable |
| `note` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `exp_machine_schedule_blocks`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `order_id` | `uuid` |  Nullable |
| `order_item_id` | `uuid` |  Nullable |
| `custom_request_id` | `uuid` |  Nullable |
| `stage` | `text` |  |
| `start_at` | `timestamptz` |  |
| `end_at` | `timestamptz` |  |
| `estimated_hours` | `numeric` |  |
| `is_locked` | `bool` |  |
| `note` | `text` |  Nullable |
| `created_by` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `exp_back_in_stock_alerts`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `product_id` | `uuid` |  |
| `email` | `text` |  |
| `customer_id` | `uuid` |  Nullable |
| `status` | `text` |  |
| `source` | `text` |  |
| `consent_ip` | `text` |  Nullable |
| `consent_user_agent` | `text` |  Nullable |
| `subscribed_at` | `timestamptz` |  |
| `notified_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `exp_promo_codes`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `code` | `text` |  |
| `description` | `text` |  |
| `discount_type` | `text` |  |
| `discount_value` | `numeric` |  |
| `is_active` | `bool` |  |
| `usage_limit` | `int4` |  Nullable |
| `usage_count` | `int4` |  |
| `valid_from` | `timestamptz` |  Nullable |
| `valid_to` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `exp_bundle_deals`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `name` | `text` |  |
| `description` | `text` |  |
| `trigger_type` | `text` |  |
| `code` | `text` |  Nullable |
| `conditions_json` | `jsonb` |  |
| `rewards_json` | `jsonb` |  |
| `is_active` | `bool` |  |
| `is_stackable` | `bool` |  |
| `usage_limit` | `int4` |  Nullable |
| `usage_count` | `int4` |  |
| `valid_from` | `timestamptz` |  Nullable |
| `valid_to` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `exp_cart_captures`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `email` | `text` |  |
| `cart_json` | `jsonb` |  |
| `recovery_sent_at` | `timestamptz` |  Nullable |
| `order_id` | `uuid` |  Nullable |
| `ip_hash` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `exp_capacity_reopen_alerts`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `category_key` | `text` |  |
| `email` | `text` |  |
| `customer_id` | `uuid` |  Nullable |
| `status` | `text` |  |
| `source` | `text` |  |
| `subscribed_at` | `timestamptz` |  |
| `notified_at` | `timestamptz` |  Nullable |
| `unsubscribed_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `exp_product_process_types`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `product_id` | `uuid` | Primary |
| `process_type_key` | `text` | Primary |

## Table `exp_product_process_pricing`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `product_id` | `uuid` |  |
| `process_type_key` | `text` |  |
| `price_delta` | `numeric` |  |
| `is_enabled` | `bool` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `exp_product_combo_discounts`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `product_id` | `uuid` |  |
| `min_processes` | `int4` |  |
| `discount_type` | `text` |  |
| `discount_value` | `numeric` |  Nullable |
| `label` | `text` |  Nullable |
| `is_enabled` | `bool` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## RLS Policies

### `exp_taxonomy`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `public read taxonomy` | SELECT | anon, authenticated | PERMISSIVE | `(visible = true)` | — |

### `exp_homepage_sections`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `public read homepage sections` | SELECT | anon, authenticated | PERMISSIVE | `true` | — |

### `exp_featured_collections`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `public read featured collections` | SELECT | anon, authenticated | PERMISSIVE | `(is_visible = true)` | — |

### `exp_gallery`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `public read published gallery` | SELECT | anon, authenticated | PERMISSIVE | `((moderation_status = 'published'::text) AND (visible = true))` | — |

### `exp_testimonials`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `public read visible testimonials` | SELECT | anon, authenticated | PERMISSIVE | `(is_visible = true)` | — |

### `exp_announcement`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `public read active announcement` | SELECT | anon, authenticated | PERMISSIVE | `(is_active = true)` | — |

### `exp_faq`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `public read visible faq` | SELECT | anon, authenticated | PERMISSIVE | `(is_visible = true)` | — |

### `exp_products`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `public_read_active_products` | SELECT | public | PERMISSIVE | `((is_active = true) AND (is_archived = false))` | — |

### `exp_product_variants`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `public_read_product_variants` | SELECT | public | PERMISSIVE | `(EXISTS ( SELECT 1    FROM exp_products p   WHERE ((p.id = exp_product_variants.product_id) AND (p.is_active = true) AND (p.is_archived = false))))` | — |

### `exp_product_media`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `public_read_product_media` | SELECT | public | PERMISSIVE | `(EXISTS ( SELECT 1    FROM exp_products p   WHERE ((p.id = exp_product_media.product_id) AND (p.is_active = true) AND (p.is_archived = false))))` | — |

### `exp_product_options`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `public_read_product_options` | SELECT | public | PERMISSIVE | `(EXISTS ( SELECT 1    FROM exp_products p   WHERE ((p.id = exp_product_options.product_id) AND (p.is_active = true) AND (p.is_archived = false))))` | — |

### `exp_product_option_values`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `public_read_product_option_values` | SELECT | public | PERMISSIVE | `(EXISTS ( SELECT 1    FROM (exp_product_options o      JOIN exp_products p ON ((p.id = o.product_id)))   WHERE ((o.id = exp_product_option_values.option_id) AND (p.is_active = true) AND (p.is_archived = false))))` | — |

### `exp_product_bulk_discounts`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `public_read_product_bulk_discounts` | SELECT | public | PERMISSIVE | `((is_enabled = true) AND (EXISTS ( SELECT 1    FROM exp_products p   WHERE ((p.id = exp_product_bulk_discounts.product_id) AND (p.is_active = true) AND (p.is_archived = false)))))` | — |

### `exp_storefront_settings`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `public_read_storefront_settings` | SELECT | public | PERMISSIVE | `true` | — |

### `exp_promo_codes`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `exp_promo_codes_public_read` | SELECT | public | PERMISSIVE | `(is_active = true)` | — |

### `exp_bundle_deals`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `exp_bundle_deals_public_read` | SELECT | public | PERMISSIVE | `(is_active = true)` | — |

### `exp_product_process_types`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `public read product process types` | SELECT | anon, authenticated | PERMISSIVE | `true` | — |

### `exp_product_process_pricing`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `public read enabled product process pricing` | SELECT | anon, authenticated | PERMISSIVE | `(is_enabled = true)` | — |

### `exp_product_combo_discounts`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `public read enabled product combo discounts` | SELECT | anon, authenticated | PERMISSIVE | `(is_enabled = true)` | — |

### `exp_orders`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `users_select_own_orders` | SELECT | authenticated | PERMISSIVE | `((customer_id = auth.uid()) OR (( SELECT 1    FROM exp_customer_sessions cs   WHERE ((cs.customer_id = exp_orders.customer_id) AND (cs.session_token = current_setting('request.jwt.claim.session_token'::text, true)))) IS NOT NULL))` | — |
| `users_update_own_orders` | UPDATE | authenticated | PERMISSIVE | `(customer_id = auth.uid())` | `(customer_id = auth.uid())` |

### `exp_order_items`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `users_select_own_order_items` | SELECT | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM exp_orders o   WHERE ((o.id = exp_order_items.order_id) AND (o.customer_id = auth.uid()))))` | — |
| `users_update_own_order_items` | UPDATE | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM exp_orders o   WHERE ((o.id = exp_order_items.order_id) AND (o.status = 'awaiting_payment'::text) AND (o.customer_id = auth.uid()))))` | — |

