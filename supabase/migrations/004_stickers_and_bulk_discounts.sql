-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 004: Sticker catalog support + bulk discount tiers
-- Purpose:
-- 1) Add admin-configurable quantity discount tiers per product
-- 2) Prepare storefront for sticker-specific option sets and pricing rules
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists exp_product_bulk_discounts (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references exp_products(id) on delete cascade,
  min_qty        integer not null check (min_qty > 0),
  max_qty        integer check (max_qty is null or max_qty >= min_qty),
  discount_type  text not null check (discount_type in ('percent','fixed_amount','unit_price')),
  discount_value numeric(10,2) not null check (discount_value >= 0),
  label          text,
  is_enabled     boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_exp_product_bulk_discounts_product
  on exp_product_bulk_discounts(product_id);

create index if not exists idx_exp_product_bulk_discounts_enabled
  on exp_product_bulk_discounts(is_enabled, sort_order);

alter table exp_product_bulk_discounts enable row level security;

create policy "public_read_product_bulk_discounts"
  on exp_product_bulk_discounts for select
  using (
    is_enabled = true
    and exists (
      select 1 from exp_products p
      where p.id = product_id
        and p.is_active = true
        and p.is_archived = false
    )
  );

-- updated_at trigger reuse
create trigger trg_product_bulk_discounts_updated_at
before update on exp_product_bulk_discounts
for each row execute function exp_set_updated_at();
