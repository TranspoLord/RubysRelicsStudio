-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 009: Custom request tracking + quote payment linkage
-- Purpose:
-- - Add guest-safe access token for custom-request status pages
-- - Link paid custom-request checkout sessions into exp_orders
-- ─────────────────────────────────────────────────────────────────────────────

alter table exp_custom_requests
  add column if not exists customer_access_token text,
  add column if not exists customer_access_expires_at timestamptz;

create unique index if not exists idx_exp_custom_requests_access_token
  on exp_custom_requests(customer_access_token)
  where customer_access_token is not null;

create index if not exists idx_exp_custom_requests_access_expires
  on exp_custom_requests(customer_access_expires_at)
  where customer_access_expires_at is not null;

alter table exp_orders
  add column if not exists custom_request_id uuid references exp_custom_requests(id),
  add column if not exists stripe_payment_link_id text;

create unique index if not exists idx_exp_orders_payment_link_id
  on exp_orders(stripe_payment_link_id)
  where stripe_payment_link_id is not null;

create index if not exists idx_exp_orders_custom_request
  on exp_orders(custom_request_id)
  where custom_request_id is not null;
