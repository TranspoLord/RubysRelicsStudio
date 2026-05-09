-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 006: Orders foundation for Stripe checkout lifecycle
-- Purpose:
-- - Persist checkout orders before redirecting to Stripe
-- - Track payment status updates from Stripe webhooks
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists exp_orders (
  id                        uuid primary key default gen_random_uuid(),
  order_path                text not null default 'shop' check (order_path in ('shop','ready_made','custom')),
  payment_mode              text not null default 'stripe_checkout' check (payment_mode in ('stripe_checkout','stripe_payment_link')),
  payment_status            text not null default 'pending' check (payment_status in ('pending','paid','failed','refunded')),
  status                    text not null default 'awaiting_payment' check (status in ('awaiting_payment','paid','in_production','ready_to_ship','shipped','delivered','cancelled')),
  stripe_session_id         text unique,
  production_estimate_band  text not null default 'To be confirmed',
  subtotal                  numeric(10,2) not null default 0,
  discount_amount           numeric(10,2) not null default 0,
  shipping_cost             numeric(10,2) not null default 0,
  order_total               numeric(10,2) not null default 0,
  shipping_method           text not null default 'standard',
  shipping_address          jsonb not null default '{}'::jsonb,
  cart_snapshot             jsonb not null default '{}'::jsonb,
  branch                    text not null default 'DEV' check (branch in ('DEV','TEST','PROD')),
  paid_at                   timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create table if not exists exp_order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references exp_orders(id) on delete cascade,
  product_id      uuid,
  product_title   text not null,
  variant_label   text,
  selected_options jsonb not null default '{}'::jsonb,
  unit_price      numeric(10,2) not null default 0,
  quantity        integer not null check (quantity > 0),
  line_subtotal   numeric(10,2) not null default 0,
  line_discount   numeric(10,2) not null default 0,
  line_total      numeric(10,2) not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_exp_orders_status on exp_orders(status, payment_status);
create index if not exists idx_exp_orders_created on exp_orders(created_at desc);
create index if not exists idx_exp_order_items_order on exp_order_items(order_id);

alter table exp_orders enable row level security;
alter table exp_order_items enable row level security;

create trigger trg_exp_orders_updated_at
before update on exp_orders
for each row execute function exp_set_updated_at();
