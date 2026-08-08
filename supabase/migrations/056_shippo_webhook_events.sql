-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 056: Shippo webhook replay protection table (SEC-004)
--
-- Stores processed Shippo webhook payload fingerprints for at least 24 hours
-- so duplicate deliveries/replays are detected and safely no-op.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exp_shippo_webhook_events (
  id              TEXT PRIMARY KEY,          -- shippo:{sha256(raw_body)}
  event_type      TEXT NOT NULL,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed       BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE exp_shippo_webhook_events ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated access — service role only
REVOKE ALL ON TABLE exp_shippo_webhook_events FROM anon, authenticated;
GRANT ALL ON TABLE exp_shippo_webhook_events TO service_role;

-- Index for cleanup by age
CREATE INDEX IF NOT EXISTS idx_exp_shippo_webhook_events_received
ON exp_shippo_webhook_events (received_at);
