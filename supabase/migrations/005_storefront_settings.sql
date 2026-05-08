-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 005: Storefront runtime settings
-- Purpose: admin-manageable operational toggles (e.g., Stripe checkout on/off).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists exp_storefront_settings (
  setting_key   text primary key,
  setting_value jsonb not null default '{}'::jsonb,
  description   text,
  updated_at    timestamptz not null default now()
);

create index if not exists idx_exp_storefront_settings_updated_at
  on exp_storefront_settings(updated_at desc);

alter table exp_storefront_settings enable row level security;

-- Public read access is limited to non-sensitive runtime toggles.
create policy "public_read_storefront_settings"
  on exp_storefront_settings for select
  using (true);

create trigger trg_storefront_settings_updated_at
before update on exp_storefront_settings
for each row execute function exp_set_updated_at();
