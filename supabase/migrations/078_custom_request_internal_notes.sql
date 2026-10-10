-- -----------------------------------------------------------------------------
-- Migration 078: exp_custom_requests.internal_notes (OCT #28)
--
-- The panel had one "Admin note" box whose text was emailed to the customer as
-- "Note from the studio" *and* written over `admin_notes` on send / handoff /
-- reject / reopen. So a private remark could reach a customer, and an empty box
-- erased the previous rejection reason.
--
-- `internal_notes` is append-only studio history. It is never emailed, and it is
-- never selected by a customer-facing path (`/api/custom-orders/[id]` GET, the
-- customer status page, or any email).
--
-- Idempotent: safe to re-run. Apply via the Supabase SQL editor or
-- `npx supabase db query --linked` — NOT `db push` (OCT-13).
-- -----------------------------------------------------------------------------

alter table public.exp_custom_requests
  add column if not exists internal_notes text;

comment on column public.exp_custom_requests.internal_notes is
  'OCT #28: append-only internal notes. Never emailed and never selected by customer-facing queries.';
