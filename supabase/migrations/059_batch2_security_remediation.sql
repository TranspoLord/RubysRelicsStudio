-- -----------------------------------------------------------------------------
-- Migration 059: Batch 2 security remediation (database / storage / schema)
--
-- Applies the remaining security fixes from the Batch 2 audit. All statements are
-- idempotent so the migration can be re-run safely.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 1. M-1: Add physical weight columns for server-side shipping derivation
-- -----------------------------------------------------------------------------
alter table if exists exp_products
  add column if not exists weight_lb numeric(6,2) not null default 1
  check (weight_lb >= 0.01 and weight_lb <= 150);

alter table if exists exp_product_variants
  add column if not exists weight_lb numeric(6,2)
  check (weight_lb is null or (weight_lb >= 0.01 and weight_lb <= 150));

-- -----------------------------------------------------------------------------
-- 2. DB-2: Remove public-read policies from promo / bundle tables
-- -----------------------------------------------------------------------------
-- These tables must be service-role only. Dropping the policies leaves RLS
-- enabled but with no anonymous/authenticated access path.
drop policy if exists exp_promo_codes_public_read on exp_promo_codes;
drop policy if exists exp_bundle_deals_public_read on exp_bundle_deals;

-- -----------------------------------------------------------------------------
-- 3. DB-1: Ensure design-persistence objects from migration 057 exist
-- -----------------------------------------------------------------------------
alter table if exists exp_artwork_uploads
  add column if not exists file_size_bytes bigint,
  add column if not exists content_type text;

create table if not exists exp_product_designs (
  id              uuid primary key default gen_random_uuid(),
  product_id      text not null,
  template_id     text not null,
  design_document jsonb not null,
  document_hash   text not null,
  source          text not null check (source in ('shop', 'custom_order')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_exp_product_designs_product
  on exp_product_designs(product_id, created_at desc);

create index if not exists idx_exp_product_designs_hash
  on exp_product_designs(document_hash);

create table if not exists exp_product_design_assets (
  id                uuid primary key default gen_random_uuid(),
  design_id         uuid not null references exp_product_designs(id) on delete cascade,
  asset_path        text not null,
  upload_token_hash text not null,
  expires_at        timestamptz,
  created_at        timestamptz not null default now(),
  unique(design_id, asset_path)
);

create index if not exists idx_exp_product_design_assets_design
  on exp_product_design_assets(design_id);

create table if not exists exp_product_design_exports (
  id               uuid primary key default gen_random_uuid(),
  design_id        uuid not null references exp_product_designs(id) on delete cascade,
  document_hash    text not null,
  format           text not null check (format in ('png', 'pdf')),
  artifact_path    text,
  artifact_sha256  text,
  dpi              integer not null check (dpi >= 72 and dpi <= 1200),
  render_ms        integer,
  status           text not null check (status in ('pending', 'succeeded', 'failed')),
  error_code       text,
  error_message    text,
  idempotency_key  text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_exp_product_design_exports_design
  on exp_product_design_exports(design_id, created_at desc);

create index if not exists idx_exp_product_design_exports_lookup
  on exp_product_design_exports(document_hash, format, status);

alter table if exists exp_order_items
  add column if not exists design_id uuid references exp_product_designs(id) on delete set null,
  add column if not exists design_snapshot jsonb;

alter table if exists exp_custom_requests
  add column if not exists design_id uuid references exp_product_designs(id) on delete set null,
  add column if not exists design_document jsonb;

alter table exp_product_designs enable row level security;
alter table exp_product_design_assets enable row level security;
alter table exp_product_design_exports enable row level security;

revoke all on table exp_product_designs from anon, authenticated;
revoke all on table exp_product_design_assets from anon, authenticated;
revoke all on table exp_product_design_exports from anon, authenticated;

grant all on table exp_product_designs to service_role;
grant all on table exp_product_design_assets to service_role;
grant all on table exp_product_design_exports to service_role;

-- Ensure the updated_at helper exists so this migration is self-contained on
-- fresh environments (e.g. CI test databases or partial replays).
create or replace function exp_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_exp_product_designs_updated_at on exp_product_designs;
create trigger trg_exp_product_designs_updated_at
before update on exp_product_designs
for each row execute function exp_set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. DB-1: Ensure design-artifacts storage bucket from migration 058 exists
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'design-artifacts',
  'design-artifacts',
  false,
  52428800,
  array['image/png', 'application/pdf']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Private bucket: no anonymous/authenticated access. Service role has full
-- access via the storage admin API.
drop policy if exists "design-artifacts service role all" on storage.objects;
create policy "design-artifacts service role all"
  on storage.objects
  for all
  to service_role
  using (bucket_id = 'design-artifacts')
  with check (bucket_id = 'design-artifacts');

drop policy if exists "design-artifacts public read" on storage.objects;
drop policy if exists "design-artifacts public upload" on storage.objects;

-- -----------------------------------------------------------------------------
-- 5. DB-1: Remove legacy customer-account PII tables (must not exist)
-- -----------------------------------------------------------------------------
drop table if exists exp_wishlists cascade;
drop table if exists exp_customer_addresses cascade;
drop table if exists exp_password_reset_tokens cascade;
drop table if exists exp_customer_sessions cascade;
drop table if exists exp_recently_viewed cascade;
drop table if exists exp_customers cascade;

-- Drop any remaining customer_id columns that were left behind by migration 042.
alter table if exists exp_orders drop column if exists customer_id;
alter table if exists exp_custom_requests drop column if exists customer_id;
alter table if exists exp_newsletter_subscribers drop column if exists customer_id;
alter table if exists exp_back_in_stock_alerts drop column if exists customer_id;
alter table if exists exp_capacity_reopen_alerts drop column if exists customer_id;

-- Drop any remaining customer_id indexes.
drop index if exists idx_orders_customer_id;
drop index if exists idx_custom_requests_customer_id;
drop index if exists idx_newsletter_subscribers_customer_id;
drop index if exists idx_back_in_stock_alerts_customer_id;
drop index if exists idx_capacity_reopen_alerts_customer_id;


-- -----------------------------------------------------------------------------
-- 6. DB-3: Reconcile rate-limit table / function (idempotent)
-- -----------------------------------------------------------------------------
-- The live schema must use PRIMARY KEY (key) to match the PostgREST lookup.
create table if not exists exp_rate_limit_windows (
  key          text        not null,
  window_start bigint      not null,
  count        int         not null default 1,
  expires_at   timestamptz not null,
  primary key (key)
);

alter table exp_rate_limit_windows enable row level security;
revoke all on table exp_rate_limit_windows from anon, authenticated;
grant all on table exp_rate_limit_windows to service_role;

-- Drop any old 3-parameter or non-alphabetical overloads.
drop function if exists increment_rate_limit(text, bigint, timestamptz);
drop function if exists increment_rate_limit(text, timestamptz);

-- Create the alphabetical-order RPC used by src/lib/rate-limit.ts.
create or replace function increment_rate_limit(
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
  insert into exp_rate_limit_windows (key, window_start, count, expires_at)
  values (p_key, extract(epoch from now())::bigint, 1, p_expires_at)
  on conflict (key)
  do update set
    count = case
      when exp_rate_limit_windows.expires_at < now() then 1
      else exp_rate_limit_windows.count + 1
    end,
    window_start = case
      when exp_rate_limit_windows.expires_at < now() then extract(epoch from now())::bigint
      else exp_rate_limit_windows.window_start
    end,
    expires_at = case
      when exp_rate_limit_windows.expires_at < now() then p_expires_at
      else exp_rate_limit_windows.expires_at
    end
  returning count into v_count;

  return v_count;
end;
$$;

create or replace function cleanup_expired_rate_limits()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from exp_rate_limit_windows where expires_at < now();
end;
$$;

create index if not exists idx_exp_rate_limit_windows_expires
  on exp_rate_limit_windows (expires_at);

-- -----------------------------------------------------------------------------
-- 7. DB-6: Restore / verify exp_square_webhook_events and exp_admin_sessions
-- -----------------------------------------------------------------------------
create table if not exists exp_square_webhook_events (
  id              text primary key,
  event_type      text not null,
  received_at     timestamptz not null default now(),
  processed       boolean not null default true
);

alter table exp_square_webhook_events enable row level security;
revoke all on table exp_square_webhook_events from anon, authenticated;
grant all on table exp_square_webhook_events to service_role;

create index if not exists idx_exp_square_webhook_events_received
  on exp_square_webhook_events (received_at);

create table if not exists exp_admin_sessions (
  id                uuid primary key default gen_random_uuid(),
  token_hash        text not null unique,
  jti               text not null unique,
  ip_address        text,
  user_agent        text,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  revoked_at        timestamptz,
  last_activity_at  timestamptz
);

alter table exp_admin_sessions enable row level security;
revoke all on table exp_admin_sessions from anon, authenticated;
grant all on table exp_admin_sessions to service_role;

create index if not exists idx_exp_admin_sessions_token_hash
  on exp_admin_sessions (token_hash);

create index if not exists idx_exp_admin_sessions_expires
  on exp_admin_sessions (expires_at);

create table if not exists exp_artwork_uploads (
  id              uuid primary key default gen_random_uuid(),
  upload_token    text not null unique,
  file_path       text not null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '24 hours')
);

alter table exp_artwork_uploads enable row level security;
revoke all on table exp_artwork_uploads from anon, authenticated;
grant all on table exp_artwork_uploads to service_role;

create index if not exists idx_exp_artwork_uploads_token
  on exp_artwork_uploads (upload_token);

create index if not exists idx_exp_artwork_uploads_expires
  on exp_artwork_uploads (expires_at);

-- -----------------------------------------------------------------------------
-- 8. Cleanup: drop any dead RLS policies referencing removed customer_id
-- -----------------------------------------------------------------------------
drop policy if exists "users_select_own_orders" on exp_orders;
drop policy if exists "users_update_own_orders" on exp_orders;
drop policy if exists "users_select_own_order_items" on exp_order_items;
drop policy if exists "users_update_own_order_items" on exp_order_items;

