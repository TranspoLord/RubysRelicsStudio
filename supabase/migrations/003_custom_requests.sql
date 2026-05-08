-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003: Custom order intake table
-- Purpose: persist /custom-orders submissions for manual quote workflow.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists exp_custom_requests (
  id                    uuid primary key default gen_random_uuid(),
  status                text not null default 'awaiting_quote' check (
                          status in (
                            'awaiting_quote',
                            'quote_sent',
                            'paid',
                            'expired',
                            'cancelled',
                            'restricted_pending_review',
                            'restricted_rejected',
                            'restricted_approved'
                          )
                        ),
  customer_name         text not null,
  customer_email        text not null,
  item_type             text not null,
  quantity              integer not null default 1 check (quantity > 0),
  deadline              date,
  budget_range          text,
  description           text not null,
  files                 jsonb not null default '[]'::jsonb,
  design_help_needed    boolean not null default false,
  ip_rights_confirmed   boolean not null default false,
  age_confirmed         boolean not null default false,
  tos_accepted          boolean not null default false,
  branch                text not null default 'DEV' check (branch in ('DEV', 'TEST', 'PROD')),
  quote_amount          numeric(10,2),
  stripe_payment_link_id text,
  stripe_payment_link_url text,
  admin_notes           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_exp_custom_requests_status on exp_custom_requests(status);
create index if not exists idx_exp_custom_requests_email on exp_custom_requests(customer_email);
create index if not exists idx_exp_custom_requests_created on exp_custom_requests(created_at desc);

alter table exp_custom_requests enable row level security;

-- Public read is intentionally disabled for now.
-- Submissions are created via server route using service-role access.
