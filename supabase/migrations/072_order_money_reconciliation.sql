-- -----------------------------------------------------------------------------
-- Migration 072: order money reconciliation (OCT #35)
--
-- `discount_amount` mixed the free-shipping discount into the item discount while
-- `shipping_cost` was stored post-discount, so `subtotal - discount + shipping`
-- did not equal `order_total`. These two columns make the identity explicit:
--
--   subtotal - discount_amount + shipping_cost - shipping_discount + tax_amount
--     = order_total
--
-- `tax_amount` is stored but stays 0 until the owner sets a nexus/tax policy
-- (OCT #35 step 4) — the column and the UI rows exist so enabling it is config,
-- not a migration.
--
-- Idempotent: safe to re-run. Apply via the Supabase SQL editor or
-- `npx supabase db query --linked` — NOT `db push` (OCT-13).
-- -----------------------------------------------------------------------------

alter table public.exp_orders
  add column if not exists shipping_discount numeric(10, 2) not null default 0,
  add column if not exists tax_amount numeric(10, 2) not null default 0;

comment on column public.exp_orders.shipping_discount is
  'OCT #35: the free-shipping portion of the discount, so shipping_cost can stay pre-discount.';
comment on column public.exp_orders.tax_amount is
  'OCT #35: sales tax charged. 0 until a nexus/tax policy is configured.';
