-- -----------------------------------------------------------------------------
-- Migration 064: Reconcile exp_rate_limit_windows to PRIMARY KEY (key)
--
-- Migrations 044/048/059 create this table with `CREATE TABLE IF NOT EXISTS`,
-- which is a no-op when the live table already exists with the composite
-- primary key (key, window_start) from migration 049's reconstruction. The
-- increment_rate_limit function uses ON CONFLICT (key), which requires a unique
-- constraint on the "key" column alone.
--
-- This migration drops and recreates the (transient) table with PRIMARY KEY
-- (key), then re-asserts the rate-limit functions. Safe to re-run: the table
-- only holds ephemeral rate-limit windows.
-- -----------------------------------------------------------------------------

drop table if exists public.exp_rate_limit_windows cascade;

create table public.exp_rate_limit_windows (
  key          text        not null,
  window_start bigint      not null,
  count        int         not null default 1,
  expires_at   timestamptz not null,
  primary key (key)
);

alter table public.exp_rate_limit_windows enable row level security;
revoke all on table public.exp_rate_limit_windows from anon, authenticated;
grant all on table public.exp_rate_limit_windows to service_role;

create index if not exists idx_exp_rate_limit_windows_expires
  on public.exp_rate_limit_windows (expires_at);

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

create or replace function public.cleanup_expired_rate_limits()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.exp_rate_limit_windows where expires_at < now();
end;
$$;
