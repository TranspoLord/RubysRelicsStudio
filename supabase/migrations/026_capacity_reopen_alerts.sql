-- -----------------------------------------------------------------------------
-- Migration 026: Capacity Reopened Alerts
-- Purpose:
-- 1) Record customer/guest subscriptions for category-capacity reopen alerts.
-- 2) Support notify/unsubscribe lifecycle similar to back-in-stock flows.
-- -----------------------------------------------------------------------------

create table if not exists exp_capacity_reopen_alerts (
  id                 uuid primary key default gen_random_uuid(),
  category_key       text not null,
  email              text not null,
  customer_id        uuid references exp_customers(id) on delete set null,
  status             text not null default 'active'
    check (status in ('active', 'notified', 'unsubscribed')),
  source             text not null default 'category_page',
  subscribed_at      timestamptz not null default now(),
  notified_at        timestamptz,
  unsubscribed_at    timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (category_key, email)
);

create index if not exists idx_exp_capacity_reopen_alerts_status
  on exp_capacity_reopen_alerts(status, created_at desc);

create index if not exists idx_exp_capacity_reopen_alerts_category
  on exp_capacity_reopen_alerts(category_key, status);

alter table exp_capacity_reopen_alerts enable row level security;

drop trigger if exists trg_exp_capacity_reopen_alerts_updated_at on exp_capacity_reopen_alerts;
create trigger trg_exp_capacity_reopen_alerts_updated_at
before update on exp_capacity_reopen_alerts
for each row execute function exp_set_updated_at();
