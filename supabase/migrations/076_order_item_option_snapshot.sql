-- -----------------------------------------------------------------------------
-- Migration 076: restore exp_order_items.option_snapshot (live-schema drift)
--
-- `option_snapshot` is declared by migration 028, by 049's CREATE TABLE and by
-- supabase/verification/schema_repair.sql — but the live project does not have
-- it. PostgREST answers every statement that names it with
--
--   PGRST204 "Could not find the 'option_snapshot' column of 'exp_order_items'
--            in the schema cache"
--
-- Impact found in production on 2026-10-10 (order cade2b79-fb64-4fba-b5f2-0f716886a37f):
--   * `POST /api/square/checkout` recorded the order row and the Square link,
--     then failed the order-items insert with that PGRST204. The pre-remediation
--     build swallowed the error (log line
--     `[square:checkout:order-items-insert] [object Object]`) and still returned
--     the payable URL, so the customer paid for an order with **zero line items**.
--   * `GET /api/admin/orders` selects `option_snapshot`, so the admin order
--     detail is broken by the same drift.
--   * The pre-remediation logger printed `[object Object]` instead of the
--     PostgREST message, which is why the failure was invisible (fixed in
--     src/lib/security/logger.ts, OCT #16).
--
-- Idempotent: safe to re-run. Apply via the Supabase SQL editor or
-- `npx supabase db query --linked` — NOT `db push` (OCT-13).
-- -----------------------------------------------------------------------------

alter table public.exp_order_items
  add column if not exists option_snapshot jsonb not null default '{}'::jsonb;

comment on column public.exp_order_items.option_snapshot is
  'Snapshot of the option selections at purchase time (mirrors selected_options). Restored by migration 076 after live-schema drift.';

-- PostgREST caches the schema per project; without this the column stays
-- invisible to the API until the next DDL event or a project restart.
notify pgrst, 'reload schema';
