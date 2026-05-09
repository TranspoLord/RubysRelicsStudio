-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 007: Guest-safe order tracking and Stripe payment intent reference
-- Purpose:
-- - Enable tokenized guest tracking links with expiration
-- - Persist Stripe payment_intent id for failure/refund webhook correlation
-- ─────────────────────────────────────────────────────────────────────────────

alter table exp_orders
  add column if not exists guest_tracking_token text,
  add column if not exists guest_tracking_expires_at timestamptz,
  add column if not exists stripe_payment_intent_id text;

create unique index if not exists idx_exp_orders_guest_tracking_token
  on exp_orders(guest_tracking_token)
  where guest_tracking_token is not null;

create index if not exists idx_exp_orders_guest_tracking_expires
  on exp_orders(guest_tracking_expires_at)
  where guest_tracking_expires_at is not null;

create unique index if not exists idx_exp_orders_stripe_payment_intent
  on exp_orders(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
