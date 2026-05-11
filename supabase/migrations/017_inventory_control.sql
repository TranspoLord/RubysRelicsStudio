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
