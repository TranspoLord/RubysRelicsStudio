-- Verify customer data lockdown after migration 013
-- Run in Supabase SQL editor after applying migrations.

-- Tables expected to be locked down for anon/authenticated and enabled for RLS.
WITH target_tables AS (
  SELECT unnest(ARRAY[
    'exp_customers'::text,
    'exp_customer_sessions'::text,
    'exp_password_reset_tokens'::text,
    'exp_customer_addresses'::text,
    'exp_wishlists'::text,
    'exp_recently_viewed'::text,
    'exp_newsletter_subscribers'::text
  ]) AS table_name
),
rls_status AS (
  SELECT
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN (SELECT table_name FROM target_tables)
)
SELECT
  t.table_name,
  COALESCE(r.rls_enabled, false) AS rls_enabled,
  COALESCE(r.rls_forced, false) AS rls_forced
FROM target_tables t
LEFT JOIN rls_status r USING (table_name)
ORDER BY t.table_name;

-- Privilege matrix for anon/authenticated/service_role.
SELECT
  table_name,
  grantee,
  string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
    'exp_customers',
    'exp_customer_sessions',
    'exp_password_reset_tokens',
    'exp_customer_addresses',
    'exp_wishlists',
    'exp_recently_viewed',
    'exp_newsletter_subscribers'
  )
  AND grantee IN ('anon', 'authenticated', 'service_role')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;

-- Confirm auth.uid()-based policies were removed from customer engagement tables.
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('exp_wishlists', 'exp_recently_viewed')
ORDER BY tablename, policyname;

-- Hard-fail checks for CI/manual certainty.
DO $$
DECLARE
  bad_count integer;
BEGIN
  -- 1) RLS must be enabled on all target tables.
  SELECT COUNT(*) INTO bad_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN (
      'exp_customers',
      'exp_customer_sessions',
      'exp_password_reset_tokens',
      'exp_customer_addresses',
      'exp_wishlists',
      'exp_recently_viewed',
      'exp_newsletter_subscribers'
    )
    AND c.relrowsecurity IS DISTINCT FROM true;

  IF bad_count > 0 THEN
    RAISE EXCEPTION 'RLS not enabled on % target table(s).', bad_count;
  END IF;

  -- 2) anon/authenticated must have no table privileges.
  SELECT COUNT(*) INTO bad_count
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN (
      'exp_customers',
      'exp_customer_sessions',
      'exp_password_reset_tokens',
      'exp_customer_addresses',
      'exp_wishlists',
      'exp_recently_viewed',
      'exp_newsletter_subscribers'
    )
    AND grantee IN ('anon', 'authenticated');

  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Found % unexpected anon/authenticated grants on customer tables.', bad_count;
  END IF;
END $$;
