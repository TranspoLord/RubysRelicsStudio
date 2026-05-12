-- -----------------------------------------------------------------------------
-- Migration 024: Abandoned Cart Recovery
-- Purpose:
-- 1) Track pre-checkout cart captures so recovery emails can be sent
--    to customers who filled in their email but never started Stripe.
-- 2) Track recovery email state on exp_orders for checkout-started
--    abandonments (Stripe session expired without payment).
-- -----------------------------------------------------------------------------

-- ── Pre-checkout cart captures ─────────────────────────────────────────────
-- Populated by /api/cart/capture when customer enters their email in the
-- checkout form, before the Stripe session is created.  Linked back to
-- the resulting order once checkout starts.

create table if not exists exp_cart_captures (
  id                      uuid primary key default gen_random_uuid(),
  email                   text not null,
  cart_json               jsonb not null default '[]'::jsonb,
  recovery_sent_at        timestamptz,
  order_id                uuid references exp_orders(id) on delete set null,
  ip_hash                 text,                        -- SHA-256 of client IP for rate-limit audit only
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Index for finding stale, unsent, un-converted captures efficiently
create index if not exists idx_exp_cart_captures_recovery
  on exp_cart_captures(recovery_sent_at, order_id, created_at asc);

create index if not exists idx_exp_cart_captures_email
  on exp_cart_captures(email, created_at desc);

alter table exp_cart_captures enable row level security;
-- No public reads; only service role may access via admin API

drop trigger if exists trg_exp_cart_captures_updated_at on exp_cart_captures;
create trigger trg_exp_cart_captures_updated_at
before update on exp_cart_captures
for each row execute function exp_set_updated_at();

-- ── Recovery email state on exp_orders ────────────────────────────────────
-- Tracks whether a recovery email was sent for the order whose Stripe
-- checkout session expired without payment.  Prevents double-sends on
-- duplicate webhook delivery.

alter table exp_orders
  add column if not exists cart_recovery_email_sent_at timestamptz;
