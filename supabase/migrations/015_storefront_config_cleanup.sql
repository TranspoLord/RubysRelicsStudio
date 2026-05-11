-- Migration 015: Storefront config cleanup
-- Centralize support/contact/session settings and custom order budget ranges.

INSERT INTO exp_storefront_settings (setting_key, setting_value, description)
VALUES
  (
    'contact',
    '{
      "support_email": "orders@rubysrelics.com",
      "from_email": "hello@rubysrelics.com",
      "from_name": "Ruby''s Relics"
    }'::jsonb,
    'Operational contact and sender identity settings.'
  ),
  (
    'admin_session',
    '{
      "ttl_hours": 12
    }'::jsonb,
    'Admin session security policy settings.'
  ),
  (
    'custom_order_intake',
    '{
      "max_quantity": 500,
      "max_files": 5
    }'::jsonb,
    'Custom order intake guardrails and upload limits.'
  ),
  (
    'operational_notifications',
    '{
      "custom_request_notify_email": "orders@rubysrelics.com"
    }'::jsonb,
    'Operational notification recipients for internal storefront events.'
  )
ON CONFLICT (setting_key) DO UPDATE
SET
  setting_value = EXCLUDED.setting_value,
  description = EXCLUDED.description,
  updated_at = now();

CREATE TABLE IF NOT EXISTS exp_budget_ranges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  value TEXT NOT NULL UNIQUE,
  min_amount NUMERIC(10, 2),
  max_amount NUMERIC(10, 2),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_budget_ranges_active_sort ON exp_budget_ranges(is_active, sort_order);

ALTER TABLE exp_budget_ranges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE exp_budget_ranges FROM anon, authenticated;
GRANT ALL ON TABLE exp_budget_ranges TO service_role;

INSERT INTO exp_budget_ranges (label, value, min_amount, max_amount, sort_order)
VALUES
  ('Under $50', 'under-50', NULL, 50, 10),
  ('$50 - $150', '50-150', 50, 150, 20),
  ('$150 - $300', '150-300', 150, 300, 30),
  ('$300+', '300-plus', 300, NULL, 40)
ON CONFLICT (value) DO UPDATE
SET
  label = EXCLUDED.label,
  min_amount = EXCLUDED.min_amount,
  max_amount = EXCLUDED.max_amount,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();