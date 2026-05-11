-- -----------------------------------------------------------------------------
-- Migration 019: Custom requests lifecycle completion (Phase 6)
-- Purpose:
-- 1) Add quote-expiry fields with resend/extension tracking
-- 2) Track paid-to-production handoff time
-- -----------------------------------------------------------------------------

alter table exp_custom_requests
  add column if not exists quote_sent_at timestamptz,
  add column if not exists quote_expires_at timestamptz,
  add column if not exists quote_last_resent_at timestamptz,
  add column if not exists quote_resend_count integer not null default 0,
  add column if not exists production_handoff_at timestamptz;

create index if not exists idx_exp_custom_requests_quote_expires
  on exp_custom_requests(quote_expires_at)
  where quote_expires_at is not null;

create index if not exists idx_exp_custom_requests_handoff
  on exp_custom_requests(production_handoff_at)
  where production_handoff_at is not null;
