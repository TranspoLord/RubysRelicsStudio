-- -----------------------------------------------------------------------------
-- Migration 071: persist what was actually produced (OCT #5)
--
-- The chosen process add-ons were priced by the storefront but never stored, so
-- the studio could not tell what to make for an order. NFC add-on data has the
-- same gap (and is still unpriced — OCT #5 step 5, an owner decision).
--
-- Idempotent: safe to re-run. Apply via the Supabase SQL editor or
-- `npx supabase db query --linked` — NOT `db push` (OCT-13).
-- -----------------------------------------------------------------------------

alter table public.exp_order_items
  add column if not exists selected_process_keys text[] not null default '{}',
  add column if not exists nfc jsonb;

comment on column public.exp_order_items.selected_process_keys is
  'OCT #5: the process add-on keys priced into this line, so production knows what to make.';
comment on column public.exp_order_items.nfc is
  'OCT #5: NFC add-on data ({targetData, leaveUnlocked}) when the customer chose it.';
