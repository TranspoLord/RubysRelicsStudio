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
  )
on conflict (setting_key) do update
set
  setting_value = excluded.setting_value,
  description = excluded.description,
  updated_at = now();
