-- Consolidated migration script for environments that are not CLI-linked
-- Contains migrations 015 through 021 in order
-- Generated from local migration files


-- ============================================================================
-- BEGIN: supabase/migrations/015_storefront_config_cleanup.sql
-- ============================================================================

-- Migration 015: Storefront config cleanup
-- Centralize support/contact/session settings and custom order budget ranges.

INSERT INTO exp_storefront_settings (setting_key, setting_value, description)
VALUES
  (
    'contact',
    '{
      "support_email": "orders@rubysrelics.com",
      "from_email": "hello@rubysrelics.com",
      "from_name": "Ruby''s Relics"
    }'::jsonb,
    'Operational contact and sender identity settings.'
  ),
  (
    'admin_session',
    '{
      "ttl_hours": 12
    }'::jsonb,
    'Admin session security policy settings.'
  ),
  (
    'custom_order_intake',
    '{
      "max_quantity": 500,
      "max_files": 5
    }'::jsonb,
    'Custom order intake guardrails and upload limits.'
  ),
  (
    'operational_notifications',
    '{
      "custom_request_notify_email": "orders@rubysrelics.com"
    }'::jsonb,
    'Operational notification recipients for internal storefront events.'
  )
ON CONFLICT (setting_key) DO UPDATE
SET
  setting_value = EXCLUDED.setting_value,
  description = EXCLUDED.description,
  updated_at = now();

CREATE TABLE IF NOT EXISTS exp_budget_ranges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  value TEXT NOT NULL UNIQUE,
  min_amount NUMERIC(10, 2),
  max_amount NUMERIC(10, 2),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_budget_ranges_active_sort ON exp_budget_ranges(is_active, sort_order);

ALTER TABLE exp_budget_ranges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE exp_budget_ranges FROM anon, authenticated;
GRANT ALL ON TABLE exp_budget_ranges TO service_role;

INSERT INTO exp_budget_ranges (label, value, min_amount, max_amount, sort_order)
VALUES
  ('Under $50', 'under-50', NULL, 50, 10),
  ('$50 - $150', '50-150', 50, 150, 20),
  ('$150 - $300', '150-300', 150, 300, 30),
  ('$300+', '300-plus', 300, NULL, 40)
ON CONFLICT (value) DO UPDATE
SET
  label = EXCLUDED.label,
  min_amount = EXCLUDED.min_amount,
  max_amount = EXCLUDED.max_amount,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- END: supabase/migrations/015_storefront_config_cleanup.sql


-- ============================================================================
-- BEGIN: supabase/migrations/016_admin_foundation_hardening.sql
-- ============================================================================

-- Migration 016: Admin foundation hardening
-- Adds admin audit logging and Stripe webhook idempotency tracking.

CREATE TABLE IF NOT EXISTS exp_admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  route TEXT NOT NULL,
  request_ip TEXT,
  user_agent TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'failure')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  branch TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON exp_admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_entity ON exp_admin_audit_log(entity_type, entity_id);

ALTER TABLE exp_admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE exp_admin_audit_log FROM anon, authenticated;
GRANT ALL ON TABLE exp_admin_audit_log TO service_role;

CREATE TABLE IF NOT EXISTS exp_stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'processed', 'failed')) DEFAULT 'processing',
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_status_created_at
  ON exp_stripe_webhook_events(status, created_at DESC);

ALTER TABLE exp_stripe_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE exp_stripe_webhook_events FROM anon, authenticated;
GRANT ALL ON TABLE exp_stripe_webhook_events TO service_role;

-- END: supabase/migrations/016_admin_foundation_hardening.sql


-- ============================================================================
-- BEGIN: supabase/migrations/017_inventory_control.sql
-- ============================================================================

-- -----------------------------------------------------------------------------
-- Migration 017: Inventory control for ready-made products
-- Purpose:
-- 1) Add inventory configuration and adjustment history
-- 2) Reserve stock atomically during checkout order writes
-- 3) Release stock for failed/expired checkout sessions
-- -----------------------------------------------------------------------------

create table if not exists exp_product_inventory (
  id                    uuid primary key default gen_random_uuid(),
  product_id            uuid not null references exp_products(id) on delete cascade,
  available_qty         integer not null default 0 check (available_qty >= 0),
  low_stock_threshold   integer not null default 3 check (low_stock_threshold >= 0),
  availability_override text not null default 'inherit'
    check (availability_override in ('inherit', 'force_in_stock', 'force_out_of_stock')),
  is_track_inventory    boolean not null default false,
  last_adjusted_at      timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique(product_id)
);

create index if not exists idx_exp_product_inventory_tracking
  on exp_product_inventory(is_track_inventory, availability_override);

create table if not exists exp_inventory_adjustments (
  id               uuid primary key default gen_random_uuid(),
  inventory_id     uuid references exp_product_inventory(id) on delete set null,
  product_id       uuid references exp_products(id) on delete set null,
  order_id         uuid references exp_orders(id) on delete set null,
  change_qty       integer not null,
  quantity_before  integer,
  quantity_after   integer,
  reason_code      text not null
    check (reason_code in (
      'initial_set',
      'manual_correction',
      'restock',
      'damaged',
      'order_reserved',
      'order_released',
      'bulk_update'
    )),
  note             text,
  adjusted_by      text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_exp_inventory_adjustments_product
  on exp_inventory_adjustments(product_id, created_at desc);

create index if not exists idx_exp_inventory_adjustments_order
  on exp_inventory_adjustments(order_id, created_at desc);

alter table exp_orders
  add column if not exists inventory_reserved_at timestamptz,
  add column if not exists inventory_released_at timestamptz;

alter table exp_product_inventory enable row level security;
alter table exp_inventory_adjustments enable row level security;

create trigger trg_exp_product_inventory_updated_at
before update on exp_product_inventory
for each row execute function exp_set_updated_at();

create or replace function exp_reserve_order_inventory(p_order_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_order record;
  v_item record;
  v_inv record;
begin
  select id, inventory_reserved_at
  into v_order
  from exp_orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'order_not_found');
  end if;

  if v_order.inventory_reserved_at is not null then
    return jsonb_build_object('ok', true, 'reason', 'already_reserved');
  end if;

  -- Preflight
  for v_item in
    select oi.product_id, sum(oi.quantity)::int as qty
    from exp_order_items oi
    join exp_products p on p.id = oi.product_id
    where oi.order_id = p_order_id
      and p.is_ready_made = true
    group by oi.product_id
  loop
    select id, available_qty, is_track_inventory, availability_override
    into v_inv
    from exp_product_inventory
    where product_id = v_item.product_id
    for update;

    if not found then
      continue;
    end if;

    if v_inv.availability_override = 'force_out_of_stock' then
      return jsonb_build_object('ok', false, 'reason', 'forced_out_of_stock', 'product_id', v_item.product_id);
    end if;

    if v_inv.availability_override = 'force_in_stock' or v_inv.is_track_inventory = false then
      continue;
    end if;

    if v_inv.available_qty < v_item.qty then
      return jsonb_build_object(
        'ok', false,
        'reason', 'insufficient_stock',
        'product_id', v_item.product_id,
        'available_qty', v_inv.available_qty,
        'required_qty', v_item.qty
      );
    end if;
  end loop;

  -- Apply reservation
  for v_item in
    select oi.product_id, sum(oi.quantity)::int as qty
    from exp_order_items oi
    join exp_products p on p.id = oi.product_id
    where oi.order_id = p_order_id
      and p.is_ready_made = true
    group by oi.product_id
  loop
    select id, available_qty, is_track_inventory, availability_override
    into v_inv
    from exp_product_inventory
    where product_id = v_item.product_id
    for update;

    if not found then
      continue;
    end if;

    if v_inv.availability_override = 'force_in_stock' or v_inv.is_track_inventory = false then
      continue;
    end if;

    update exp_product_inventory
    set available_qty = available_qty - v_item.qty,
        last_adjusted_at = now(),
        updated_at = now()
    where id = v_inv.id;

    insert into exp_inventory_adjustments (
      inventory_id,
      product_id,
      order_id,
      change_qty,
      quantity_before,
      quantity_after,
      reason_code,
      note
    )
    values (
      v_inv.id,
      v_item.product_id,
      p_order_id,
      -v_item.qty,
      v_inv.available_qty,
      v_inv.available_qty - v_item.qty,
      'order_reserved',
      'Inventory reserved during checkout session creation.'
    );
  end loop;

  update exp_orders
  set inventory_reserved_at = now(),
      inventory_released_at = null,
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'reason', 'reserved');
end;
$$;

create or replace function exp_release_order_inventory(p_order_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_order record;
  v_item record;
  v_inv record;
  v_note text;
begin
  select id, inventory_reserved_at, inventory_released_at, payment_status
  into v_order
  from exp_orders
  where id = p_order_id
  for update;

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

  v_note := coalesce(nullif(trim(p_note), ''), 'Inventory released due to checkout failure/expiration.');

  for v_item in
    select oi.product_id, sum(oi.quantity)::int as qty
    from exp_order_items oi
    join exp_products p on p.id = oi.product_id
    where oi.order_id = p_order_id
      and p.is_ready_made = true
    group by oi.product_id
  loop
    select id, available_qty, is_track_inventory, availability_override
    into v_inv
    from exp_product_inventory
    where product_id = v_item.product_id
    for update;

    if not found then
      continue;
    end if;

    if v_inv.availability_override = 'force_in_stock' or v_inv.is_track_inventory = false then
      continue;
    end if;

    update exp_product_inventory
    set available_qty = available_qty + v_item.qty,
        last_adjusted_at = now(),
        updated_at = now()
    where id = v_inv.id;

    insert into exp_inventory_adjustments (
      inventory_id,
      product_id,
      order_id,
      change_qty,
      quantity_before,
      quantity_after,
      reason_code,
      note
    )
    values (
      v_inv.id,
      v_item.product_id,
      p_order_id,
      v_item.qty,
      v_inv.available_qty,
      v_inv.available_qty + v_item.qty,
      'order_released',
      v_note
    );
  end loop;

  update exp_orders
  set inventory_released_at = now(),
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'reason', 'released');
end;
$$;

-- END: supabase/migrations/017_inventory_control.sql


-- ============================================================================
-- BEGIN: supabase/migrations/018_orders_operations_module.sql
-- ============================================================================

-- -----------------------------------------------------------------------------
-- Migration 018: Orders operations module
-- Purpose:
-- 1) Record status/payment action trails for admin operations
-- 2) Support internal notes and production scheduling hooks
-- 3) Add explicit cancellation/refund timestamps for operational clarity
-- -----------------------------------------------------------------------------

alter table exp_orders
  add column if not exists cancelled_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists shipping_carrier text,
  add column if not exists tracking_number text;

create table if not exists exp_order_status_events (
  id                       uuid primary key default gen_random_uuid(),
  order_id                 uuid not null references exp_orders(id) on delete cascade,
  action_type              text not null check (action_type in (
    'status_transition',
    'cancel',
    'refund_marked',
    'note',
    'schedule_hook',
    'hook_completed'
  )),
  previous_status          text,
  next_status              text,
  previous_payment_status  text,
  next_payment_status      text,
  note                     text,
  metadata                 jsonb not null default '{}'::jsonb,
  created_by               text,
  created_at               timestamptz not null default now()
);

create index if not exists idx_exp_order_status_events_order
  on exp_order_status_events(order_id, created_at desc);

create table if not exists exp_order_internal_notes (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references exp_orders(id) on delete cascade,
  note        text not null,
  is_pinned   boolean not null default false,
  created_by  text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_exp_order_internal_notes_order
  on exp_order_internal_notes(order_id, created_at desc);

create table if not exists exp_order_production_hooks (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references exp_orders(id) on delete cascade,
  stage            text not null check (stage in ('design', 'setup', 'production', 'finishing', 'packing')),
  scheduled_for    timestamptz,
  estimated_hours  numeric(8,2),
  assignee         text,
  note             text,
  is_completed     boolean not null default false,
  completed_at     timestamptz,
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_exp_order_production_hooks_order
  on exp_order_production_hooks(order_id, stage, is_completed, created_at desc);

create trigger trg_exp_order_production_hooks_updated_at
before update on exp_order_production_hooks
for each row execute function exp_set_updated_at();

alter table exp_order_status_events enable row level security;
alter table exp_order_internal_notes enable row level security;
alter table exp_order_production_hooks enable row level security;

-- END: supabase/migrations/018_orders_operations_module.sql


-- ============================================================================
-- BEGIN: supabase/migrations/019_custom_requests_phase6.sql
-- ============================================================================

-- -----------------------------------------------------------------------------
-- Migration 019: Custom requests lifecycle completion (Phase 6)
-- Purpose:
-- 1) Add quote-expiry fields with resend/extension tracking
-- 2) Track paid-to-production handoff time
-- -----------------------------------------------------------------------------

alter table exp_custom_requests
  add column if not exists quote_sent_at timestamptz,
  add column if not exists quote_expires_at timestamptz,
  add column if not exists quote_last_resent_at timestamptz,
  add column if not exists quote_resend_count integer not null default 0,
  add column if not exists production_handoff_at timestamptz;

create index if not exists idx_exp_custom_requests_quote_expires
  on exp_custom_requests(quote_expires_at)
  where quote_expires_at is not null;

create index if not exists idx_exp_custom_requests_handoff
  on exp_custom_requests(production_handoff_at)
  where production_handoff_at is not null;

-- END: supabase/migrations/019_custom_requests_phase6.sql


-- ============================================================================
-- BEGIN: supabase/migrations/020_admin_notifications_and_search.sql
-- ============================================================================

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

-- END: supabase/migrations/020_admin_notifications_and_search.sql


-- ============================================================================
-- BEGIN: supabase/migrations/021_finance_and_labor_analytics.sql
-- ============================================================================

-- -----------------------------------------------------------------------------
-- Migration 021: Finance and labor analytics foundation
-- Purpose:
-- 1) Track labor time entries for per-order/per-item profitability
-- 2) Track material catalog/cost history and item-level usage snapshots
-- 3) Reserve machine schedule blocks for realistic capacity planning
-- -----------------------------------------------------------------------------

create table if not exists exp_material_catalog (
  id                 uuid primary key default gen_random_uuid(),
  key                text not null unique,
  name               text not null,
  unit_name          text not null default 'unit',
  is_active          boolean not null default true,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger trg_exp_material_catalog_updated_at
before update on exp_material_catalog
for each row execute function exp_set_updated_at();

create table if not exists exp_material_cost_history (
  id                 uuid primary key default gen_random_uuid(),
  material_id        uuid not null references exp_material_catalog(id) on delete cascade,
  cost_per_unit      numeric(12,4) not null check (cost_per_unit >= 0),
  effective_from     timestamptz not null default now(),
  supplier_label     text,
  notes              text,
  created_at         timestamptz not null default now()
);

create index if not exists idx_exp_material_cost_history_material
  on exp_material_cost_history(material_id, effective_from desc);

create table if not exists exp_labor_time_entries (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid references exp_orders(id) on delete set null,
  order_item_id      uuid references exp_order_items(id) on delete set null,
  stage              text not null check (stage in ('design', 'setup', 'production', 'finishing', 'packing')),
  minutes            integer not null check (minutes > 0),
  hourly_rate        numeric(10,2) not null default 0 check (hourly_rate >= 0),
  note               text,
  logged_by          text,
  logged_at          timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_exp_labor_time_entries_order
  on exp_labor_time_entries(order_id, logged_at desc);

create index if not exists idx_exp_labor_time_entries_item
  on exp_labor_time_entries(order_item_id, logged_at desc);

create index if not exists idx_exp_labor_time_entries_stage
  on exp_labor_time_entries(stage, logged_at desc);

create trigger trg_exp_labor_time_entries_updated_at
before update on exp_labor_time_entries
for each row execute function exp_set_updated_at();

create table if not exists exp_order_item_material_usage (
  id                      uuid primary key default gen_random_uuid(),
  order_item_id           uuid not null references exp_order_items(id) on delete cascade,
  material_id             uuid references exp_material_catalog(id) on delete set null,
  quantity_used           numeric(12,4) not null check (quantity_used >= 0),
  unit_cost_snapshot      numeric(12,4) not null check (unit_cost_snapshot >= 0),
  total_cost_snapshot     numeric(12,4) generated always as (quantity_used * unit_cost_snapshot) stored,
  note                    text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_exp_order_item_material_usage_item
  on exp_order_item_material_usage(order_item_id, created_at desc);

create trigger trg_exp_order_item_material_usage_updated_at
before update on exp_order_item_material_usage
for each row execute function exp_set_updated_at();

create table if not exists exp_machine_schedule_blocks (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid references exp_orders(id) on delete set null,
  order_item_id      uuid references exp_order_items(id) on delete set null,
  custom_request_id  uuid references exp_custom_requests(id) on delete set null,
  stage              text not null check (stage in ('design', 'setup', 'production', 'finishing', 'packing')),
  start_at           timestamptz not null,
  end_at             timestamptz not null,
  estimated_hours    numeric(8,2) not null check (estimated_hours >= 0),
  is_locked          boolean not null default false,
  note               text,
  created_by         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (end_at > start_at)
);

create index if not exists idx_exp_machine_schedule_blocks_window
  on exp_machine_schedule_blocks(start_at asc, end_at asc);

create index if not exists idx_exp_machine_schedule_blocks_order
  on exp_machine_schedule_blocks(order_id, stage, start_at desc);

create trigger trg_exp_machine_schedule_blocks_updated_at
before update on exp_machine_schedule_blocks
for each row execute function exp_set_updated_at();

alter table exp_material_catalog enable row level security;
alter table exp_material_cost_history enable row level security;
alter table exp_labor_time_entries enable row level security;
alter table exp_order_item_material_usage enable row level security;
alter table exp_machine_schedule_blocks enable row level security;

-- END: supabase/migrations/021_finance_and_labor_analytics.sql

