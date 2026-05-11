-- Migration 016: Admin foundation hardening
-- Adds admin audit logging and Stripe webhook idempotency tracking.

CREATE TABLE IF NOT EXISTS exp_admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  route TEXT NOT NULL,
  request_ip TEXT,
  user_agent TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'failure')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  branch TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON exp_admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_entity ON exp_admin_audit_log(entity_type, entity_id);

ALTER TABLE exp_admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE exp_admin_audit_log FROM anon, authenticated;
GRANT ALL ON TABLE exp_admin_audit_log TO service_role;

CREATE TABLE IF NOT EXISTS exp_stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'processed', 'failed')) DEFAULT 'processing',
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_status_created_at
  ON exp_stripe_webhook_events(status, created_at DESC);

ALTER TABLE exp_stripe_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE exp_stripe_webhook_events FROM anon, authenticated;
GRANT ALL ON TABLE exp_stripe_webhook_events TO service_role;