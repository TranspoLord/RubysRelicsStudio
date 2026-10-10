-- -----------------------------------------------------------------------------
-- security_posture.sql — read-only verification of the DB privilege posture
--
-- Pairs with `scripts/test-rls-lockdown.mjs` (OCT #65) and the #3 lockdown
-- migration (068_db_privilege_lockdown.sql). Run against the linked project:
--
--   npx supabase db query --linked --file supabase/verification/security_posture.sql
--
-- Read-only. Safe to run any time. A non-empty result on a "should be empty"
-- query is a finding.
-- -----------------------------------------------------------------------------

-- 1. Functions anon / authenticated can EXECUTE (should be empty after #3).
select
  p.oid::regprocedure              as function,
  p.prosecdef                      as security_definer,
  has_function_privilege('anon', p.oid, 'execute')          as anon_exec,
  has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.prorettype <> 'trigger'::regtype
  and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'))
order by 1;

-- 2. Tables/views readable by anon / authenticated (should be empty for the
--    protected set — exp_orders, exp_order_items, exp_custom_requests, …).
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
group by 1, 2
order by 1;

-- 3. The RLS-bypassing view must be gone (should be 0 rows).
select relname, reloptions
from pg_class
where relnamespace = 'public'::regnamespace
  and relkind in ('v', 'm')
  and relname = 'exp_commission_queue';

-- 4. Storage listing policies (anon listing a private bucket is a finding —
--    see OCT #64 for product-media).
select policyname, tablename, cmd, roles
from pg_policies
where schemaname = 'storage'
order by tablename, policyname;

-- 5. Sanity: how many admins and how many auth users exist.
select
  (select count(*) from public.exp_admin_users) as admin_users,
  (select count(*) from auth.users)             as auth_users;
