-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 055: Future Products Roadmap
-- Supports the /future-products public page and admin CRUD management.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists exp_future_product_statuses (
  id          uuid        primary key default gen_random_uuid(),
  label       text        not null,
  color       text        not null default '#6A7AC4',
  sort_order  integer     not null default 0,
  is_default  boolean     not null default false,
  is_visible  boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists idx_future_product_statuses_label
  on exp_future_product_statuses(label);
create index if not exists idx_future_product_statuses_order
  on exp_future_product_statuses(sort_order);

create table if not exists exp_future_products (
  id                    uuid        primary key default gen_random_uuid(),
  title                 text        not null,
  description           text,
  estimated_release     date,
  category_key          text        references exp_taxonomy(key),
  media_url             text,
  media_alt             text,
  status_id             uuid        references exp_future_product_statuses(id),
  is_visible            boolean     not null default true,
  sort_order            integer     not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_future_products_visible
  on exp_future_products(is_visible);
create index if not exists idx_future_products_status
  on exp_future_products(status_id);
create index if not exists idx_future_products_sort
  on exp_future_products(sort_order);

alter table exp_newsletter_subscribers
  add column if not exists name              text,
  add column if not exists interest_details  jsonb not null default '{}'::jsonb,
  add column if not exists response_status   text not null default 'new'
    check (response_status in ('new', 'viewed', 'responded', 'denied')),
  add column if not exists denial_reason     text;

alter table exp_future_products enable row level security;
alter table exp_future_product_statuses enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'exp_future_products'
      and policyname = 'public read visible future products'
  ) then
    create policy "public read visible future products"
      on exp_future_products for select
      to anon, authenticated
      using (is_visible = true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'exp_future_product_statuses'
      and policyname = 'public read visible future product statuses'
  ) then
    create policy "public read visible future product statuses"
      on exp_future_product_statuses for select
      to anon, authenticated
      using (is_visible = true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_exp_future_products_updated_at'
      and tgrelid = 'exp_future_products'::regclass
  ) then
    create trigger trg_exp_future_products_updated_at
      before update on exp_future_products
      for each row execute function exp_set_updated_at();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_exp_future_product_statuses_updated_at'
      and tgrelid = 'exp_future_product_statuses'::regclass
  ) then
    create trigger trg_exp_future_product_statuses_updated_at
      before update on exp_future_product_statuses
      for each row execute function exp_set_updated_at();
  end if;
end
$$;
