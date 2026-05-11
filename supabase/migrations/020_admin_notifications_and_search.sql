-- -----------------------------------------------------------------------------
-- Migration 020: Admin notifications and global search support
-- Purpose:
-- 1) Persist unread/read notification state for admin bell UI
-- 2) Provide durable event records linked to operational entities
-- -----------------------------------------------------------------------------

create table if not exists exp_admin_notifications (
  id           uuid primary key default gen_random_uuid(),
  source_type  text not null check (source_type in ('order', 'custom_request', 'system')),
  source_id    text not null,
  event_type   text not null,
  title        text not null,
  body         text,
  href         text,
  is_read      boolean not null default false,
  read_at      timestamptz,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(source_type, source_id, event_type)
);

create index if not exists idx_exp_admin_notifications_unread
  on exp_admin_notifications(is_read, created_at desc);

create index if not exists idx_exp_admin_notifications_source
  on exp_admin_notifications(source_type, source_id, created_at desc);

alter table exp_admin_notifications enable row level security;

create trigger trg_exp_admin_notifications_updated_at
before update on exp_admin_notifications
for each row execute function exp_set_updated_at();
