-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 002: Product catalog tables
-- Tables: exp_products, exp_product_variants, exp_product_media,
--         exp_product_options, exp_product_option_values
-- Run after migration 001.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Products ──────────────────────────────────────────────────────────────────
create table if not exists exp_products (
  id                      uuid        primary key default gen_random_uuid(),
  title                   text        not null,
  slug                    text        not null unique,
  short_description       text        not null default '',
  description             text        not null default '',
  category_key            text        not null references exp_taxonomy(key),
  base_price              numeric(10,2) not null default 0,
  is_ready_made           boolean     not null default false,
  is_customizable         boolean     not null default true,
  is_active               boolean     not null default true,
  is_archived             boolean     not null default false,
  sort_order              integer     not null default 0,
  -- production + trust messaging
  production_estimate_band text       not null default '3–5 business days',
  how_it_works_anchor     text,           -- e.g. '#engraving' links to /how-it-works
  -- SEO / social
  seo_title               text,
  seo_description         text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_exp_products_category  on exp_products(category_key);
create index if not exists idx_exp_products_active    on exp_products(is_active, is_archived);
create index if not exists idx_exp_products_slug      on exp_products(slug);

-- ── Product variants (e.g. sizes: 12 oz, 20 oz, 30 oz) ───────────────────────
create table if not exists exp_product_variants (
  id                uuid        primary key default gen_random_uuid(),
  product_id        uuid        not null references exp_products(id) on delete cascade,
  label             text        not null,
  sku               text,
  price_delta       numeric(10,2) not null default 0,
  capacity_weight   numeric(6,2),               -- for machine scheduling (hours)
  is_enabled        boolean     not null default true,
  sort_order        integer     not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_exp_product_variants_product on exp_product_variants(product_id);

-- ── Product media ─────────────────────────────────────────────────────────────
create table if not exists exp_product_media (
  id                uuid        primary key default gen_random_uuid(),
  product_id        uuid        not null references exp_products(id) on delete cascade,
  url               text        not null default '',
  alt               text        not null default '',
  emoji             text,                        -- placeholder until image uploaded
  gradient          text,                        -- placeholder gradient background
  is_featured       boolean     not null default false,
  sort_order        integer     not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists idx_exp_product_media_product on exp_product_media(product_id);

-- ── Product options (text, file upload, select choices, checkboxes) ───────────
create table if not exists exp_product_options (
  id                uuid        primary key default gen_random_uuid(),
  product_id        uuid        not null references exp_products(id) on delete cascade,
  option_key        text        not null,
  label             text        not null,
  option_type       text        not null check (
                      option_type in ('select','text','textarea','file','checkbox','number')
                    ),
  placeholder       text,
  help_text         text,
  is_required       boolean     not null default false,
  sort_order        integer     not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists idx_exp_product_options_product on exp_product_options(product_id);

-- ── Product option values (choices for 'select' type options) ─────────────────
create table if not exists exp_product_option_values (
  id                uuid        primary key default gen_random_uuid(),
  option_id         uuid        not null references exp_product_options(id) on delete cascade,
  label             text        not null,
  value             text        not null,
  price_delta       numeric(10,2) not null default 0,
  is_enabled        boolean     not null default true,
  sort_order        integer     not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists idx_exp_product_option_values_option on exp_product_option_values(option_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row-Level Security
-- ─────────────────────────────────────────────────────────────────────────────

alter table exp_products              enable row level security;
alter table exp_product_variants      enable row level security;
alter table exp_product_media         enable row level security;
alter table exp_product_options       enable row level security;
alter table exp_product_option_values enable row level security;

-- Public (anon + authenticated) can read active, non-archived products
create policy "public_read_active_products"
  on exp_products for select
  using (is_active = true and is_archived = false);

-- Public can read variants for any product (product RLS gates the parent)
create policy "public_read_product_variants"
  on exp_product_variants for select
  using (
    exists (
      select 1 from exp_products p
      where p.id = product_id
        and p.is_active = true
        and p.is_archived = false
    )
  );

-- Public can read product media for active products
create policy "public_read_product_media"
  on exp_product_media for select
  using (
    exists (
      select 1 from exp_products p
      where p.id = product_id
        and p.is_active = true
        and p.is_archived = false
    )
  );

-- Public can read product options for active products
create policy "public_read_product_options"
  on exp_product_options for select
  using (
    exists (
      select 1 from exp_products p
      where p.id = product_id
        and p.is_active = true
        and p.is_archived = false
    )
  );

-- Public can read option values for accessible options
create policy "public_read_product_option_values"
  on exp_product_option_values for select
  using (
    exists (
      select 1
      from exp_product_options o
      join exp_products p on p.id = o.product_id
      where o.id = option_id
        and p.is_active = true
        and p.is_archived = false
    )
  );

-- Service role bypasses all RLS (no additional policy needed — handled by client)
