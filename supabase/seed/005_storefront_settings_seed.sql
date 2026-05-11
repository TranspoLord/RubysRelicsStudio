-- ─────────────────────────────────────────────────────────────────────────────
-- Seed 005: Storefront settings defaults
-- ─────────────────────────────────────────────────────────────────────────────

insert into exp_storefront_settings (setting_key, setting_value, description)
values
  (
    'stripe_checkout_enabled',
    '{
      "enabled": true,
      "disabled_message": "Checkout is temporarily unavailable. Please submit a custom request."
    }'::jsonb,
    'Controls whether Stripe checkout is available to customers.'
  ),
  (
    'guest_order_tracking',
    '{
      "enabled": true,
      "notify_email": "orders@rubysrelics.com"
    }'::jsonb,
    'Controls guest order tracking links. If disabled, paid orders trigger a notification email for manual customer updates.'
  ),
  (
    'operational_notifications',
    '{
      "custom_request_notify_email": "orders@rubysrelics.com"
    }'::jsonb,
    'Controls internal notification recipients for operational storefront events.'
  ),
  (
    'recommendations',
    '{
      "enabled": true,
      "pinned_global": [],
      "pinned_by_category": {}
    }'::jsonb,
    'Controls product recommendation ranking overrides and pinning.'
  )
on conflict (setting_key) do update
set
  setting_value = excluded.setting_value,
  description = excluded.description,
  updated_at = now();
