-- -----------------------------------------------------------------------------
-- Migration 073: email send bookkeeping (OCT #14)
--
-- A 429 from Resend (2 req/s by default, easily hit by a 100–200 recipient
-- restock fan-out) used to leave no trace: the alert was marked `notified` and
-- the subscriber never heard back. These columns let the processors
--   * claim an alert before sending, so two concurrent runs cannot both send,
--   * record why a send failed, and how many times it has been tried.
--
-- Idempotent: safe to re-run. Apply via the Supabase SQL editor or
-- `npx supabase db query --linked` — NOT `db push` (OCT-13).
-- -----------------------------------------------------------------------------

alter table public.exp_back_in_stock_alerts
  add column if not exists send_attempts int not null default 0,
  add column if not exists last_send_error text,
  add column if not exists claimed_at timestamptz;

alter table public.exp_capacity_reopen_alerts
  add column if not exists send_attempts int not null default 0,
  add column if not exists last_send_error text,
  add column if not exists claimed_at timestamptz;

comment on column public.exp_back_in_stock_alerts.claimed_at is
  'OCT #14: set while a processor run owns this alert, so concurrent runs cannot double-send. Reclaimable after 15 minutes.';
comment on column public.exp_back_in_stock_alerts.send_attempts is
  'OCT #14: failed send attempts, so a permanently bad address is visible instead of silent.';
comment on column public.exp_capacity_reopen_alerts.claimed_at is
  'OCT #14: set while a processor run owns this alert, so concurrent runs cannot double-send. Reclaimable after 15 minutes.';
comment on column public.exp_capacity_reopen_alerts.send_attempts is
  'OCT #14: failed send attempts, so a permanently bad address is visible instead of silent.';

-- Partial indexes keep the claim query cheap as the tables grow.
create index if not exists exp_back_in_stock_alerts_claim_idx
  on public.exp_back_in_stock_alerts (status, claimed_at)
  where status = 'active';

create index if not exists exp_capacity_reopen_alerts_claim_idx
  on public.exp_capacity_reopen_alerts (status, claimed_at)
  where status = 'active';
