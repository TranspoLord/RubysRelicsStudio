-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 045: Admin session revocation table (SEC-011)
--
-- Stores per-session records so individual admin sessions can be revoked
-- without rotating ADMIN_LOGIN_KEY (which kicks out all admins).
-- Each session has a JTI (UUID) embedded in the token, and a corresponding
-- row here containing token_hash, ip_address, user_agent, and timestamps.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exp_admin_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash        TEXT NOT NULL UNIQUE,
  jti               TEXT NOT NULL UNIQUE,
  ip_address        TEXT,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL,
  revoked_at        TIMESTAMPTZ,
  last_activity_at  TIMESTAMPTZ
);

ALTER TABLE exp_admin_sessions ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated access — service role only
REVOKE ALL ON TABLE exp_admin_sessions FROM anon, authenticated;
GRANT ALL ON TABLE exp_admin_sessions TO service_role;

-- Index for fast token_hash lookups during verification
CREATE INDEX IF NOT EXISTS idx_exp_admin_sessions_token_hash
ON exp_admin_sessions (token_hash);

-- Index for cleanup by expiry
CREATE INDEX IF NOT EXISTS idx_exp_admin_sessions_expires
ON exp_admin_sessions (expires_at);