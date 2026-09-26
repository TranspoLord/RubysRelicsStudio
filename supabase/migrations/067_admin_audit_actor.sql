-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 067: attribute the admin audit trail (SEPT_IMPLEMENTATION_PLAN §10.7)
--
-- Under the shared ADMIN_LOGIN_KEY every admin was the same actor, so
-- exp_admin_audit_log recorded what happened but never *who* did it. Once the
-- route gate is backed by Supabase Auth (§10.3) the acting admin's identity is
-- available on every request and belongs on every row.
--
-- No foreign key on purpose: an audit row must outlive the account it names.
-- An FK would either cascade the evidence away with the user or block the
-- account deletion.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE exp_admin_audit_log ADD COLUMN IF NOT EXISTS actor_user_id UUID;
ALTER TABLE exp_admin_audit_log ADD COLUMN IF NOT EXISTS actor_email  TEXT;

CREATE INDEX IF NOT EXISTS idx_exp_admin_audit_log_actor_user
ON exp_admin_audit_log (actor_user_id);
