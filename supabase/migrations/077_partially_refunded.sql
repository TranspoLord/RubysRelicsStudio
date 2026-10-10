-- -----------------------------------------------------------------------------
-- Migration 077: `partially_refunded` + per-refund idempotency (OCT #4)
--
-- The refund branch of the Square webhook distinguishes a partial refund from a
-- full one, but the CHECK from migration 006/049 allows only
-- pending | paid | failed | refunded — writing `partially_refunded` fails with
-- 23514, and the handler would clear its dedupe row and 500 forever against a
-- constraint that can never pass.
--
-- Square sends `refund.created` and then `refund.updated` for the *same* refund,
-- so the amount must be applied once per refund id. The partial unique index
-- makes the status-event insert the atomic claim: the second delivery loses with
-- 23505 instead of adding the amount twice.
--
-- Idempotent: safe to re-run. Apply via the Supabase SQL editor or
-- `npx supabase db query --linked` — NOT `db push` (OCT-13).
-- -----------------------------------------------------------------------------

-- ── 1. Widen the payment_status CHECK ────────────────────────────────────────
-- Same NOT VALID → validate dance as 069: the ACCESS EXCLUSIVE lock is held only
-- for the catalog update, then validated in a separate pass.
alter table public.exp_orders drop constraint if exists exp_orders_payment_status_check;
alter table public.exp_orders add constraint exp_orders_payment_status_check
  check (payment_status in (
    'pending',
    'paid',
    'failed',
    'refunded',
    'partially_refunded'
  )) not valid;
alter table public.exp_orders validate constraint exp_orders_payment_status_check;

-- ── 2. One status event per Square refund ────────────────────────────────────
-- `action_type = 'refund_webhook'` rows carry `metadata->>'square_refund_id'`;
-- the index is what makes the insert-claim in the webhook atomic.
create unique index if not exists exp_order_status_events_refund_uidx
  on public.exp_order_status_events ((metadata->>'square_refund_id'))
  where action_type = 'refund_webhook';

comment on index public.exp_order_status_events_refund_uidx is
  'OCT #4: one refund_webhook event per Square refund id, so refund.created + refund.updated cannot double-count a refund.';
