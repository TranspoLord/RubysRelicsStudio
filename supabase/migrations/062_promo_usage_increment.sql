-- -----------------------------------------------------------------------------
-- Migration 062: Promo / bundle-deal usage accounting
--
-- Adds atomic, service-role-only RPCs to increment promotion usage counters when
-- a code/deal is redeemed at checkout. Previously usage_count was checked against
-- usage_limit but never incremented, so usage limits were effectively unlimited.
-- -----------------------------------------------------------------------------

create or replace function exp_increment_promo_code_usage(p_code_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.exp_promo_codes
  set usage_count = usage_count + 1
  where id = p_code_id;
end;
$$;

create or replace function exp_increment_bundle_deal_usage(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.exp_bundle_deals
  set usage_count = usage_count + 1
  where id = p_deal_id;
end;
$$;
