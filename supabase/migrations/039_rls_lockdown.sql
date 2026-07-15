-- ── Migration 039: RLS lockdown - strict ownership policies
-- Ensures users can only access their own data, anon cannot write anywhere.

-- Remove any existing permissive policies on exp_orders
drop policy if exists "authenticated_read_orders" on exp_orders;
drop policy if exists "public_read_orders" on exp_orders;

-- Strict ownership policies on exp_orders
-- Users can SELECT their own orders
create policy "users_select_own_orders"
  on exp_orders
  for select
  to authenticated
  using (
    customer_id = auth.uid()
    or (
      select 1 
      from exp_customer_sessions cs 
      where cs.customer_id = exp_orders.customer_id 
        and cs.session_token = current_setting('request.jwt.claim.session_token', true)
    ) is not null
  );

-- Users can UPDATE their own pending orders
create policy "users_update_own_orders"
  on exp_orders
  for update
  to authenticated
  using (
    customer_id = auth.uid()
  )
  with check (
    customer_id = auth.uid()
  );

-- No public INSERT on orders - only service role via API
revoke insert on exp_orders from anon;

-- Strict policies on exp_order_items
drop policy if exists "authenticated_read_order_items" on exp_order_items;
drop policy if exists "public_read_order_items" on exp_order_items;

create policy "users_select_own_order_items"
  on exp_order_items
  for select
  to authenticated
  using (
    exists (
      select 1 from exp_orders o 
      where o.id = exp_order_items.order_id 
        and o.customer_id = auth.uid()
    )
  );

create policy "users_update_own_order_items"
  on exp_order_items
  for update
  to authenticated
  using (
    exists (
      select 1 from exp_orders o 
      where o.id = exp_order_items.order_id 
        and o.status = 'awaiting_payment'
        and o.customer_id = auth.uid()
    )
  );

-- No public INSERT on order_items
revoke insert on exp_order_items from anon;

-- Ensure anon has NO write access anywhere
alter table exp_orders replica identity full;
alter table exp_order_items replica identity full;