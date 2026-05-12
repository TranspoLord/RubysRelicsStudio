-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 023: Store Promotions and Bundle Deals
-- Tables: exp_promo_codes, exp_bundle_deals
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists exp_promo_codes (
  id              uuid primary key default gen_random_uuid(),
  code            text not null,
  description     text not null default '',
  discount_type   text not null check (discount_type in ('percent', 'fixed_amount', 'free_shipping')),
  discount_value  numeric(12,2) not null default 0,
  is_active       boolean not null default true,
  usage_limit     integer,
  usage_count     integer not null default 0,
  valid_from      timestamptz,
  valid_to        timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists idx_exp_promo_codes_code_unique
  on exp_promo_codes ((lower(code)));
create index if not exists idx_exp_promo_codes_is_active on exp_promo_codes(is_active);
create index if not exists idx_exp_promo_codes_valid_window on exp_promo_codes(valid_from, valid_to);

create table if not exists exp_bundle_deals (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  description      text not null default '',
  trigger_type     text not null check (trigger_type in ('automatic', 'code')),
  code             text,
  conditions_json  jsonb not null default '{}'::jsonb,
  rewards_json     jsonb not null default '{}'::jsonb,
  is_active        boolean not null default true,
  is_stackable     boolean not null default true,
  usage_limit      integer,
  usage_count      integer not null default 0,
  valid_from       timestamptz,
  valid_to         timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint exp_bundle_deals_code_required_for_code_trigger
    check ((trigger_type = 'code' and code is not null and length(trim(code)) > 0) or trigger_type = 'automatic')
);

create unique index if not exists idx_exp_bundle_deals_code_unique
  on exp_bundle_deals ((lower(code)))
  where code is not null;
create index if not exists idx_exp_bundle_deals_is_active on exp_bundle_deals(is_active);
create index if not exists idx_exp_bundle_deals_trigger_type on exp_bundle_deals(trigger_type);
create index if not exists idx_exp_bundle_deals_valid_window on exp_bundle_deals(valid_from, valid_to);

alter table exp_promo_codes enable row level security;
alter table exp_bundle_deals enable row level security;

drop policy if exists exp_promo_codes_public_read on exp_promo_codes;
create policy exp_promo_codes_public_read
  on exp_promo_codes
  for select
  using (is_active = true);

drop policy if exists exp_bundle_deals_public_read on exp_bundle_deals;
create policy exp_bundle_deals_public_read
  on exp_bundle_deals
  for select
  using (is_active = true);

drop trigger if exists trg_exp_promo_codes_updated_at on exp_promo_codes;
create trigger trg_exp_promo_codes_updated_at
before update on exp_promo_codes
for each row execute function exp_set_updated_at();

drop trigger if exists trg_exp_bundle_deals_updated_at on exp_bundle_deals;
create trigger trg_exp_bundle_deals_updated_at
before update on exp_bundle_deals
for each row execute function exp_set_updated_at();
