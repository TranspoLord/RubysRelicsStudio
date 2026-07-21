-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 046: Artwork upload ownership tokens (SEC-018)
--
-- Creates a table to bind uploaded artwork paths to per-session tokens so
-- custom-order intake can verify that the submitter actually uploaded the
-- files they reference (prevents cross-customer artwork path referencing).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exp_artwork_uploads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_token    TEXT NOT NULL UNIQUE,
  file_path       TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);

ALTER TABLE exp_artwork_uploads ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated access — service role only
REVOKE ALL ON TABLE exp_artwork_uploads FROM anon, authenticated;
GRANT ALL ON TABLE exp_artwork_uploads TO service_role;

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_exp_artwork_uploads_token
ON exp_artwork_uploads (upload_token);

-- Index for cleanup by expiry
CREATE INDEX IF NOT EXISTS idx_exp_artwork_uploads_expires
ON exp_artwork_uploads (expires_at);