-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 048: Apply missing schema objects & security fixes
--
-- This migration is self-contained — it creates everything needed for rate
-- limiting, admin sessions, artwork uploads, and Square webhook dedup on
-- whichever database it runs. This is necessary because Vercel may point
-- to a different Supabase project than where previous migrations were applied.
--
-- Contents:
--   1. exp_rate_limit_windows table + increment_rate_limit RPC (from 044)
--   2. exp_square_webhook_events (from 043)
--   3. exp_admin_sessions (from 045)
--   4. exp_artwork_uploads (from 046)
--   5. Index on exp_rate_limit_windows.expires_at for cleanup perf
--   6. Drop dead RLS policies on exp_orders referencing dropped customer_id
--   7. Cleanup: drop obsolete function overloads
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 0. Rate limiter table + RPC (self-contained, from 044) ─────────────────
CREATE TABLE IF NOT EXISTS exp_rate_limit_windows (
  key          TEXT        NOT NULL,
  window_start BIGINT      NOT NULL,
  count        INT         NOT NULL DEFAULT 1,
  expires_at   TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (key)
);

ALTER TABLE exp_rate_limit_windows ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE exp_rate_limit_windows FROM anon, authenticated;
GRANT ALL ON TABLE exp_rate_limit_windows TO service_role;

-- Drop any old 3-param overload first, then create the alphabetical-order version
DROP FUNCTION IF EXISTS increment_rate_limit(TEXT, BIGINT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS increment_rate_limit(TEXT, TIMESTAMPTZ);

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

CREATE INDEX IF NOT EXISTS idx_exp_rate_limit_windows_expires
ON exp_rate_limit_windows (expires_at);

-- ── 1. Square webhook event deduplication (from 043) ──────────────────────────
CREATE TABLE IF NOT EXISTS exp_square_webhook_events (
  id              TEXT PRIMARY KEY,
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

-- ── 2. Admin session revocation table (from 045) ──────────────────────────────
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

-- ── 3. Artwork upload ownership tokens (from 046) ─────────────────────────────
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

-- ── 5. Drop dead RLS policies referencing dropped customer_id column ─────────
-- Migration 042 removed the customer_id column but left these policies behind.
-- They are dead code and may cause confusion or errors in audit.
DROP POLICY IF EXISTS "users_select_own_orders" ON exp_orders;
DROP POLICY IF EXISTS "users_update_own_orders" ON exp_orders;
DROP POLICY IF EXISTS "users_select_own_order_items" ON exp_order_items;
DROP POLICY IF EXISTS "users_update_own_order_items" ON exp_order_items;

-- These policies referenced auth.uid() == customer_id, but customer_id was
-- dropped in migration 042. Customer order access now goes through the
-- service role via API routes with guest tokens or session claims.

-- ── 6. Drop any leftover 3-parameter RPC overload ────────────────────────────
DROP FUNCTION IF EXISTS increment_rate_limit(TEXT, BIGINT, TIMESTAMPTZ);