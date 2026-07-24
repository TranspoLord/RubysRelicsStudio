-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 044: Persistent rate-limit counter table (SEC-008)
--
-- The previous in-memory Map rate limiter reset on every Vercel serverless
-- cold start, making all rate-limit-based defenses bypassable across
-- instances. This migration creates a Supabase-backed counter table with an
-- atomic increment RPC so rate limit state survives cold starts.
--
-- NOTE: Parameters are in ALPHABETICAL ORDER by name. PostgREST sorts JSON
-- object keys alphabetically when building the schema cache lookup, so the
-- function signature must match that order. After finding the function,
-- PostgREST maps values to params by name, not position.
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
--
-- IMPORTANT: Parameters in ALPHABETICAL ORDER to match PostgREST's
-- schema cache lookup (p_expires_at before p_key since p_e < p_k).
CREATE OR REPLACE FUNCTION increment_rate_limit(
  p_expires_at TIMESTAMPTZ,
  p_key        TEXT
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
  ON CONFLICT (key)
  DO UPDATE SET
    count = CASE
      WHEN exp_rate_limit_windows.expires_at < now() THEN 1
      ELSE exp_rate_limit_windows.count + 1
    END,
    window_start = CASE
      WHEN exp_rate_limit_windows.expires_at < now() THEN extract(epoch from now())::bigint
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

-- Lazy cleanup: delete expired windows.
-- Called opportunistically by the application layer on read.
-- Index on expires_at added in migration 048 for performance.
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