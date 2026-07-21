-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 044: Persistent rate-limit counter table (SEC-008)
--
-- The previous in-memory Map rate limiter reset on every Vercel serverless
-- cold start, making all rate-limit-based defenses bypassable across
-- instances. This migration creates a Supabase-backed counter table with an
-- atomic increment RPC so rate limit state survives cold starts.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exp_rate_limit_windows (
  key          TEXT        NOT NULL,
  window_start BIGINT      NOT NULL,
  count        INT         NOT NULL DEFAULT 1,
  expires_at   TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (key, window_start)
);

ALTER TABLE exp_rate_limit_windows ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated access — service role only
REVOKE ALL ON TABLE exp_rate_limit_windows FROM anon, authenticated;
GRANT ALL ON TABLE exp_rate_limit_windows TO service_role;

-- Atomic increment: INSERT ... ON CONFLICT DO UPDATE
-- Returns the new count for the window.
CREATE OR REPLACE FUNCTION increment_rate_limit(
  p_key        TEXT,
  p_expires_at TIMESTAMPTZ
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO exp_rate_limit_windows (key, window_start, count, expires_at)
  VALUES (p_key, extract(epoch from now())::bigint, 1, p_expires_at)
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = exp_rate_limit_windows.count + 1
  RETURNING count INTO v_count;

  RETURN v_count;
END;
$$;

-- Lazy cleanup: delete expired windows older than 1 hour.
-- Called opportunistically by the application layer on read.
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM exp_rate_limit_windows WHERE expires_at < now();
END;
$$;