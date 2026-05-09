-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 010: Customer authentication
-- Purpose:
-- - Add customer/user table for optional account features
-- - Add password and session management
-- - Support magic-link and email-based auth flows
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists exp_customers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  email_verified boolean default false,
  email_verified_at timestamp with time zone,
  password_hash text, -- nullable for magic-link only flow
  first_name text,
  last_name text,
  phone text,
  preferred_language text default 'en',
  receives_newsletter boolean default false,
  receives_order_updates boolean default true,
  receives_marketing boolean default false,
  receives_back_in_stock boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  last_login_at timestamp with time zone
);

create index if not exists idx_customers_email on exp_customers(email);
create index if not exists idx_customers_email_verified on exp_customers(email_verified);

-- Customer sessions for logged-in state
create table if not exists exp_customer_sessions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references exp_customers(id) on delete cascade,
  session_token text unique not null,
  ip_address text,
  user_agent text,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone default now(),
  last_activity_at timestamp with time zone default now()
);

create index if not exists idx_customer_sessions_token on exp_customer_sessions(session_token);
create index if not exists idx_customer_sessions_customer_id on exp_customer_sessions(customer_id);
create index if not exists idx_customer_sessions_expires_at on exp_customer_sessions(expires_at);

-- Password reset tokens (magic links, etc)
create table if not exists exp_password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references exp_customers(id) on delete cascade,
  token text unique not null,
  used boolean default false,
  used_at timestamp with time zone,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone default now()
);

create index if not exists idx_password_reset_tokens_token on exp_password_reset_tokens(token);
create index if not exists idx_password_reset_tokens_customer_id on exp_password_reset_tokens(customer_id);
create index if not exists idx_password_reset_tokens_used on exp_password_reset_tokens(used);

-- Customer saved addresses
create table if not exists exp_customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references exp_customers(id) on delete cascade,
  label text, -- e.g. "Home", "Work", "Shipping address"
  full_name text not null,
  street_1 text not null,
  street_2 text,
  city text not null,
  state_province text not null,
  postal_code text not null,
  country text default 'US' not null,
  phone text,
  is_default boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists idx_customer_addresses_customer_id on exp_customer_addresses(customer_id);
create index if not exists idx_customer_addresses_is_default on exp_customer_addresses(is_default);

-- Migrate existing guest orders to customer accounts (optional, for when customer claims their email)
alter table exp_orders add column if not exists customer_id uuid references exp_customers(id) on delete set null;
alter table exp_orders add column if not exists claimed_at timestamp with time zone;

create index if not exists idx_orders_customer_id on exp_orders(customer_id);

-- Track customer preferences and consent
alter table exp_customers add column if not exists newsletter_consent_at timestamp with time zone;
alter table exp_customers add column if not exists newsletter_consent_ip text;
alter table exp_customers add column if not exists marketing_consent_at timestamp with time zone;
alter table exp_customers add column if not exists marketing_consent_ip text;

-- Link custom requests to customer accounts (optional)
alter table exp_custom_requests add column if not exists customer_id uuid references exp_customers(id) on delete set null;

create index if not exists idx_custom_requests_customer_id on exp_custom_requests(customer_id);
