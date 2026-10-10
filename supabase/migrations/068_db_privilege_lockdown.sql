-- -----------------------------------------------------------------------------
-- Migration 068: database privilege lockdown (OCT #3)
--
-- PostgREST exposes every function in `public` at /rest/v1/rpc/<name>, and the
-- anon key ships in the browser bundle. Postgres grants EXECUTE on new functions
-- to PUBLIC by default, so the SECURITY DEFINER RPCs below were callable by anon
-- and authenticated — a DoS (rate-limit poisoning), promo sabotage and inventory
-- tampering surface. The RLS-bypassing `exp_commission_queue` view was also
-- readable by every authenticated (Google) account, exposing paid order lines.
--
-- This revokes EXECUTE from public/anon/authenticated, grants it to service_role
-- only (every app caller already uses getSupabaseAdmin()), drops the view, and
-- makes future `public` functions default to no public EXECUTE.
--
-- Idempotent: safe to re-run. Apply via the Supabase SQL editor or
-- `npx supabase db query --linked` — NOT `db push` (OCT-13).
-- -----------------------------------------------------------------------------

-- 1. Service-role-only RPCs. Literal statements (not a dynamic DO block) so the
--    grant posture is greppable and asserted by
--    src/lib/security/rpc-grants.contract.test.ts.
revoke execute on function public.increment_rate_limit(timestamptz, text) from public, anon, authenticated;
revoke execute on function public.cleanup_expired_rate_limits() from public, anon, authenticated;
revoke execute on function public.exp_reserve_order_inventory(uuid) from public, anon, authenticated;
revoke execute on function public.exp_release_order_inventory(uuid, text) from public, anon, authenticated;
revoke execute on function public.exp_increment_promo_code_usage(uuid) from public, anon, authenticated;
revoke execute on function public.exp_increment_bundle_deal_usage(uuid) from public, anon, authenticated;
-- Legacy MFA cleanup (migration 061): the MFA stack and its table were removed in
-- §10.8/§10.12, so this function is dead — and it is already absent from the live
-- project, where a bare `revoke` fails with 42883 and aborts the whole migration.
-- Guard it with to_regprocedure (the statement stays literal so
-- src/lib/security/rpc-grants.contract.test.ts can still grep it).
do $$
begin
  if to_regprocedure('public.cleanup_expired_mfa_codes()') is not null then
    revoke execute on function public.cleanup_expired_mfa_codes() from public, anon, authenticated;
    grant execute on function public.cleanup_expired_mfa_codes() to service_role;
  end if;
end $$;

grant execute on function public.increment_rate_limit(timestamptz, text) to service_role;
grant execute on function public.cleanup_expired_rate_limits() to service_role;
grant execute on function public.exp_reserve_order_inventory(uuid) to service_role;
grant execute on function public.exp_release_order_inventory(uuid, text) to service_role;
grant execute on function public.exp_increment_promo_code_usage(uuid) to service_role;
grant execute on function public.exp_increment_bundle_deal_usage(uuid) to service_role;

-- 2. Future functions in `public` default to no public EXECUTE.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- 3. Drop the RLS-bypassing view (it has no `security_invoker`, so it ran as the
--    owner and returned every paid, undelivered order line to any authenticated
--    user).
do $$
begin
  if to_regclass('public.exp_commission_queue') is not null then
    revoke all on public.exp_commission_queue from anon, authenticated;
  end if;
end $$;
drop view if exists public.exp_commission_queue;

-- 4. Re-clamp the rate-limit RPC so a caller cannot pin a far-future expiry and
--    bloat the table / permanently block cleanup (the DoS in #3). The body is
--    otherwise the 064 version, unchanged.
create or replace function public.increment_rate_limit(
  p_expires_at timestamptz,
  p_key        text
) returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  p_expires_at := least(p_expires_at, now() + interval '1 day');

  insert into public.exp_rate_limit_windows (key, window_start, count, expires_at)
  values (p_key, extract(epoch from now())::bigint, 1, p_expires_at)
  on conflict (key)
  do update set
    count = case
      when public.exp_rate_limit_windows.expires_at < now() then 1
      else public.exp_rate_limit_windows.count + 1
    end,
    window_start = case
      when public.exp_rate_limit_windows.expires_at < now() then extract(epoch from now())::bigint
      else public.exp_rate_limit_windows.window_start
    end,
    expires_at = case
      when public.exp_rate_limit_windows.expires_at < now() then p_expires_at
      else public.exp_rate_limit_windows.expires_at
    end
  returning count into v_count;

  return v_count;
end;
$$;

-- Re-assert the grant in case the function did not previously exist (a fresh
-- function would otherwise inherit the default privileges above, which is fine,
-- but this makes the intent explicit and idempotent).
revoke execute on function public.increment_rate_limit(timestamptz, text) from public, anon, authenticated;
grant execute on function public.increment_rate_limit(timestamptz, text) to service_role;
