-- -----------------------------------------------------------------------------
-- Migration 070: atomic promo / bundle-deal redemptions (OCT #19)
--
-- `exp_increment_promo_code_usage` incremented unconditionally, after the Square
-- link existed and before payment. So concurrent checkouts overshot
-- `usage_limit`, and an abandoned checkout or a retry consumed a limited code.
--
-- Four RPCs replace it:
--   exp_try_redeem_promo_code / exp_try_redeem_bundle_deal
--     — ONE conditional UPDATE, returning true only when this caller actually
--       consumed a unit, so N concurrent claims at limit=1 give one winner.
--   exp_release_promo_code / exp_release_bundle_deal
--     — hand a unit back (floor 0) when a claim is unwound, or when an unpaid
--       order expires (#38).
--
-- Also records which promotion an order consumed, so that sweeper can release it.
--
-- Idempotent: safe to re-run. Apply via the Supabase SQL editor or
-- `npx supabase db query --linked` — NOT `db push` (OCT-13).
-- -----------------------------------------------------------------------------

-- ── 1. Claim / release: promo codes ──────────────────────────────────────────
create or replace function public.exp_try_redeem_promo_code(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.exp_promo_codes
  set usage_count = usage_count + 1
  where id = p_id
    and is_active
    and (usage_limit is null or usage_count < usage_limit)
    and (valid_from is null or valid_from <= now())
    and (valid_to is null or valid_to >= now());

  -- plpgsql sets FOUND from the UPDATE: true only if a row was actually taken.
  return found;
end;
$$;

create or replace function public.exp_release_promo_code(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.exp_promo_codes
  set usage_count = greatest(0, usage_count - 1)
  where id = p_id;
end;
$$;

-- ── 2. Claim / release: bundle deals ─────────────────────────────────────────
create or replace function public.exp_try_redeem_bundle_deal(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.exp_bundle_deals
  set usage_count = usage_count + 1
  where id = p_id
    and is_active
    and (usage_limit is null or usage_count < usage_limit)
    and (valid_from is null or valid_from <= now())
    and (valid_to is null or valid_to >= now());

  return found;
end;
$$;

create or replace function public.exp_release_bundle_deal(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.exp_bundle_deals
  set usage_count = greatest(0, usage_count - 1)
  where id = p_id;
end;
$$;

-- ── 3. Record which promotion an order consumed ──────────────────────────────
alter table public.exp_orders
  add column if not exists promo_code_id uuid,
  add column if not exists bundle_deal_ids uuid[] not null default '{}';

comment on column public.exp_orders.promo_code_id is
  'OCT #19: the promo code this order claimed, so the expiry sweeper (#38) can release it.';
comment on column public.exp_orders.bundle_deal_ids is
  'OCT #19: the bundle deals this order claimed, so the expiry sweeper (#38) can release them.';

-- ── 4. Service-role only (#3) ────────────────────────────────────────────────
revoke execute on function public.exp_try_redeem_promo_code(uuid) from public, anon, authenticated;
revoke execute on function public.exp_release_promo_code(uuid) from public, anon, authenticated;
revoke execute on function public.exp_try_redeem_bundle_deal(uuid) from public, anon, authenticated;
revoke execute on function public.exp_release_bundle_deal(uuid) from public, anon, authenticated;

grant execute on function public.exp_try_redeem_promo_code(uuid) to service_role;
grant execute on function public.exp_release_promo_code(uuid) to service_role;
grant execute on function public.exp_try_redeem_bundle_deal(uuid) to service_role;
grant execute on function public.exp_release_bundle_deal(uuid) to service_role;
