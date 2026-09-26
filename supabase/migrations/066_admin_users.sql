-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 066: Admin allow-list (SEPT_IMPLEMENTATION_PLAN §10.1)
--
-- Replaces the shared ADMIN_LOGIN_KEY as the thing that makes an account an
-- admin. A Google account only reaches /admin when its auth.users.id has a row
-- here *and* app_metadata.role = 'admin' has been written for it
-- (scripts/grant-admin.mjs does both in one step).
--
-- Keyed by user_id, never by email: an email change on the admin's Google
-- account must neither grant nor revoke access. `email` is stored for display
-- and audit only.
--
-- Lockdown matches exp_admin_sessions (045_admin_sessions.sql:22-26): RLS on,
-- no policies, all access revoked from the public API keys, service_role only.
-- The request path (§10.3) reads this table through getSupabaseAdmin(), never
-- through the anon/authenticated client.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exp_admin_users (
  user_id       UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'admin',
  -- `role` is deliberately left open-ended: adding a future value (for example
  -- 'owner') should not require a migration to widen a CHECK constraint.
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    TEXT,
  last_login_at TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);

ALTER TABLE exp_admin_users ENABLE ROW LEVEL SECURITY;

-- No policies on purpose: only the service role may read or write. A signed-in
-- customer must never be able to enumerate the allow-list.
REVOKE ALL ON TABLE exp_admin_users FROM anon, authenticated;
GRANT ALL ON TABLE exp_admin_users TO service_role;

-- The request path looks rows up by user_id (primary key). Email is used by the
-- grant/revoke tooling and for display in the panel.
CREATE INDEX IF NOT EXISTS idx_exp_admin_users_email ON exp_admin_users (email);
CREATE INDEX IF NOT EXISTS idx_exp_admin_users_active ON exp_admin_users (is_active);
