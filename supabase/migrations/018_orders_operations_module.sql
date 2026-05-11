-- -----------------------------------------------------------------------------
-- Migration 018: Orders operations module
-- Purpose:
-- 1) Record status/payment action trails for admin operations
-- 2) Support internal notes and production scheduling hooks
-- 3) Add explicit cancellation/refund timestamps for operational clarity
-- -----------------------------------------------------------------------------

alter table exp_orders
  add column if not exists cancelled_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists shipping_carrier text,
  add column if not exists tracking_number text;

create table if not exists exp_order_status_events (
  id                       uuid primary key default gen_random_uuid(),
  order_id                 uuid not null references exp_orders(id) on delete cascade,
  action_type              text not null check (action_type in (
    'status_transition',
    'cancel',
    'refund_marked',
    'note',
    'schedule_hook',
    'hook_completed'
  )),
  previous_status          text,
  next_status              text,
  previous_payment_status  text,
  next_payment_status      text,
  note                     text,
  metadata                 jsonb not null default '{}'::jsonb,
  created_by               text,
  created_at               timestamptz not null default now()
);

create index if not exists idx_exp_order_status_events_order
  on exp_order_status_events(order_id, created_at desc);

create table if not exists exp_order_internal_notes (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references exp_orders(id) on delete cascade,
  note        text not null,
  is_pinned   boolean not null default false,
  created_by  text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_exp_order_internal_notes_order
  on exp_order_internal_notes(order_id, created_at desc);

create table if not exists exp_order_production_hooks (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references exp_orders(id) on delete cascade,
  stage            text not null check (stage in ('design', 'setup', 'production', 'finishing', 'packing')),
  scheduled_for    timestamptz,
  estimated_hours  numeric(8,2),
  assignee         text,
  note             text,
  is_completed     boolean not null default false,
  completed_at     timestamptz,
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_exp_order_production_hooks_order
  on exp_order_production_hooks(order_id, stage, is_completed, created_at desc);

create trigger trg_exp_order_production_hooks_updated_at
before update on exp_order_production_hooks
for each row execute function exp_set_updated_at();

alter table exp_order_status_events enable row level security;
alter table exp_order_internal_notes enable row level security;
alter table exp_order_production_hooks enable row level security;
