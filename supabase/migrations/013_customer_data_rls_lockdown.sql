-- Migration 013: Customer data RLS lockdown
-- Goal: prevent public/anon reads or writes on customer-sensitive tables.
-- This keeps current server-side service-role access working while hardening DB exposure.

-- 1) Enable RLS on all customer-sensitive tables.
ALTER TABLE IF EXISTS exp_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS exp_customer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS exp_password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS exp_customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS exp_wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS exp_recently_viewed ENABLE ROW LEVEL SECURITY;

-- 2) Remove policies that assume Supabase Auth auth.uid() maps to exp_customers.id.
-- Current app uses custom customer sessions, so these policies are misleading and unnecessary.
DROP POLICY IF EXISTS "Customers can view own wishlists" ON exp_wishlists;
DROP POLICY IF EXISTS "Customers can view own recently viewed" ON exp_recently_viewed;

-- 3) Defense in depth: remove anon/authenticated privileges on customer-sensitive tables.
REVOKE ALL ON TABLE exp_customers FROM anon, authenticated;
REVOKE ALL ON TABLE exp_customer_sessions FROM anon, authenticated;
REVOKE ALL ON TABLE exp_password_reset_tokens FROM anon, authenticated;
REVOKE ALL ON TABLE exp_customer_addresses FROM anon, authenticated;
REVOKE ALL ON TABLE exp_wishlists FROM anon, authenticated;
REVOKE ALL ON TABLE exp_recently_viewed FROM anon, authenticated;

-- 4) Ensure service_role retains access for trusted server-side API usage.
GRANT ALL ON TABLE exp_customers TO service_role;
GRANT ALL ON TABLE exp_customer_sessions TO service_role;
GRANT ALL ON TABLE exp_password_reset_tokens TO service_role;
GRANT ALL ON TABLE exp_customer_addresses TO service_role;
GRANT ALL ON TABLE exp_wishlists TO service_role;
GRANT ALL ON TABLE exp_recently_viewed TO service_role;
