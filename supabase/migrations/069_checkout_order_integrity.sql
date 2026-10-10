-- -----------------------------------------------------------------------------
-- Migration 069: checkout order integrity (OCT #2)
--
-- Two independent defects, both of which silently lose paid orders:
--
--   1. `exp_orders.payment_mode` only allowed stripe_checkout /
--      stripe_payment_link / square_payment_link (migration 050), but the shop
--      checkout route inserts 'square_checkout'. If the live constraint matches
--      the migrations, every shop order insert fails with 23514 — the customer
--      pays and no order row is ever written.
--
--   2. Nothing made a retry idempotent, so back/refresh created a second Square
--      link and a second order row. `checkout_attempt_id` + a unique index make
--      the route able to return the existing link instead of minting a new one,
--      and the `square_order_id` unique index stops duplicate webhook matches.
--
-- Idempotent: safe to re-run. Apply via the Supabase SQL editor or
-- `npx supabase db query --linked` — NOT `db push` (OCT-13).
-- -----------------------------------------------------------------------------

-- ── 1. Widen the payment_mode CHECK ──────────────────────────────────────────
-- Added NOT VALID first so the ACCESS EXCLUSIVE lock is held only for the
-- catalog update, then validated in a separate (still locking, but short) pass.
alter table public.exp_orders drop constraint if exists exp_orders_payment_mode_check;
alter table public.exp_orders add constraint exp_orders_payment_mode_check
  check (payment_mode in (
    'stripe_checkout',
    'stripe_payment_link',
    'square_payment_link',
    'square_checkout'
  )) not valid;
alter table public.exp_orders validate constraint exp_orders_payment_mode_check;

-- ── 2. Idempotency + link bookkeeping columns ────────────────────────────────
alter table public.exp_orders
  add column if not exists checkout_attempt_id uuid,
  add column if not exists square_payment_link_id text,
  add column if not exists square_payment_link_url text;

-- One order per checkout attempt, so a retry resolves to the same row.
create unique index if not exists exp_orders_checkout_attempt_uidx
  on public.exp_orders (checkout_attempt_id)
  where checkout_attempt_id is not null;

-- ── 3. One order per Square order ────────────────────────────────────────────
-- NOTE: if this fails, duplicates already exist. Find them with:
--   select square_order_id, count(*) from public.exp_orders
--   where square_order_id is not null group by 1 having count(*) > 1;
-- and reconcile before re-running.
create unique index if not exists exp_orders_square_order_uidx
  on public.exp_orders (square_order_id)
  where square_order_id is not null;

comment on column public.exp_orders.checkout_attempt_id is
  'Client-supplied idempotency key (OCT #2). Unique when present: a retried checkout resolves to the same order row instead of creating a second one.';
