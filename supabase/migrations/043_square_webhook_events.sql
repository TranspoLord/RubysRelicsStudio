-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 043: Square webhook event deduplication table (SEC-003)
--
-- Stores processed webhook event IDs for at least 24 hours so duplicate
-- deliveries from Square can be detected and rejected without reprocessing.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exp_square_webhook_events (
  id              TEXT PRIMARY KEY,          -- Square event.id
  event_type      TEXT NOT NULL,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed       BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE exp_square_webhook_events ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated access — service role only
REVOKE ALL ON TABLE exp_square_webhook_events FROM anon, authenticated;
GRANT ALL ON TABLE exp_square_webhook_events TO service_role;

-- Index for cleanup by age
CREATE INDEX IF NOT EXISTS idx_exp_square_webhook_events_received
ON exp_square_webhook_events (received_at);