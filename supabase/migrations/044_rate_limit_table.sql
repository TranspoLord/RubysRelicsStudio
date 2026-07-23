-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 044: Persistent rate-limit counter table (SEC-008)
--
-- The previous in-memory Map rate limiter reset on every Vercel serverless
-- cold start, making all rate-limit-based defenses bypassable across
-- instances. This migration creates a Supabase-backed counter table with an
-- atomic increment RPC so rate limit state survives cold starts.
--
-- FIX 2026-07-23: The original PK was (key, window_start) but window_start
-- was computed by PostgreSQL as extract(epoch from now())::bigint, which
-- changes every second. This meant ON CONFLICT never fired — each second
-- got its own row with count=1, completely bypassing rate limits.
-- Fixed by: (1) making the PK just (key), (2) passing window_start from
-- the application layer, (3) resetting count when the window has expired.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exp_rate_limit_windows (
  key          TEXT        NOT NULL,
  window_start BIGINT      NOT NULL,
  count        INT         NOT NULL DEFAULT 1,
  expires_at   TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (key)
);

ALTER TABLE exp_rate_limit_windows ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated access — service role only
REVOKE ALL ON TABLE exp_rate_limit_windows FROM anon, authenticated;
GRANT ALL ON TABLE exp_rate_limit_windows TO service_role;

-- Atomic increment: INSERT ... ON CONFLICT DO UPDATE
-- Returns the new count for the window.
-- If the existing row's window has expired, reset count to 1.
CREATE OR REPLACE FUNCTION increment_rate_limit(
  p_key          TEXT,
  p_window_start BIGINT,
  p_expires_at   TIMESTAMPTZ
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO exp_rate_limit_windows (key, window_start, count, expires_at)
  VALUES (p_key, p_window_start, 1, p_expires_at)
  ON CONFLICT (key)
  DO UPDATE SET
    count = CASE
      -- If the window has expired, reset the counter
      WHEN exp_rate_limit_windows.expires_at < now() THEN 1
      -- Otherwise increment
      ELSE exp_rate_limit_windows.count + 1
    END,
    window_start = CASE
      WHEN exp_rate_limit_windows.expires_at < now() THEN p_window_start
      ELSE exp_rate_limit_windows.window_start
    END,
    expires_at = CASE
      WHEN exp_rate_limit_windows.expires_at < now() THEN p_expires_at
      ELSE exp_rate_limit_windows.expires_at
    END
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