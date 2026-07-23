-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 047: Fix rate-limit PK and RPC function (SEC-008)
--
-- The original PK was (key, window_start) but window_start was computed
-- by PostgreSQL as extract(epoch from now())::bigint, which changes every
-- second. This meant ON CONFLICT never fired — each second got its own
-- row with count=1, completely bypassing rate limits.
--
-- Fix: Change PK to just (key), and update the RPC to:
--   1. INSERT ... ON CONFLICT (key) so the same key always conflicts
--   2. Reset count to 1 if the existing window has expired
--   3. Keep 2-parameter signature (p_key, p_expires_at) for backward
--      compatibility — the window identifier is embedded in p_key itself
--      (the application passes `${key}:${windowStart}` as p_key)
-- ─────────────────────────────────────────────────────────────────────────────

-- First drop both overloads of the old RPC so we can redefine it cleanly.
-- There may be a 2-parameter version and a 3-parameter version from
-- a previous migration attempt, so we specify the argument lists explicitly.
DROP FUNCTION IF EXISTS increment_rate_limit(TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS increment_rate_limit(TEXT, BIGINT, TIMESTAMPTZ);

-- Recreate the table with the corrected PK.
-- We use IF NOT EXISTS + ALTER so this is idempotent.
ALTER TABLE exp_rate_limit_windows DROP CONSTRAINT IF EXISTS exp_rate_limit_windows_pkey;
ALTER TABLE exp_rate_limit_windows ADD PRIMARY KEY (key);

-- Atomic increment: INSERT ... ON CONFLICT DO UPDATE
-- Returns the new count for the window.
-- If the existing row's window has expired, reset count to 1.
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
  ON CONFLICT (key)
  DO UPDATE SET
    count = CASE
      -- If the window has expired, reset the counter
      WHEN exp_rate_limit_windows.expires_at < now() THEN 1
      -- Otherwise increment
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