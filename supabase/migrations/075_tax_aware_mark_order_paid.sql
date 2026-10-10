-- -----------------------------------------------------------------------------
-- Migration 075: tax-aware exp_mark_order_paid (OCT #4 + #35)
--
-- The owner enabled Square's automatic tax. Square then charges
-- `order_total + tax`, but `074`'s RPC compared the payment against the
-- *pre-tax* `order_total` — so every tax-bearing payment would report
-- `amount_mismatch` and the order would never be marked paid. That is the same
-- "customer paid, nothing recorded" failure this whole batch exists to remove,
-- arriving from a new direction.
--
-- This version takes the tax Square applied, stores it, folds it into
-- `order_total` so the reconciliation identity
--   subtotal − discount + shipping − shipping_discount + tax = order_total
-- still holds, and compares the payment against the tax-inclusive total.
--
-- The 5-argument version is dropped so there is exactly one entry point.
--
-- Idempotent: safe to re-run. Apply via the Supabase SQL editor or
-- `npx supabase db query --linked` — NOT `db push` (OCT-13).
-- -----------------------------------------------------------------------------

drop function if exists public.exp_mark_order_paid(uuid, text, bigint, timestamptz, text);

create or replace function public.exp_mark_order_paid(
  p_order_id          uuid,
  p_square_payment_id text,
  p_amount_cents      bigint,
  p_paid_at           timestamptz,
  p_source            text,
  p_tax_cents         bigint default 0
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order    record;
  v_tax      bigint;
  v_expected bigint;
begin
  select * into v_order
  from public.exp_orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'order_not_found');
  end if;

  -- Idempotent: Square retries, and so does a redelivery after a crash.
  if v_order.payment_status = 'paid' then
    return jsonb_build_object('ok', true, 'reason', 'already_paid');
  end if;

  v_tax      := greatest(0, coalesce(p_tax_cents, 0));
  v_expected := round(coalesce(v_order.order_total, 0) * 100)::bigint + v_tax;

  -- Never trust the webhook's amount: compare it to what we charged, tax
  -- included. Tips are excluded by the caller, which passes `amount_money`
  -- rather than `total_money`.
  if v_expected <> p_amount_cents then
    insert into public.exp_order_status_events (
      order_id, action_type, previous_status, next_status,
      previous_payment_status, next_payment_status, note, metadata, created_by
    ) values (
      p_order_id, 'payment_webhook', v_order.status, v_order.status,
      v_order.payment_status, v_order.payment_status,
      'Payment amount did not match the order total',
      jsonb_build_object(
        'expected_cents', v_expected,
        'received_cents', p_amount_cents,
        'tax_cents', v_tax
      ),
      p_source
    );

    return jsonb_build_object(
      'ok', false, 'reason', 'amount_mismatch',
      'expected_cents', v_expected, 'received_cents', p_amount_cents
    );
  end if;

  update public.exp_orders
  set payment_status    = 'paid',
      paid_at           = coalesce(paid_at, p_paid_at, now()),
      square_payment_id = coalesce(p_square_payment_id, square_payment_id),
      -- Square's tax is part of what the customer actually paid, so it belongs
      -- in both columns or the stored order stops reconciling.
      tax_amount        = round(v_tax / 100.0, 2),
      order_total       = round(coalesce(order_total, 0) + v_tax / 100.0, 2),
      -- Only advance from awaiting_payment: a late event must never regress
      -- shipped/delivered, nor resurrect a cancelled order.
      status            = case when status = 'awaiting_payment' then 'paid' else status end,
      updated_at        = now()
  where id = p_order_id;

  insert into public.exp_order_status_events (
    order_id, action_type, previous_status, next_status,
    previous_payment_status, next_payment_status, note, metadata, created_by
  ) values (
    p_order_id, 'payment_webhook', v_order.status,
    case when v_order.status = 'awaiting_payment' then 'paid' else v_order.status end,
    v_order.payment_status, 'paid',
    'Payment confirmed by Square',
    jsonb_build_object(
      'amount_cents', p_amount_cents,
      'tax_cents', v_tax,
      'square_payment_id', p_square_payment_id
    ),
    p_source
  );

  return jsonb_build_object(
    'ok', true,
    'reason', 'marked_paid',
    'was_cancelled', v_order.status = 'cancelled'
  );
end;
$$;

comment on function public.exp_mark_order_paid(uuid, text, bigint, timestamptz, text, bigint) is
  'OCT #4/#35: the single transactional way an order becomes paid. Idempotent, amount-checked (tax-inclusive), never regresses the fulfilment status, and does not reserve inventory (#12 reserves at checkout).';

revoke execute on function public.exp_mark_order_paid(uuid, text, bigint, timestamptz, text, bigint) from public, anon, authenticated;
grant execute on function public.exp_mark_order_paid(uuid, text, bigint, timestamptz, text, bigint) to service_role;
