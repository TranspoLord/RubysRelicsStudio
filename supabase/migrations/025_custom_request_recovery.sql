-- -----------------------------------------------------------------------------
-- Migration 025: Custom Request Recovery
-- Purpose:
-- 1) Track reminder lifecycle for abandoned custom request intake recovery.
-- -----------------------------------------------------------------------------

alter table exp_custom_requests
  add column if not exists recovery_reminder_sent_at timestamptz;

create index if not exists idx_exp_custom_requests_recovery
  on exp_custom_requests(status, recovery_reminder_sent_at, created_at asc);
