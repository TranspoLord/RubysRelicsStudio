-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 032: Product process pricing & combo discounts
--
-- Replaces the simple exp_product_process_types join table with a richer
-- exp_product_process_pricing table that includes per-process price_delta,
-- and adds exp_product_combo_discounts for multi-process pricing breaks.
--
-- The old exp_product_process_types table is kept for backward compatibility
-- during the transition, but new code should use exp_product_process_pricing.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. New process pricing table (replaces the join table conceptually) ────────
create table if not exists exp_product_process_pricing (
  id                uuid          primary key default gen_random_uuid(),
  product_id        uuid          not null references exp_products(id) on delete cascade,
  process_type_key  text          not null references exp_taxonomy(key),
  price_delta       numeric(10,2) not null default 0,
  is_enabled        boolean       not null default true,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now(),
  unique(product_id, process_type_key)
);

create index if not exists idx_exp_product_process_pricing_product
  on exp_product_process_pricing(product_id);

create index if not exists idx_exp_product_process_pricing_key
  on exp_product_process_pricing(process_type_key);

-- RLS: public can read enabled pricing, service-role can write
alter table exp_product_process_pricing enable row level security;

create policy "public read enabled product process pricing"
  on exp_product_process_pricing for select
  to anon, authenticated
  using (is_enabled = true);

-- ── 2. Combo discount tiers ────────────────────────────────────────────────────
create table if not exists exp_product_combo_discounts (
  id                uuid          primary key default gen_random_uuid(),
  product_id        uuid          not null references exp_products(id) on delete cascade,
  min_processes     integer       not null default 2,
  discount_type     text          not null check (discount_type in ('percent', 'fixed_amount', 'cheapest_free')),
  discount_value    numeric(10,2),           -- null for cheapest_free
  label             text,                     -- for display in admin & shop
  is_enabled        boolean       not null default true,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now()
);

create index if not exists idx_exp_product_combo_discounts_product
  on exp_product_combo_discounts(product_id);

-- RLS: public can read enabled combo discounts
alter table exp_product_combo_discounts enable row level security;

create policy "public read enabled product combo discounts"
  on exp_product_combo_discounts for select
  to anon, authenticated
  using (is_enabled = true);

-- ── 3. Backfill: migrate existing exp_product_process_types entries ────────────
-- Any product already tagged with a process type gets a $0 price_delta entry
-- in the new table so existing data continues to work.
insert into exp_product_process_pricing (product_id, process_type_key, price_delta, is_enabled)
select
  eppt.product_id,
  eppt.process_type_key,
  0 as price_delta,
  true as is_enabled
from exp_product_process_types eppt
where not exists (
  select 1
  from exp_product_process_pricing eppp
  where eppp.product_id = eppt.product_id
    and eppp.process_type_key = eppt.process_type_key
)
on conflict (product_id, process_type_key) do nothing;