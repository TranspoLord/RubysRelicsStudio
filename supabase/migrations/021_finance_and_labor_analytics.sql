-- -----------------------------------------------------------------------------
-- Migration 021: Finance and labor analytics foundation
-- Purpose:
-- 1) Track labor time entries for per-order/per-item profitability
-- 2) Track material catalog/cost history and item-level usage snapshots
-- 3) Reserve machine schedule blocks for realistic capacity planning
-- -----------------------------------------------------------------------------

create table if not exists exp_material_catalog (
  id                 uuid primary key default gen_random_uuid(),
  key                text not null unique,
  name               text not null,
  unit_name          text not null default 'unit',
  is_active          boolean not null default true,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger trg_exp_material_catalog_updated_at
before update on exp_material_catalog
for each row execute function exp_set_updated_at();

create table if not exists exp_material_cost_history (
  id                 uuid primary key default gen_random_uuid(),
  material_id        uuid not null references exp_material_catalog(id) on delete cascade,
  cost_per_unit      numeric(12,4) not null check (cost_per_unit >= 0),
  effective_from     timestamptz not null default now(),
  supplier_label     text,
  notes              text,
  created_at         timestamptz not null default now()
);

create index if not exists idx_exp_material_cost_history_material
  on exp_material_cost_history(material_id, effective_from desc);

create table if not exists exp_labor_time_entries (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid references exp_orders(id) on delete set null,
  order_item_id      uuid references exp_order_items(id) on delete set null,
  stage              text not null check (stage in ('design', 'setup', 'production', 'finishing', 'packing')),
  minutes            integer not null check (minutes > 0),
  hourly_rate        numeric(10,2) not null default 0 check (hourly_rate >= 0),
  note               text,
  logged_by          text,
  logged_at          timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_exp_labor_time_entries_order
  on exp_labor_time_entries(order_id, logged_at desc);

create index if not exists idx_exp_labor_time_entries_item
  on exp_labor_time_entries(order_item_id, logged_at desc);

create index if not exists idx_exp_labor_time_entries_stage
  on exp_labor_time_entries(stage, logged_at desc);

create trigger trg_exp_labor_time_entries_updated_at
before update on exp_labor_time_entries
for each row execute function exp_set_updated_at();

create table if not exists exp_order_item_material_usage (
  id                      uuid primary key default gen_random_uuid(),
  order_item_id           uuid not null references exp_order_items(id) on delete cascade,
  material_id             uuid references exp_material_catalog(id) on delete set null,
  quantity_used           numeric(12,4) not null check (quantity_used >= 0),
  unit_cost_snapshot      numeric(12,4) not null check (unit_cost_snapshot >= 0),
  total_cost_snapshot     numeric(12,4) generated always as (quantity_used * unit_cost_snapshot) stored,
  note                    text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_exp_order_item_material_usage_item
  on exp_order_item_material_usage(order_item_id, created_at desc);

create trigger trg_exp_order_item_material_usage_updated_at
before update on exp_order_item_material_usage
for each row execute function exp_set_updated_at();

create table if not exists exp_machine_schedule_blocks (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid references exp_orders(id) on delete set null,
  order_item_id      uuid references exp_order_items(id) on delete set null,
  custom_request_id  uuid references exp_custom_requests(id) on delete set null,
  stage              text not null check (stage in ('design', 'setup', 'production', 'finishing', 'packing')),
  start_at           timestamptz not null,
  end_at             timestamptz not null,
  estimated_hours    numeric(8,2) not null check (estimated_hours >= 0),
  is_locked          boolean not null default false,
  note               text,
  created_by         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (end_at > start_at)
);

create index if not exists idx_exp_machine_schedule_blocks_window
  on exp_machine_schedule_blocks(start_at asc, end_at asc);

create index if not exists idx_exp_machine_schedule_blocks_order
  on exp_machine_schedule_blocks(order_id, stage, start_at desc);

create trigger trg_exp_machine_schedule_blocks_updated_at
before update on exp_machine_schedule_blocks
for each row execute function exp_set_updated_at();

alter table exp_material_catalog enable row level security;
alter table exp_material_cost_history enable row level security;
alter table exp_labor_time_entries enable row level security;
alter table exp_order_item_material_usage enable row level security;
alter table exp_machine_schedule_blocks enable row level security;