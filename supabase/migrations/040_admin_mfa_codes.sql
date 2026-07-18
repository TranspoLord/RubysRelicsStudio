-- Migration 040: Admin MFA code storage
-- Moves MFA codes from in-memory Map to Supabase so they work across
-- Vercel serverless instances (no more cold-start code loss).

CREATE TABLE IF NOT EXISTS admin_mfa_codes (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip         TEXT        NOT NULL,
  code       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN     NOT NULL DEFAULT false
);

-- Index for fast IP+code lookups during verification
CREATE INDEX IF NOT EXISTS idx_admin_mfa_codes_ip ON admin_mfa_codes (ip);
CREATE INDEX IF NOT EXISTS idx_admin_mfa_codes_expires ON admin_mfa_codes (expires_at);

-- RLS: only service_role can access (admin-only data)
ALTER TABLE admin_mfa_codes ENABLE ROW LEVEL SECURITY;

-- Revoke all from anon/authenticated
REVOKE ALL ON TABLE admin_mfa_codes FROM anon, authenticated;

-- Grant all to service_role
GRANT ALL ON TABLE admin_mfa_codes TO service_role;

-- Auto-cleanup expired codes via a scheduled function (run every 10 min)
-- This is optional — the application layer also prunes on read.
CREATE OR REPLACE FUNCTION cleanup_expired_mfa_codes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM admin_mfa_codes WHERE expires_at < now();
END;
$$;