-- ─────────────────────────────────────────────────────────────────────────────
-- schema_repair.sql: Standalone DDL script to repair/create schema objects
-- Run this directly in Supabase SQL Editor if migration 049 fails.
-- ─────────────────────────────────────────────────────────────────────────────

-- 0. Trigger function
create or replace function exp_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1. exp_taxonomy
create table if not exists exp_taxonomy (
  key                 text        primary key,
  display_name        text        not null,
  slug                text        not null unique,
  parent_key          text        references exp_taxonomy(key),
  type                text        not null check (type in (
                        'category','customizability_mode',
                        'material','product_type','tag','process_type')),
  visible             boolean     not null default true,
  sort_order          integer     not null default 0,
  how_it_works_anchor text,
  alias_keys          text,
  emoji               text,
  gradient            text,
  glow_color          text,
  tagline             text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table exp_taxonomy drop constraint if exists exp_taxonomy_type_check;
alter table exp_taxonomy add constraint exp_taxonomy_type_check
  check (type in (
    'category', 'customizability_mode', 'material',
    'product_type', 'tag', 'process_type'
  ));

create index if not exists idx_exp_taxonomy_type    on exp_taxonomy(type);
create index if not exists idx_exp_taxonomy_visible on exp_taxonomy(visible);

drop trigger if exists trg_taxonomy_updated_at on exp_taxonomy;
create trigger trg_taxonomy_updated_at
  before update on exp_taxonomy
  for each row execute function exp_set_updated_at();

alter table exp_taxonomy enable row level security;
drop policy if exists "public read taxonomy" on exp_taxonomy;
create policy "public read taxonomy"
  on exp_taxonomy for select to anon, authenticated
  using (visible = true);

-- 2. exp_homepage_sections
create table if not exists exp_homepage_sections (
  id           uuid        primary key default gen_random_uuid(),
  section_key  text        not null unique,
  is_visible   boolean     not null default true,
  sort_order   integer     not null default 0,
  content      jsonb       not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists trg_homepage_sections_updated_at on exp_homepage_sections;
create trigger trg_homepage_sections_updated_at
  before update on exp_homepage_sections
  for each row execute function exp_set_updated_at();

alter table exp_homepage_sections enable row level security;
drop policy if exists "public read homepage sections" on exp_homepage_sections;
create policy "public read homepage sections"
  on exp_homepage_sections for select to anon, authenticated
  using (true);

-- 3. exp_featured_collections
create table if not exists exp_featured_collections (
  id           uuid        primary key default gen_random_uuid(),
  title        text        not null,
  tagline      text        not null,
  description  text        not null default '',
  slug         text        not null unique,
  image_url    text,
  emoji        text,
  tag_label    text,
  gradient     text        not null default '',
  border_color text        not null default '',
  is_visible   boolean     not null default true,
  sort_order   integer     not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_exp_featured_visible on exp_featured_collections(is_visible);

drop trigger if exists trg_featured_collections_updated_at on exp_featured_collections;
create trigger trg_featured_collections_updated_at
  before update on exp_featured_collections
  for each row execute function exp_set_updated_at();

alter table exp_featured_collections enable row level security;
drop policy if exists "public read featured collections" on exp_featured_collections;
create policy "public read featured collections"
  on exp_featured_collections for select to anon, authenticated
  using (is_visible = true);

-- 4. exp_gallery
create table if not exists exp_gallery (
  id                  uuid        primary key default gen_random_uuid(),
  title               text        not null,
  caption             text,
  category_key        text        references exp_taxonomy(key),
  media_url           text        not null default '',
  media_alt           text        not null default '',
  emoji               text,
  gradient            text        not null default '',
  material_used       text,
  turnaround_band     text,
  display_permission  boolean     not null default false,
  moderation_status   text        not null default 'pending_review'
                        check (moderation_status in (
                          'pending_review','approved','scheduled','published','archived')),
  publish_date        date,
  tags                text[]      not null default '{}',
  visible             boolean     not null default true,
  sort_order          integer     not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_exp_gallery_status  on exp_gallery(moderation_status);
create index if not exists idx_exp_gallery_visible on exp_gallery(visible);

drop trigger if exists trg_gallery_updated_at on exp_gallery;
create trigger trg_gallery_updated_at
  before update on exp_gallery
  for each row execute function exp_set_updated_at();

alter table exp_gallery enable row level security;
drop policy if exists "public read published gallery" on exp_gallery;
create policy "public read published gallery"
  on exp_gallery for select to anon, authenticated
  using (moderation_status = 'published' and visible = true);

-- 5. exp_testimonials
create table if not exists exp_testimonials (
  id            uuid        primary key default gen_random_uuid(),
  quote         text        not null,
  author        text        not null,
  location      text,
  product_label text,
  stars         integer     not null default 5 check (stars between 1 and 5),
  emoji         text,
  is_visible    boolean     not null default false,
  sort_order    integer     not null default 0,
  source        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_exp_testimonials_visible on exp_testimonials(is_visible);

drop trigger if exists trg_testimonials_updated_at on exp_testimonials;
create trigger trg_testimonials_updated_at
  before update on exp_testimonials
  for each row execute function exp_set_updated_at();

alter table exp_testimonials enable row level security;
drop policy if exists "public read visible testimonials" on exp_testimonials;
create policy "public read visible testimonials"
  on exp_testimonials for select to anon, authenticated
  using (is_visible = true);

-- 6. exp_announcement
create table if not exists exp_announcement (
  id           uuid        primary key default gen_random_uuid(),
  message      text        not null,
  cta_label    text,
  cta_href     text,
  is_active    boolean     not null default false,
  dismiss_key  text        not null default 'rr_announcement_v1',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists trg_announcement_updated_at on exp_announcement;
create trigger trg_announcement_updated_at
  before update on exp_announcement
  for each row execute function exp_set_updated_at();

alter table exp_announcement enable row level security;
drop policy if exists "public read active announcement" on exp_announcement;
create policy "public read active announcement"
  on exp_announcement for select to anon, authenticated
  using (is_active = true);

-- 7. exp_faq
create table if not exists exp_faq (
  id           uuid        primary key default gen_random_uuid(),
  question     text        not null,
  answer       text        not null,
  link_label   text,
  link_href    text,
  is_visible   boolean     not null default true,
  sort_order   integer     not null default 0,
  section      text        not null default 'homepage',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_exp_faq_section on exp_faq(section);

drop trigger if exists trg_faq_updated_at on exp_faq;
create trigger trg_faq_updated_at
  before update on exp_faq
  for each row execute function exp_set_updated_at();

alter table exp_faq enable row level security;
drop policy if exists "public read visible faq" on exp_faq;
create policy "public read visible faq"
  on exp_faq for select to anon, authenticated
  using (is_visible = true);

-- 8. exp_products
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
  production_estimate_band text       not null default '3–5 business days',
  how_it_works_anchor     text,
  seo_title               text,
  seo_description         text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  has_designer            boolean     not null default false,
  designer_mockup_url     text,
  nfc_price_delta         numeric(12,4) not null default 1 check (nfc_price_delta >= 0),
  square_variant_id       text,
  is_square_enabled       boolean     not null default false
);

alter table exp_products add column if not exists square_variant_id       text;
alter table exp_products add column if not exists is_square_enabled       boolean not null default false;
alter table exp_products add column if not exists has_designer            boolean not null default false;
alter table exp_products add column if not exists designer_mockup_url     text;
alter table exp_products add column if not exists nfc_price_delta         numeric(12,4) not null default 1 check (nfc_price_delta >= 0);

create index if not exists idx_exp_products_category       on exp_products(category_key);
create index if not exists idx_exp_products_active         on exp_products(is_active, is_archived);
create index if not exists idx_exp_products_slug           on exp_products(slug);
create index if not exists idx_exp_products_square_enabled
  on exp_products(is_square_enabled)
  where is_square_enabled = true;

drop trigger if exists trg_products_updated_at on exp_products;
create trigger trg_products_updated_at
  before update on exp_products
  for each row execute function exp_set_updated_at();

alter table exp_products enable row level security;
drop policy if exists "public_read_active_products" on exp_products;
create policy "public_read_active_products"
  on exp_products for select
  using (is_active = true and is_archived = false);

-- 9. exp_product_variants
create table if not exists exp_product_variants (
  id                uuid        primary key default gen_random_uuid(),
  product_id        uuid        not null references exp_products(id) on delete cascade,
  label             text        not null,
  sku               text,
  price_delta       numeric(10,2) not null default 0,
  capacity_weight   numeric(6,2),
  is_enabled        boolean     not null default true,
  sort_order        integer     not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_exp_product_variants_product on exp_product_variants(product_id);

drop trigger if exists trg_product_variants_updated_at on exp_product_variants;
create trigger trg_product_variants_updated_at
  before update on exp_product_variants
  for each row execute function exp_set_updated_at();

alter table exp_product_variants enable row level security;
drop policy if exists "public_read_product_variants" on exp_product_variants;
create policy "public_read_product_variants"
  on exp_product_variants for select
  using (
    exists (
      select 1 from exp_products p
      where p.id = product_id and p.is_active = true and p.is_archived = false
    )
  );

-- 10. exp_product_media
create table if not exists exp_product_media (
  id                uuid        primary key default gen_random_uuid(),
  product_id        uuid        not null references exp_products(id) on delete cascade,
  url               text        not null default '',
  alt               text        not null default '',
  emoji             text,
  gradient          text,
  is_featured       boolean     not null default false,
  sort_order        integer     not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists idx_exp_product_media_product on exp_product_media(product_id);

alter table exp_product_media enable row level security;
drop policy if exists "public_read_product_media" on exp_product_media;
create policy "public_read_product_media"
  on exp_product_media for select
  using (
    exists (
      select 1 from exp_products p
      where p.id = product_id and p.is_active = true and p.is_archived = false
    )
  );

-- 11. exp_product_options
create table if not exists exp_product_options (
  id                uuid        primary key default gen_random_uuid(),
  product_id        uuid        not null references exp_products(id) on delete cascade,
  option_key        text        not null,
  label             text        not null,
  option_type       text        not null check (option_type in (
                         'select','text','textarea','file','checkbox','number')),
  placeholder       text,
  help_text         text,
  is_required       boolean     not null default false,
  sort_order        integer     not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  min_width         numeric,
  max_width         numeric,
  min_height        numeric,
  max_height        numeric,
  allowed_colors    text[]
);

alter table exp_product_options add column if not exists min_width      numeric;
alter table exp_product_options add column if not exists max_width      numeric;
alter table exp_product_options add column if not exists min_height     numeric;
alter table exp_product_options add column if not exists max_height    numeric;
alter table exp_product_options add column if not exists allowed_colors text[];

create index if not exists idx_exp_product_options_product
  on exp_product_options(product_id);

drop trigger if exists trg_product_options_updated_at on exp_product_options;
create trigger trg_product_options_updated_at
  before update on exp_product_options
  for each row execute function exp_set_updated_at();

alter table exp_product_options enable row level security;
drop policy if exists "public_read_product_options" on exp_product_options;
create policy "public_read_product_options"
  on exp_product_options for select
  using (
    exists (
      select 1 from exp_products p
      where p.id = product_id and p.is_active = true and p.is_archived = false
    )
  );

-- 12. exp_product_option_values
create table if not exists exp_product_option_values (
  id                uuid        primary key default gen_random_uuid(),
  option_id         uuid        not null references exp_product_options(id) on delete cascade,
  label             text        not null,
  value             text        not null,
  price_delta       numeric(10,2) not null default 0,
  is_enabled        boolean     not null default true,
  sort_order        integer     not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_exp_product_option_values_option
  on exp_product_option_values(option_id);

drop trigger if exists trg_product_option_values_updated_at on exp_product_option_values;
create trigger trg_product_option_values_updated_at
  before update on exp_product_option_values
  for each row execute function exp_set_updated_at();

alter table exp_product_option_values enable row level security;
drop policy if exists "public_read_product_option_values" on exp_product_option_values;
create policy "public_read_product_option_values"
  on exp_product_option_values for select
  using (
    exists (
      select 1 from exp_product_options po
      join exp_products p on p.id = po.product_id
      where po.id = option_id and p.is_active = true and p.is_archived = false
    )
  );

-- 13. exp_product_bulk_discounts
create table if not exists exp_product_bulk_discounts (
  id                uuid        primary key default gen_random_uuid(),
  product_id        uuid        not null references exp_products(id) on delete cascade,
  min_qty           integer     not null check (min_qty > 0),
  max_qty           integer     check (max_qty >= min_qty or max_qty is null),
  discount_type     text        not null check (discount_type in (
                         'percent','fixed_amount','unit_price')),
  discount_value    numeric(10,2) not null check (discount_value >= 0),
  label             text,
  is_enabled        boolean     not null default true,
  sort_order        integer     not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_exp_product_bulk_discounts_product
  on exp_product_bulk_discounts(product_id);
create index if not exists idx_exp_product_bulk_discounts_enabled
  on exp_product_bulk_discounts(is_enabled, sort_order);

drop trigger if exists trg_product_bulk_discounts_updated_at on exp_product_bulk_discounts;
create trigger trg_product_bulk_discounts_updated_at
  before update on exp_product_bulk_discounts
  for each row execute function exp_set_updated_at();

alter table exp_product_bulk_discounts enable row level security;
drop policy if exists "public_read_product_bulk_discounts" on exp_product_bulk_discounts;
create policy "public_read_product_bulk_discounts"
  on exp_product_bulk_discounts for select
  using (
    is_enabled = true
    and exists (
      select 1 from exp_products p
      where p.id = product_id and p.is_active = true and p.is_archived = false
    )
  );

-- 14. exp_product_process_types
create table if not exists exp_product_process_types (
  product_id        uuid        not null references exp_products(id) on delete cascade,
  process_type_key  text        not null references exp_taxonomy(key),
  primary key (product_id, process_type_key)
);

create index if not exists idx_exp_product_process_types_product
  on exp_product_process_types(product_id);
create index if not exists idx_exp_product_process_types_key
  on exp_product_process_types(process_type_key);

alter table exp_product_process_types enable row level security;
drop policy if exists "public read product process types" on exp_product_process_types;
create policy "public read product process types"
  on exp_product_process_types for select to anon, authenticated
  using (true);

-- 15. exp_product_process_pricing
create table if not exists exp_product_process_pricing (
  id                uuid        primary key default gen_random_uuid(),
  product_id        uuid        not null references exp_products(id) on delete cascade,
  process_type_key  text        not null references exp_taxonomy(key),
  price_delta       numeric(10,2) not null default 0,
  is_enabled        boolean     not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (product_id, process_type_key)
);

create index if not exists idx_exp_product_process_pricing_product
  on exp_product_process_pricing(product_id);
create index if not exists idx_exp_product_process_pricing_key
  on exp_product_process_pricing(process_type_key);

drop trigger if exists trg_exp_product_process_pricing_updated_at on exp_product_process_pricing;
create trigger trg_exp_product_process_pricing_updated_at
  before update on exp_product_process_pricing
  for each row execute function exp_set_updated_at();

alter table exp_product_process_pricing enable row level security;
drop policy if exists "public read enabled product process pricing" on exp_product_process_pricing;
create policy "public read enabled product process pricing"
  on exp_product_process_pricing for select to anon, authenticated
  using (is_enabled = true);

-- 16. exp_product_combo_discounts
create table if not exists exp_product_combo_discounts (
  id                uuid        primary key default gen_random_uuid(),
  product_id        uuid        not null references exp_products(id) on delete cascade,
  min_processes     integer     not null default 2,
  discount_type     text        not null check (discount_type in (
                         'percent','fixed_amount','cheapest_free')),
  discount_value    numeric(10,2),
  label             text,
  is_enabled        boolean     not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_exp_product_combo_discounts_product
  on exp_product_combo_discounts(product_id);

drop trigger if exists trg_exp_product_combo_discounts_updated_at on exp_product_combo_discounts;
create trigger trg_exp_product_combo_discounts_updated_at
  before update on exp_product_combo_discounts
  for each row execute function exp_set_updated_at();

alter table exp_product_combo_discounts enable row level security;
drop policy if exists "public read enabled product combo discounts" on exp_product_combo_discounts;
create policy "public read enabled product combo discounts"
  on exp_product_combo_discounts for select to anon, authenticated
  using (is_enabled = true);

-- 17. exp_custom_requests
create table if not exists exp_custom_requests (
  id                            uuid        primary key default gen_random_uuid(),
  status                        text        not null default 'awaiting_quote'
                                check (status in (
                                  'awaiting_quote','quote_sent','paid','expired',
                                  'cancelled','restricted_pending_review',
                                  'restricted_rejected','restricted_approved')),
  customer_name                 text        not null,
  customer_email                text        not null,
  item_type                     text        not null,
  quantity                      integer     not null default 1 check (quantity > 0),
  deadline                      date,
  budget_range                  text,
  description                   text        not null,
  files                         jsonb       not null default '[]'::jsonb,
  design_help_needed            boolean     not null default false,
  ip_rights_confirmed           boolean     not null default false,
  age_confirmed                 boolean     not null default false,
  tos_accepted                  boolean     not null default false,
  branch                        text        not null default 'DEV'
                                check (branch in ('DEV','TEST','PROD')),
  quote_amount                  numeric(10,2),
  stripe_payment_link_id        text,
  stripe_payment_link_url       text,
  admin_notes                   text,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  customer_access_token         text,
  customer_access_expires_at    timestamptz,
  quote_sent_at                 timestamptz,
  quote_expires_at              timestamptz,
  quote_last_resent_at          timestamptz,
  quote_resend_count            integer     not null default 0,
  production_handoff_at         timestamptz,
  recovery_reminder_sent_at     timestamptz
);

create index if not exists idx_exp_custom_requests_status
  on exp_custom_requests(status);
create index if not exists idx_exp_custom_requests_email
  on exp_custom_requests(customer_email);
create index if not exists idx_exp_custom_requests_created
  on exp_custom_requests(created_at desc);
create index if not exists idx_exp_custom_requests_access_token
  on exp_custom_requests(customer_access_token)
  where customer_access_token is not null;
create index if not exists idx_exp_custom_requests_access_expires
  on exp_custom_requests(customer_access_expires_at)
  where customer_access_expires_at is not null;
create index if not exists idx_exp_custom_requests_quote_expires
  on exp_custom_requests(quote_expires_at)
  where quote_expires_at is not null;
create index if not exists idx_exp_custom_requests_handoff
  on exp_custom_requests(production_handoff_at)
  where production_handoff_at is not null;
create index if not exists idx_exp_custom_requests_recovery
  on exp_custom_requests(status, recovery_reminder_sent_at, created_at asc);

alter table exp_custom_requests enable row level security;

-- 18. exp_storefront_settings
create table if not exists exp_storefront_settings (
  setting_key      text        primary key,
  setting_value    jsonb       not null default '{}'::jsonb,
  description      text,
  updated_at       timestamptz not null default now()
);

create index if not exists idx_exp_storefront_settings_updated_at
  on exp_storefront_settings(updated_at desc);

drop trigger if exists trg_storefront_settings_updated_at on exp_storefront_settings;
create trigger trg_storefront_settings_updated_at
  before update on exp_storefront_settings
  for each row execute function exp_set_updated_at();

alter table exp_storefront_settings enable row level security;
drop policy if exists "public_read_storefront_settings" on exp_storefront_settings;
create policy "public_read_storefront_settings"
  on exp_storefront_settings for select to public
  using (setting_key in ('guest_order_tracking', 'contact', 'recommendations'));

-- 19. exp_budget_ranges
create table if not exists exp_budget_ranges (
  id                uuid        primary key default gen_random_uuid(),
  label             text        not null,
  value             text        not null unique,
  min_amount        numeric(10,2),
  max_amount        numeric(10,2),
  is_active         boolean     not null default true,
  sort_order        integer     not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_budget_ranges_active_sort
  on exp_budget_ranges(is_active, sort_order);

alter table exp_budget_ranges enable row level security;

-- 20. exp_promo_codes
create table if not exists exp_promo_codes (
  id                uuid        primary key default gen_random_uuid(),
  code              text        not null,
  description       text        not null default '',
  discount_type     text        not null check (discount_type in (
                         'percent','fixed_amount','free_shipping')),
  discount_value    numeric(12,2) not null default 0,
  is_active         boolean     not null default true,
  usage_limit       integer,
  usage_count       integer     not null default 0,
  valid_from        timestamptz,
  valid_to          timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_exp_promo_codes_code_unique
  on exp_promo_codes (lower(code));
create index if not exists idx_exp_promo_codes_is_active
  on exp_promo_codes(is_active);
create index if not exists idx_exp_promo_codes_valid_window
  on exp_promo_codes(valid_from, valid_to);

drop trigger if exists trg_exp_promo_codes_updated_at on exp_promo_codes;
create trigger trg_exp_promo_codes_updated_at
  before update on exp_promo_codes
  for each row execute function exp_set_updated_at();

alter table exp_promo_codes enable row level security;

-- 21. exp_bundle_deals
create table if not exists exp_bundle_deals (
  id                uuid        primary key default gen_random_uuid(),
  name              text        not null,
  description       text        not null default '',
  trigger_type      text        not null check (trigger_type in ('automatic','code')),
  code              text,
  conditions_json   jsonb       not null default '{}'::jsonb,
  rewards_json      jsonb       not null default '{}'::jsonb,
  is_active         boolean     not null default true,
  is_stackable      boolean     not null default true,
  usage_limit       integer,
  usage_count       integer     not null default 0,
  valid_from        timestamptz,
  valid_to          timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table exp_bundle_deals drop constraint if exists exp_bundle_deals_code_check;
alter table exp_bundle_deals add constraint exp_bundle_deals_code_check
  check ((trigger_type = 'code' and code is not null and length(trim(code)) > 0) or trigger_type = 'automatic');

create index if not exists idx_exp_bundle_deals_code_unique
  on exp_bundle_deals (lower(code))
  where code is not null;
create index if not exists idx_exp_bundle_deals_is_active
  on exp_bundle_deals(is_active);
create index if not exists idx_exp_bundle_deals_trigger_type
  on exp_bundle_deals(trigger_type);
create index if not exists idx_exp_bundle_deals_valid_window
  on exp_bundle_deals(valid_from, valid_to);

drop trigger if exists trg_exp_bundle_deals_updated_at on exp_bundle_deals;
create trigger trg_exp_bundle_deals_updated_at
  before update on exp_bundle_deals
  for each row execute function exp_set_updated_at();

alter table exp_bundle_deals enable row level security;

-- 22. exp_cart_captures
create table if not exists exp_cart_captures (
  id                uuid        primary key default gen_random_uuid(),
  email             text        not null,
  cart_json         jsonb       not null default '[]'::jsonb,
  recovery_sent_at  timestamptz,
  order_id          uuid        references exp_orders(id) on delete set null,
  ip_hash           text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_exp_cart_captures_recovery
  on exp_cart_captures(recovery_sent_at, order_id, created_at asc);
create index if not exists idx_exp_cart_captures_email
  on exp_cart_captures(email, created_at desc);

drop trigger if exists trg_exp_cart_captures_updated_at on exp_cart_captures;
create trigger trg_exp_cart_captures_updated_at
  before update on exp_cart_captures
  for each row execute function exp_set_updated_at();

alter table exp_cart_captures enable row level security;

-- 23. exp_orders
create table if not exists exp_orders (
  id                             uuid        primary key default gen_random_uuid(),
  order_path                     text        not null default 'shop'
                                check (order_path in ('shop','ready_made','custom')),
  payment_mode                   text        not null default 'stripe_checkout'
                                check (payment_mode in ('stripe_checkout','stripe_payment_link')),
  payment_status                 text        not null default 'pending'
                                check (payment_status in ('pending','paid','failed','refunded')),
  status                         text        not null default 'awaiting_payment'
                                check (status in (
                                  'awaiting_payment','paid','in_production',
                                  'ready_to_ship','shipped','delivered','cancelled')),
  stripe_session_id              text        unique,
  production_estimate_band       text        not null default 'To be confirmed',
  subtotal                       numeric(10,2) not null default 0,
  discount_amount                numeric(10,2) not null default 0,
  shipping_cost                  numeric(10,2) not null default 0,
  order_total                    numeric(10,2) not null default 0,
  shipping_method                text        not null default 'standard',
  shipping_address               jsonb       not null default '{}'::jsonb,
  cart_snapshot                  jsonb       not null default '{}'::jsonb,
  branch                         text        not null default 'DEV'
                                check (branch in ('DEV','TEST','PROD')),
  paid_at                        timestamptz,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now(),
  guest_tracking_token           text,
  guest_tracking_expires_at      timestamptz,
  stripe_payment_intent_id       text,
  custom_request_id              uuid        references exp_custom_requests(id),
  stripe_payment_link_id         text,
  inventory_reserved_at          timestamptz,
  inventory_released_at          timestamptz,
  cancelled_at                   timestamptz,
  refunded_at                    timestamptz,
  shipping_carrier               text,
  tracking_number                text,
  cart_recovery_email_sent_at    timestamptz
);

create index if not exists idx_exp_orders_status
  on exp_orders(status, payment_status);
create index if not exists idx_exp_orders_created
  on exp_orders(created_at desc);
create index if not exists idx_exp_orders_guest_tracking_token
  on exp_orders(guest_tracking_token)
  where guest_tracking_token is not null;
create index if not exists idx_exp_orders_guest_tracking_expires
  on exp_orders(guest_tracking_expires_at)
  where guest_tracking_expires_at is not null;
create index if not exists idx_exp_orders_stripe_payment_intent
  on exp_orders(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
create index if not exists idx_exp_orders_payment_link_id
  on exp_orders(stripe_payment_link_id)
  where stripe_payment_link_id is not null;
create index if not exists idx_exp_orders_custom_request
  on exp_orders(custom_request_id)
  where custom_request_id is not null;

alter table exp_orders replica identity full;

drop trigger if exists trg_exp_orders_updated_at on exp_orders;
create trigger trg_exp_orders_updated_at
  before update on exp_orders
  for each row execute function exp_set_updated_at();

alter table exp_orders enable row level security;

-- 24. exp_order_items
create table if not exists exp_order_items (
  id                uuid        primary key default gen_random_uuid(),
  order_id          uuid        not null references exp_orders(id) on delete cascade,
  product_id        uuid,
  product_title     text        not null,
  variant_label     text,
  selected_options  jsonb       not null default '{}'::jsonb,
  unit_price        numeric(10,2) not null default 0,
  quantity          integer     not null check (quantity > 0),
  line_subtotal     numeric(10,2) not null default 0,
  line_discount     numeric(10,2) not null default 0,
  line_total        numeric(10,2) not null default 0,
  created_at        timestamptz not null default now(),
  option_snapshot   jsonb       not null default '{}'::jsonb,
  nfc_target_data   text,
  leave_unlocked    boolean     not null default false,
  source_file_url   text
);

create index if not exists idx_exp_order_items_order
  on exp_order_items(order_id);
create index if not exists idx_exp_order_items_source_file
  on exp_order_items(source_file_url)
  where source_file_url is not null;

alter table exp_order_items replica identity full;

alter table exp_order_items enable row level security;

-- 25. exp_order_status_events
create table if not exists exp_order_status_events (
  id                      uuid        primary key default gen_random_uuid(),
  order_id                uuid        not null references exp_orders(id) on delete cascade,
  action_type             text        not null check (action_type in (
                            'status_transition','cancel','refund_marked',
                            'note','schedule_hook','hook_completed')),
  previous_status         text,
  next_status             text,
  previous_payment_status text,
  next_payment_status     text,
  note                    text,
  metadata                jsonb       not null default '{}'::jsonb,
  created_by              text,
  created_at              timestamptz not null default now()
);

create index if not exists idx_exp_order_status_events_order
  on exp_order_status_events(order_id, created_at desc);

alter table exp_order_status_events enable row level security;

-- 26. exp_order_internal_notes
create table if not exists exp_order_internal_notes (
  id                uuid        primary key default gen_random_uuid(),
  order_id          uuid        not null references exp_orders(id) on delete cascade,
  note              text        not null,
  is_pinned         boolean     not null default false,
  created_by        text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_exp_order_internal_notes_order
  on exp_order_internal_notes(order_id, created_at desc);

alter table exp_order_internal_notes enable row level security;

-- 27. exp_order_production_hooks
create table if not exists exp_order_production_hooks (
  id                uuid        primary key default gen_random_uuid(),
  order_id          uuid        not null references exp_orders(id) on delete cascade,
  stage             text        not null check (stage in (
                            'design','setup','production','finishing','packing')),
  scheduled_for     timestamptz,
  estimated_hours   numeric(8,2),
  assignee          text,
  note              text,
  is_completed      boolean     not null default false,
  completed_at      timestamptz,
  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_exp_order_production_hooks_order
  on exp_order_production_hooks(order_id, stage, is_completed, created_at desc);

drop trigger if exists trg_exp_order_production_hooks_updated_at on exp_order_production_hooks;
create trigger trg_exp_order_production_hooks_updated_at
  before update on exp_order_production_hooks
  for each row execute function exp_set_updated_at();

alter table exp_order_production_hooks enable row level security;

-- 28. exp_product_inventory
create table if not exists exp_product_inventory (
  id                       uuid        primary key default gen_random_uuid(),
  product_id               uuid        not null references exp_products(id) on delete cascade unique,
  available_qty            integer     not null default 0 check (available_qty >= 0),
  low_stock_threshold      integer     not null default 3 check (low_stock_threshold >= 0),
  availability_override    text        not null default 'inherit'
                                check (availability_override in (
                                  'inherit','force_in_stock','force_out_of_stock')),
  is_track_inventory       boolean     not null default false,
  last_adjusted_at         timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_exp_product_inventory_tracking
  on exp_product_inventory(is_track_inventory, availability_override);

drop trigger if exists trg_exp_product_inventory_updated_at on exp_product_inventory;
create trigger trg_exp_product_inventory_updated_at
  before update on exp_product_inventory
  for each row execute function exp_set_updated_at();

alter table exp_product_inventory enable row level security;

-- 29. exp_inventory_adjustments
create table if not exists exp_inventory_adjustments (
  id                uuid        primary key default gen_random_uuid(),
  inventory_id       uuid        references exp_product_inventory(id) on delete set null,
  product_id         uuid        references exp_products(id) on delete set null,
  order_id           uuid        references exp_orders(id) on delete set null,
  change_qty         integer     not null,
  quantity_before    integer,
  quantity_after     integer,
  reason_code        text        not null check (reason_code in (
                        'initial_set','manual_correction','restock','damaged',
                        'order_reserved','order_released','bulk_update')),
  note               text,
  adjusted_by        text,
  created_at         timestamptz not null default now()
);

create index if not exists idx_exp_inventory_adjustments_product
  on exp_inventory_adjustments(product_id, created_at desc);
create index if not exists idx_exp_inventory_adjustments_order
  on exp_inventory_adjustments(order_id, created_at desc);

alter table exp_inventory_adjustments enable row level security;

-- 30. exp_material_catalog
create table if not exists exp_material_catalog (
  id                uuid        primary key default gen_random_uuid(),
  key               text        not null unique,
  name              text        not null,
  unit_name         text        not null default 'unit',
  is_active         boolean     not null default true,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists trg_exp_material_catalog_updated_at on exp_material_catalog;
create trigger trg_exp_material_catalog_updated_at
  before update on exp_material_catalog
  for each row execute function exp_set_updated_at();

alter table exp_material_catalog enable row level security;

-- 31. exp_material_cost_history
create table if not exists exp_material_cost_history (
  id                uuid        primary key default gen_random_uuid(),
  material_id       uuid        not null references exp_material_catalog(id) on delete cascade,
  cost_per_unit     numeric(12,4) not null check (cost_per_unit >= 0),
  effective_from    timestamptz not null default now(),
  supplier_label    text,
  notes             text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_exp_material_cost_history_material
  on exp_material_cost_history(material_id, effective_from desc);

alter table exp_material_cost_history enable row level security;

-- 32. exp_labor_time_entries
create table if not exists exp_labor_time_entries (
  id                uuid        primary key default gen_random_uuid(),
  order_id          uuid        references exp_orders(id) on delete set null,
  order_item_id     uuid        references exp_order_items(id) on delete set null,
  stage             text        not null check (stage in (
                        'design','setup','production','finishing','packing')),
  minutes           integer     not null check (minutes > 0),
  hourly_rate       numeric(10,2) not null default 0 check (hourly_rate >= 0),
  note              text,
  logged_by         text,
  logged_at         timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_exp_labor_time_entries_order
  on exp_labor_time_entries(order_id, logged_at desc);
create index if not exists idx_exp_labor_time_entries_item
  on exp_labor_time_entries(order_item_id, logged_at desc);
create index if not exists idx_exp_labor_time_entries_stage
  on exp_labor_time_entries(stage, logged_at desc);

drop trigger if exists trg_exp_labor_time_entries_updated_at on exp_labor_time_entries;
create trigger trg_exp_labor_time_entries_updated_at
  before update on exp_labor_time_entries
  for each row execute function exp_set_updated_at();

alter table exp_labor_time_entries enable row level security;

-- 33. exp_order_item_material_usage
create table if not exists exp_order_item_material_usage (
  id                        uuid        primary key default gen_random_uuid(),
  order_item_id             uuid        not null references exp_order_items(id) on delete cascade,
  material_id               uuid        references exp_material_catalog(id) on delete set null,
  quantity_used             numeric(12,4) not null check (quantity_used >= 0),
  unit_cost_snapshot        numeric(12,4) not null check (unit_cost_snapshot >= 0),
  total_cost_snapshot       numeric(12,4) generated always as (quantity_used * unit_cost_snapshot) stored,
  note                      text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists idx_exp_order_item_material_usage_item
  on exp_order_item_material_usage(order_item_id, created_at desc);

drop trigger if exists trg_exp_order_item_material_usage_updated_at on exp_order_item_material_usage;
create trigger trg_exp_order_item_material_usage_updated_at
  before update on exp_order_item_material_usage
  for each row execute function exp_set_updated_at();

alter table exp_order_item_material_usage enable row level security;

-- 34. exp_machine_schedule_blocks
create table if not exists exp_machine_schedule_blocks (
  id                uuid        primary key default gen_random_uuid(),
  order_id          uuid        references exp_orders(id) on delete set null,
  order_item_id     uuid        references exp_order_items(id) on delete set null,
  custom_request_id uuid        references exp_custom_requests(id) on delete set null,
  stage             text        not null check (stage in (
                        'design','setup','production','finishing','packing')),
  start_at          timestamptz not null,
  end_at            timestamptz not null,
  estimated_hours   numeric(8,2) not null check (estimated_hours >= 0),
  is_locked         boolean     not null default false,
  note              text,
  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table exp_machine_schedule_blocks drop constraint if exists exp_machine_schedule_blocks_end_after_start;
alter table exp_machine_schedule_blocks add constraint exp_machine_schedule_blocks_end_after_start
  check (end_at > start_at);

create index if not exists idx_exp_machine_schedule_blocks_window
  on exp_machine_schedule_blocks(start_at asc, end_at asc);
create index if not exists idx_exp_machine_schedule_blocks_order
  on exp_machine_schedule_blocks(order_id, stage, start_at desc);

drop trigger if exists trg_exp_machine_schedule_blocks_updated_at on exp_machine_schedule_blocks;
create trigger trg_exp_machine_schedule_blocks_updated_at
  before update on exp_machine_schedule_blocks
  for each row execute function exp_set_updated_at();

alter table exp_machine_schedule_blocks enable row level security;

-- 35. exp_newsletter_subscribers
create table if not exists exp_newsletter_subscribers (
  id                    uuid        primary key default gen_random_uuid(),
  email                 text        not null,
  source                text,
  subscribed            boolean     not null default true,
  subscribed_at         timestamptz not null default now(),
  unsubscribed_at       timestamptz,
  consent_ip            text,
  consent_user_agent    text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists idx_newsletter_subscribers_email
  on exp_newsletter_subscribers(email);
create index if not exists idx_newsletter_subscribers_subscribed
  on exp_newsletter_subscribers(subscribed);

alter table exp_newsletter_subscribers enable row level security;

-- 36. exp_back_in_stock_alerts
create table if not exists exp_back_in_stock_alerts (
  id                    uuid        primary key default gen_random_uuid(),
  product_id            uuid        not null references exp_products(id) on delete cascade,
  email                 text        not null,
  status                text        not null default 'active'
                            check (status in ('active','notified','unsubscribed')),
  source                text        not null default 'product_page',
  consent_ip            text,
  consent_user_agent    text,
  subscribed_at         timestamptz not null default now(),
  notified_at           timestamptz,
  unsubscribed_at       timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists idx_exp_back_in_stock_alerts_product_email
  on exp_back_in_stock_alerts(product_id, email);
create index if not exists idx_exp_back_in_stock_alerts_status
  on exp_back_in_stock_alerts(status, created_at desc);
create index if not exists idx_exp_back_in_stock_alerts_product
  on exp_back_in_stock_alerts(product_id, status);

drop trigger if exists trg_exp_back_in_stock_alerts_updated_at on exp_back_in_stock_alerts;
create trigger trg_exp_back_in_stock_alerts_updated_at
  before update on exp_back_in_stock_alerts
  for each row execute function exp_set_updated_at();

alter table exp_back_in_stock_alerts enable row level security;

-- 37. exp_capacity_reopen_alerts
create table if not exists exp_capacity_reopen_alerts (
  id                    uuid        primary key default gen_random_uuid(),
  category_key          text        not null,
  email                 text        not null,
  status                text        not null default 'active'
                            check (status in ('active','notified','unsubscribed')),
  source                text        not null default 'category_page',
  subscribed_at         timestamptz not null default now(),
  notified_at           timestamptz,
  unsubscribed_at       timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists idx_exp_capacity_reopen_alerts_category_email
  on exp_capacity_reopen_alerts(category_key, email);
create index if not exists idx_exp_capacity_reopen_alerts_status
  on exp_capacity_reopen_alerts(status, created_at desc);
create index if not exists idx_exp_capacity_reopen_alerts_category
  on exp_capacity_reopen_alerts(category_key, status);

drop trigger if exists trg_exp_capacity_reopen_alerts_updated_at on exp_capacity_reopen_alerts;
create trigger trg_exp_capacity_reopen_alerts_updated_at
  before update on exp_capacity_reopen_alerts
  for each row execute function exp_set_updated_at();

alter table exp_capacity_reopen_alerts enable row level security;

-- 38. exp_admin_audit_log
create table if not exists exp_admin_audit_log (
  id                uuid        primary key default gen_random_uuid(),
  action             text        not null,
  entity_type        text        not null,
  entity_id          text,
  route              text        not null,
  request_ip         text,
  user_agent         text,
  status             text        not null check (status in ('success','failure')),
  details            jsonb       not null default '{}'::jsonb,
  branch             text        not null,
  created_at         timestamptz not null default now()
);

create index if not exists idx_admin_audit_log_created_at
  on exp_admin_audit_log(created_at desc);
create index if not exists idx_admin_audit_log_entity
  on exp_admin_audit_log(entity_type, entity_id);

alter table exp_admin_audit_log enable row level security;

-- 39. exp_stripe_webhook_events
create table if not exists exp_stripe_webhook_events (
  event_id           text        primary key,
  event_type         text        not null,
  status             text        not null default 'processing'
                        check (status in ('processing','processed','failed')),
  last_error         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  processed_at       timestamptz
);

create index if not exists idx_stripe_webhook_events_status_created_at
  on exp_stripe_webhook_events(status, created_at desc);

alter table exp_stripe_webhook_events enable row level security;

-- 40. exp_admin_notifications
create table if not exists exp_admin_notifications (
  id                uuid        primary key default gen_random_uuid(),
  source_type        text        not null check (source_type in ('order','custom_request','system')),
  source_id          text        not null,
  event_type         text        not null,
  title              text        not null,
  body               text,
  href               text,
  is_read            boolean     not null default false,
  read_at            timestamptz,
  metadata           jsonb       not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table exp_admin_notifications drop constraint if exists exp_admin_notifications_unique_source_event;
alter table exp_admin_notifications add constraint exp_admin_notifications_unique_source_event
  unique (source_type, source_id, event_type);

create index if not exists idx_exp_admin_notifications_unread
  on exp_admin_notifications(is_read, created_at desc);
create index if not exists idx_exp_admin_notifications_source
  on exp_admin_notifications(source_type, source_id, created_at desc);

drop trigger if exists trg_exp_admin_notifications_updated_at on exp_admin_notifications;
create trigger trg_exp_admin_notifications_updated_at
  before update on exp_admin_notifications
  for each row execute function exp_set_updated_at();

alter table exp_admin_notifications enable row level security;

-- 41. exp_square_webhook_events
create table if not exists exp_square_webhook_events (
  id                text        primary key,
  event_type        text        not null,
  received_at       timestamptz not null default now(),
  processed         boolean     not null default true
);

create index if not exists idx_exp_square_webhook_events_received
  on exp_square_webhook_events(received_at);

alter table exp_square_webhook_events enable row level security;

-- 42. exp_rate_limit_windows
create table if not exists exp_rate_limit_windows (
  key               text        not null,
  window_start      bigint      not null,
  count             integer     not null default 1,
  expires_at        timestamptz not null,
  primary key (key, window_start)
);

create index if not exists idx_exp_rate_limit_windows_expires
  on exp_rate_limit_windows(expires_at);

alter table exp_rate_limit_windows enable row level security;

-- 43. exp_admin_sessions
create table if not exists exp_admin_sessions (
  id                uuid        primary key default gen_random_uuid(),
  token_hash        text        not null unique,
  jti               text        not null unique,
  ip_address        text,
  user_agent        text,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  revoked_at        timestamptz,
  last_activity_at  timestamptz
);

create index if not exists idx_exp_admin_sessions_token_hash
  on exp_admin_sessions(token_hash);
create index if not exists idx_exp_admin_sessions_expires
  on exp_admin_sessions(expires_at);

alter table exp_admin_sessions enable row level security;

-- 44. exp_artwork_uploads
create table if not exists exp_artwork_uploads (
  id                uuid        primary key default gen_random_uuid(),
  upload_token      text        not null unique,
  file_path         text        not null,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null default (now() + interval '24 hours')
);

create index if not exists idx_exp_artwork_uploads_token
  on exp_artwork_uploads(upload_token);
create index if not exists idx_exp_artwork_uploads_expires
  on exp_artwork_uploads(expires_at);

alter table exp_artwork_uploads enable row level security;

-- 45. admin_mfa_codes
create table if not exists admin_mfa_codes (
  id                bigint      primary key generated always as identity,
  ip                text,
  code              text        not null,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  used              boolean     not null default false,
  challenge_token   text,
  device_fingerprint text
);

create index if not exists idx_admin_mfa_codes_expires
  on admin_mfa_codes(expires_at);
create index if not exists idx_admin_mfa_codes_challenge_token
  on admin_mfa_codes(challenge_token);

alter table admin_mfa_codes enable row level security;

-- 46. exp_commission_queue (VIEW)
create or replace view exp_commission_queue as
select
  o.id                            as order_id,
  o.order_path,
  oi.id                            as item_id,
  oi.product_title,
  oi.variant_label,
  coalesce(oi.selected_options->>'character_name', mask.masked_id) as display_name,
  o.status,
  oi.nfc_target_data,
  oi.leave_unlocked,
  o.production_estimate_band,
  o.created_at                     as order_created_at,
  o.paid_at
from exp_orders o
join exp_order_items oi on oi.order_id = o.id
left join (
  select id, md5(id::text) as masked_id from exp_orders
) mask on mask.id = o.id
where o.status not in ('cancelled', 'delivered')
  and o.payment_status = 'paid';

grant select on exp_commission_queue to authenticated;

-- Functions
create or replace function exp_reserve_order_inventory(p_order_id uuid)
returns jsonb language plpgsql security definer
set search_path = '' as $$
declare
  v_order record;
  v_item record;
  v_inventory record;
  v_adjusted_qty int;
begin
  select * into v_order from exp_orders where id = p_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'order_not_found');
  end if;

  if v_order.inventory_reserved_at is not null then
    return jsonb_build_object('ok', true, 'reason', 'already_reserved');
  end if;

  for v_item in
    select oi.*, p.is_ready_made, p.id as product_id
    from exp_order_items oi
    join exp_products p on p.id = oi.product_id
    where oi.order_id = p_order_id and p.is_ready_made = true
  loop
    select * into v_inventory
    from exp_product_inventory
    where product_id = v_item.product_id;

    if not found then
      return jsonb_build_object('ok', false, 'reason', 'forced_out_of_stock', 'product_id', v_item.product_id);
    end if;

    if v_inventory.availability_override = 'force_out_of_stock' then
      return jsonb_build_object('ok', false, 'reason', 'forced_out_of_stock', 'product_id', v_item.product_id);
    end if;

    if v_inventory.is_track_inventory and v_inventory.available_qty < v_item.quantity then
      return jsonb_build_object(
        'ok', false, 'reason', 'insufficient_stock',
        'product_id', v_item.product_id,
        'available_qty', v_inventory.available_qty,
        'required_qty', v_item.quantity
      );
    end if;
  end loop;

  for v_item in
    select oi.*, p.is_ready_made, p.id as product_id
    from exp_order_items oi
    join exp_products p on p.id = oi.product_id
    where oi.order_id = p_order_id and p.is_ready_made = true
  loop
    select * into v_inventory
    from exp_product_inventory
    where product_id = v_item.product_id;

    if v_inventory.is_track_inventory then
      v_adjusted_qty := v_item.quantity;

      update exp_product_inventory
      set available_qty = available_qty - v_adjusted_qty,
          last_adjusted_at = now(),
          updated_at = now()
      where id = v_inventory.id;

      insert into exp_inventory_adjustments (
        inventory_id, product_id, order_id, change_qty,
        quantity_before, quantity_after, reason_code, note, adjusted_by
      ) values (
        v_inventory.id,
        v_item.product_id,
        p_order_id,
        -v_adjusted_qty,
        v_inventory.available_qty,
        v_inventory.available_qty - v_adjusted_qty,
        'order_reserved',
        'Reserved for order ' || p_order_id::text,
        'system'
      );
    end if;
  end loop;

  update exp_orders
  set inventory_reserved_at = now(),
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'reason', 'reserved');
end;
$$;

create or replace function exp_release_order_inventory(p_order_id uuid, p_note text default null)
returns jsonb language plpgsql security definer
set search_path = '' as $$
declare
  v_order record;
  v_item record;
  v_inventory record;
  v_current_qty int;
begin
  select * into v_order from exp_orders where id = p_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'order_not_found');
  end if;

  if v_order.inventory_reserved_at is null then
    return jsonb_build_object('ok', true, 'reason', 'not_reserved');
  end if;

  if v_order.inventory_released_at is not null then
    return jsonb_build_object('ok', true, 'reason', 'already_released');
  end if;

  if v_order.payment_status = 'paid' then
    return jsonb_build_object('ok', true, 'reason', 'paid_not_released');
  end if;

  for v_item in
    select oi.*, p.is_ready_made, p.id as product_id
    from exp_order_items oi
    join exp_products p on p.id = oi.product_id
    where oi.order_id = p_order_id and p.is_ready_made = true
  loop
    select * into v_inventory
    from exp_product_inventory
    where product_id = v_item.product_id;

    if found and v_inventory.is_track_inventory then
      v_current_qty := v_inventory.available_qty;

      update exp_product_inventory
      set available_qty = available_qty + v_item.quantity,
          last_adjusted_at = now(),
          updated_at = now()
      where id = v_inventory.id;

      insert into exp_inventory_adjustments (
        inventory_id, product_id, order_id, change_qty,
        quantity_before, quantity_after, reason_code, note, adjusted_by
      ) values (
        v_inventory.id,
        v_item.product_id,
        p_order_id,
        v_item.quantity,
        v_current_qty,
        v_current_qty + v_item.quantity,
        'order_released',
        coalesce(p_note, 'Released from order ' || p_order_id::text),
        'system'
      );
    end if;
  end loop;

  update exp_orders
  set inventory_released_at = now(),
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'reason', 'released');
end;
$$;

create or replace function increment_rate_limit(p_expires_at timestamptz, p_key text)
returns integer language plpgsql security definer
set search_path = '' as $$
declare
  v_count integer;
begin
  insert into exp_rate_limit_windows (key, window_start, count, expires_at)
  values (p_key, extract(epoch from now())::bigint, 1, p_expires_at)
  on conflict (key) do update
    set
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

create or replace function cleanup_expired_mfa_codes()
returns void language plpgsql security definer
set search_path = '' as $$
begin
  delete from admin_mfa_codes where expires_at < now();
end;
$$;

create or replace function cleanup_expired_rate_limits()
returns void language plpgsql security definer
set search_path = '' as $$
begin
  delete from exp_rate_limit_windows where expires_at < now();
end;
$$;

-- Privilege Grants
grant all on table exp_newsletter_subscribers to service_role;
grant all on table exp_budget_ranges to service_role;
grant all on table exp_admin_audit_log to service_role;
grant all on table exp_stripe_webhook_events to service_role;
grant all on table exp_product_inventory to service_role;
grant all on table exp_inventory_adjustments to service_role;
grant all on table exp_order_status_events to service_role;
grant all on table exp_order_internal_notes to service_role;
grant all on table exp_order_production_hooks to service_role;
grant all on table exp_admin_notifications to service_role;
grant all on table exp_material_catalog to service_role;
grant all on table exp_material_cost_history to service_role;
grant all on table exp_labor_time_entries to service_role;
grant all on table exp_order_item_material_usage to service_role;
grant all on table exp_machine_schedule_blocks to service_role;
grant all on table exp_back_in_stock_alerts to service_role;
grant all on table exp_cart_captures to service_role;
grant all on table exp_capacity_reopen_alerts to service_role;
grant all on table exp_square_webhook_events to service_role;
grant all on table exp_rate_limit_windows to service_role;
grant all on table exp_admin_sessions to service_role;
grant all on table exp_artwork_uploads to service_role;
grant all on table admin_mfa_codes to service_role;

revoke all on table exp_newsletter_subscribers from anon, authenticated;
revoke all on table exp_budget_ranges from anon, authenticated;
revoke all on table exp_admin_audit_log from anon, authenticated;
revoke all on table exp_stripe_webhook_events from anon, authenticated;
revoke all on table exp_product_inventory from anon, authenticated;
revoke all on table exp_inventory_adjustments from anon, authenticated;
revoke all on table exp_order_status_events from anon, authenticated;
revoke all on table exp_order_internal_notes from anon, authenticated;
revoke all on table exp_order_production_hooks from anon, authenticated;
revoke all on table exp_admin_notifications from anon, authenticated;
revoke all on table exp_material_catalog from anon, authenticated;
revoke all on table exp_material_cost_history from anon, authenticated;
revoke all on table exp_labor_time_entries from anon, authenticated;
revoke all on table exp_order_item_material_usage from anon, authenticated;
revoke all on table exp_machine_schedule_blocks from anon, authenticated;
revoke all on table exp_back_in_stock_alerts from anon, authenticated;
revoke all on table exp_cart_captures from anon, authenticated;
revoke all on table exp_capacity_reopen_alerts from anon, authenticated;
revoke all on table exp_square_webhook_events from anon, authenticated;
revoke all on table exp_rate_limit_windows from anon, authenticated;
revoke all on table exp_admin_sessions from anon, authenticated;
revoke all on table exp_artwork_uploads from anon, authenticated;
revoke all on table admin_mfa_codes from anon, authenticated;

revoke insert on exp_orders from anon;
revoke insert on exp_order_items from anon;

grant select on exp_commission_queue to authenticated;

-- -----------------------------------------------------------------------------
-- Batch 2 security remediation additions
-- -----------------------------------------------------------------------------

-- M-1: physical shipping weight columns
alter table if exists exp_products
  add column if not exists weight_lb numeric(6,2) not null default 1
  check (weight_lb >= 0.01 and weight_lb <= 150);

alter table if exists exp_product_variants
  add column if not exists weight_lb numeric(6,2)
  check (weight_lb is null or (weight_lb >= 0.01 and weight_lb <= 150));

-- DB-2: promo / bundle tables are service-role only
drop policy if exists "exp_promo_codes_public_read" on exp_promo_codes;
drop policy if exists "exp_bundle_deals_public_read" on exp_bundle_deals;

-- DB-1: design-artifacts bucket is private with service-role-only storage access
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

drop policy if exists "design-artifacts service role all" on storage.objects;
create policy "design-artifacts service role all"
  on storage.objects
  for all
  to service_role
  using (bucket_id = 'design-artifacts')
  with check (bucket_id = 'design-artifacts');

drop policy if exists "design-artifacts public read" on storage.objects;
drop policy if exists "design-artifacts public upload" on storage.objects;

-- DB-1: ensure legacy customer PII tables are gone
drop table if exists exp_wishlists cascade;
drop table if exists exp_customer_addresses cascade;
drop table if exists exp_password_reset_tokens cascade;
drop table if exists exp_customer_sessions cascade;
drop table if exists exp_recently_viewed cascade;
drop table if exists exp_customers cascade;

-- DB-3: ensure rate-limit function uses the alphabetical-order signature
-- (migration 059 recreates these; this is a safety net for schema_repair runs)
drop function if exists increment_rate_limit(text, bigint, timestamptz);
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
