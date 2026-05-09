-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 008: Guest order tracking runtime setting
-- Purpose:
-- - Add configurable toggle for guest order tracking links
-- - Add configurable notification email for manual tracking fallback
-- ─────────────────────────────────────────────────────────────────────────────

insert into exp_storefront_settings (setting_key, setting_value, description)
values (
  'guest_order_tracking',
  '{
    "enabled": true,
    "notify_email": "orders@rubysrelics.com"
  }'::jsonb,
  'Controls guest order tracking links. If disabled, paid orders trigger a notification email for manual customer updates.'
)
on conflict (setting_key) do update
set
  setting_value = excluded.setting_value,
  description = excluded.description,
  updated_at = now();
