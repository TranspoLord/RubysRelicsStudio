-- -----------------------------------------------------------------------------
-- Migration 022: Back-in-stock alerts
-- Purpose:
-- 1) Record customer/guest subscriptions for product restock alerts
-- 2) Keep a simple lifecycle state for notification processing
-- -----------------------------------------------------------------------------

create table if not exists exp_back_in_stock_alerts (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references exp_products(id) on delete cascade,
  email              text not null,
  customer_id        uuid references exp_customers(id) on delete set null,
  status             text not null default 'active'
    check (status in ('active', 'notified', 'unsubscribed')),
  source             text not null default 'product_page',
  consent_ip         text,
  consent_user_agent text,
  subscribed_at      timestamptz not null default now(),
  notified_at        timestamptz,
  unsubscribed_at    timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (product_id, email)
);

create index if not exists idx_exp_back_in_stock_alerts_status
  on exp_back_in_stock_alerts(status, created_at desc);

create index if not exists idx_exp_back_in_stock_alerts_product
  on exp_back_in_stock_alerts(product_id, status);

alter table exp_back_in_stock_alerts enable row level security;

create trigger trg_exp_back_in_stock_alerts_updated_at
before update on exp_back_in_stock_alerts
for each row execute function exp_set_updated_at();
