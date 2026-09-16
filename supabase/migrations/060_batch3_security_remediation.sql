-- -----------------------------------------------------------------------------
-- Migration 060: Batch 3 security remediation
-- Purpose: close remaining low-severity database/storage findings.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- DB-4: Restrict public storefront settings to a safe subset
-- -----------------------------------------------------------------------------
drop policy if exists "public_read_storefront_settings" on exp_storefront_settings;

create policy "public_read_storefront_settings"
  on exp_storefront_settings for select to public
  using (setting_key in ('guest_order_tracking', 'contact', 'recommendations'));

-- -----------------------------------------------------------------------------
-- L-6b: Ensure customer-artwork bucket remains private with MIME allowlist
-- (idempotent DO UPDATE so pre-existing misconfiguration is corrected)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-artwork',
  'customer-artwork',
  false,
  15728640,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- L-6a: Harden inventory functions with SET search_path = ''
-- (bodies are byte-for-byte identical to migration 049 so runtime behavior
--  is preserved; only the search_path hardening is added)
-- -----------------------------------------------------------------------------
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

