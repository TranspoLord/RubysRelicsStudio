-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 001: Homepage CMS tables
-- Tables: exp_taxonomy, exp_homepage_sections, exp_featured_collections,
--         exp_gallery, exp_testimonials, exp_announcement
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Taxonomy (categories, materials, tags, etc.) ─────────────────────────────
create table if not exists exp_taxonomy (
  key              text        primary key,
  display_name     text        not null,
  slug             text        not null unique,
  parent_key       text        references exp_taxonomy(key),
  type             text        not null check (type in (
                                 'category','customizability_mode',
                                 'material','product_type','tag')),
  visible          boolean     not null default true,
  sort_order       integer     not null default 0,
  how_it_works_anchor text,
  alias_keys       text,                           -- comma-separated alt keys
  -- per-category display overrides (used by CategoryGrid)
  emoji            text,
  gradient         text,
  glow_color       text,
  tagline          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_exp_taxonomy_type    on exp_taxonomy(type);
create index if not exists idx_exp_taxonomy_visible on exp_taxonomy(visible);

-- ── Homepage sections (visibility + sort + arbitrary JSON content) ────────────
create table if not exists exp_homepage_sections (
  id           uuid        primary key default gen_random_uuid(),
  section_key  text        not null unique,    -- matches component name constant
  is_visible   boolean     not null default true,
  sort_order   integer     not null default 0,
  content      jsonb       not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── Featured collections ─────────────────────────────────────────────────────
create table if not exists exp_featured_collections (
  id           uuid        primary key default gen_random_uuid(),
  title        text        not null,
  tagline      text        not null,
  description  text        not null default '',
  slug         text        not null unique,
  image_url    text,
  emoji        text,
  tag_label    text,                            -- badge chip label
  gradient     text        not null default '',
  border_color text        not null default '',
  is_visible   boolean     not null default true,
  sort_order   integer     not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_exp_featured_visible on exp_featured_collections(is_visible);

-- ── Gallery items (Fresh From the Forge) ─────────────────────────────────────
create table if not exists exp_gallery (
  id                  uuid        primary key default gen_random_uuid(),
  title               text        not null,
  caption             text,
  category_key        text        references exp_taxonomy(key),
  media_url           text        not null default '',  -- empty until assets exist
  media_alt           text        not null default '',
  emoji               text,                            -- placeholder until image uploaded
  gradient            text        not null default '',  -- placeholder gradient
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

-- ── Testimonials ─────────────────────────────────────────────────────────────
create table if not exists exp_testimonials (
  id            uuid        primary key default gen_random_uuid(),
  quote         text        not null,
  author        text        not null,
  location      text,
  product_label text,
  stars         integer     not null default 5 check (stars between 1 and 5),
  emoji         text,
  is_visible    boolean     not null default false,  -- requires explicit publish
  sort_order    integer     not null default 0,
  source        text,                               -- 'manual','etsy','google' etc.
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_exp_testimonials_visible on exp_testimonials(is_visible);

-- ── Announcement banner ───────────────────────────────────────────────────────
create table if not exists exp_announcement (
  id           uuid        primary key default gen_random_uuid(),
  message      text        not null,
  cta_label    text,
  cta_href     text,
  is_active    boolean     not null default false,
  dismiss_key  text        not null default 'rr_announcement_v1',  -- localStorage key
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── FAQ items ─────────────────────────────────────────────────────────────────
create table if not exists exp_faq (
  id           uuid        primary key default gen_random_uuid(),
  question     text        not null,
  answer       text        not null,
  link_label   text,
  link_href    text,
  is_visible   boolean     not null default true,
  sort_order   integer     not null default 0,
  section      text        not null default 'homepage',  -- 'homepage','resources_page', etc.
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_exp_faq_section on exp_faq(section);

-- ── updated_at triggers ───────────────────────────────────────────────────────
create or replace function exp_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'exp_taxonomy','exp_homepage_sections','exp_featured_collections',
    'exp_gallery','exp_testimonials','exp_announcement','exp_faq'
  ] loop
    execute format(
      'create trigger trg_%s_updated_at before update on %s
       for each row execute function exp_set_updated_at()',
      replace(tbl, 'exp_', ''), tbl
    );
  end loop;
end;
$$;

-- ── Row-level security (anon can read visible/published rows only) ────────────
alter table exp_taxonomy              enable row level security;
alter table exp_homepage_sections     enable row level security;
alter table exp_featured_collections  enable row level security;
alter table exp_gallery               enable row level security;
alter table exp_testimonials          enable row level security;
alter table exp_announcement          enable row level security;
alter table exp_faq                   enable row level security;

-- Public read policies ─────────────────────────────────────────────
create policy "public read taxonomy"
  on exp_taxonomy for select to anon, authenticated
  using (visible = true);

create policy "public read homepage sections"
  on exp_homepage_sections for select to anon, authenticated
  using (true);

create policy "public read featured collections"
  on exp_featured_collections for select to anon, authenticated
  using (is_visible = true);

create policy "public read published gallery"
  on exp_gallery for select to anon, authenticated
  using (moderation_status = 'published' and visible = true);

create policy "public read visible testimonials"
  on exp_testimonials for select to anon, authenticated
  using (is_visible = true);

create policy "public read active announcement"
  on exp_announcement for select to anon, authenticated
  using (is_active = true);

create policy "public read visible faq"
  on exp_faq for select to anon, authenticated
  using (is_visible = true);

-- Service-role full access is implicit (bypasses RLS) ──────────────
