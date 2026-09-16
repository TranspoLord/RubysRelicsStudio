-- -----------------------------------------------------------------------------
-- Migration 061: Security review follow-up (P-3 / P-6)
--
-- P-3: Harden cleanup_expired_mfa_codes (and re-affirm the rate-limit helpers)
--      with SET search_path = '' so no SECURITY DEFINER function is left
--      unguarded against search-path hijacking.
--
-- P-6: Recreate the inventory reserve/release functions with FOR UPDATE row
--      locking to close the concurrent-checkout oversell race. The bodies are
--      otherwise identical to migration 049/060, so results are unchanged
--      except that concurrent invocations now serialize on the order and
--      inventory rows.
--
-- All statements are idempotent (CREATE OR REPLACE) and safe to re-run.
-- -----------------------------------------------------------------------------

-- P-3: harden the MFA-cleanup function.
create or replace function cleanup_expired_mfa_codes()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from admin_mfa_codes where expires_at < now();
end;
$$;

-- P-3: re-affirm the rate-limit cleanup + increment functions with search_path
-- hardening and the canonical PRIMARY KEY (key) conflict clause.
create or replace function cleanup_expired_rate_limits()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from exp_rate_limit_windows where expires_at < now();
end;
$$;

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

-- P-6: inventory reserve with FOR UPDATE locking.
create or replace function exp_reserve_order_inventory(p_order_id uuid)
returns jsonb language plpgsql security definer
set search_path = '' as $$
declare
  v_order record;
  v_item record;
  v_inventory record;
  v_adjusted_qty int;
begin
  select * into v_order from exp_orders where id = p_order_id for update;
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
    where product_id = v_item.product_id
    for update;

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
    where product_id = v_item.product_id
    for update;

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

-- P-6: inventory release with FOR UPDATE locking.
create or replace function exp_release_order_inventory(p_order_id uuid, p_note text default null)
returns jsonb language plpgsql security definer
set search_path = '' as $$
declare
  v_order record;
  v_item record;
  v_inventory record;
  v_current_qty int;
begin
  select * into v_order from exp_orders where id = p_order_id for update;
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
    where product_id = v_item.product_id
    for update;

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
