-- -----------------------------------------------------------------------------
-- Migration 057: Product design persistence, exports, and order linkage
-- Purpose:
-- 1) Persist validated design documents and asset references
-- 2) Track export artifacts with deterministic error/status metadata
-- 3) Link order items and custom requests to immutable design snapshots
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

create trigger trg_exp_product_designs_updated_at
before update on exp_product_designs
for each row execute function exp_set_updated_at();
