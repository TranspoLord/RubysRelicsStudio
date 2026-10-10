-- -----------------------------------------------------------------------------
-- Migration 074: mark-order-paid RPC + webhook bookkeeping (OCT #4, #21)
--
-- `#4`: the Square webhook marked an order paid without ever reading
-- `payment.status`, and did it with an unguarded update. This adds the single
-- transactional entry point the handler should call instead: it locks the row,
-- refuses a mismatched amount, is idempotent, and never regresses the
-- fulfilment status.
--
-- Nothing calls it yet — the handler rewrite is a coordinated deploy (see the
-- `#4` note in OCT_IMPLEMENTATION_PLAN.md), so this migration is safe on its own.
--
-- `#21`: widens `exp_order_status_events.action_type`. `tracking_update`,
-- `payment_webhook`, `expired` and `refund_webhook` are all written by code and
-- were rejected by the CHECK, so those events were silently dropped.
--
-- Idempotent: safe to re-run. Apply via the Supabase SQL editor or
-- `npx supabase db query --linked` — NOT `db push` (OCT-13).
-- -----------------------------------------------------------------------------

-- ── 1. Status-event action types (#21) ───────────────────────────────────────
alter table public.exp_order_status_events
  drop constraint if exists exp_order_status_events_action_type_check;

alter table public.exp_order_status_events
  add constraint exp_order_status_events_action_type_check
  check (action_type in (
    'status_transition',
    'cancel',
    'refund_marked',
    'note',
    'schedule_hook',
    'hook_completed',
    'tracking_update',
    'payment_webhook',
    'expired',
    'refund_webhook'
  )) not valid;

alter table public.exp_order_status_events
  validate constraint exp_order_status_events_action_type_check;

-- ── 2. Refund bookkeeping ────────────────────────────────────────────────────
alter table public.exp_orders
  add column if not exists refunded_amount numeric(10, 2);

comment on column public.exp_orders.refunded_amount is
  'OCT #4: the amount refunded by Square, so a partial refund is distinguishable from a full one.';

-- ── 3. exp_mark_order_paid — the only way an order becomes paid ──────────────
create or replace function public.exp_mark_order_paid(
  p_order_id          uuid,
  p_square_payment_id text,
  p_amount_cents      bigint,
  p_paid_at           timestamptz,
  p_source            text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order    record;
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

  v_expected := round(coalesce(v_order.order_total, 0) * 100)::bigint;

  -- Never trust the webhook's amount: compare it to what we charged. Tips are
  -- excluded by the caller, which passes `amount_money`, not `total_money`.
  if v_expected <> p_amount_cents then
    insert into public.exp_order_status_events (
      order_id, action_type, previous_status, next_status,
      previous_payment_status, next_payment_status, note, metadata, created_by
    ) values (
      p_order_id, 'payment_webhook', v_order.status, v_order.status,
      v_order.payment_status, v_order.payment_status,
      'Payment amount did not match the order total',
      jsonb_build_object('expected_cents', v_expected, 'received_cents', p_amount_cents),
      p_source
    );

    return jsonb_build_object(
      'ok', false, 'reason', 'amount_mismatch',
      'expected_cents', v_expected, 'received_cents', p_amount_cents
    );
  end if;

  update public.exp_orders
  set payment_status      = 'paid',
      paid_at             = coalesce(paid_at, p_paid_at, now()),
      square_payment_id   = coalesce(p_square_payment_id, square_payment_id),
      -- Only advance from awaiting_payment: a late event must never regress
      -- shipped/delivered, nor resurrect a cancelled order.
      status              = case when status = 'awaiting_payment' then 'paid' else status end,
      updated_at          = now()
  where id = p_order_id;

  insert into public.exp_order_status_events (
    order_id, action_type, previous_status, next_status,
    previous_payment_status, next_payment_status, note, metadata, created_by
  ) values (
    p_order_id, 'payment_webhook', v_order.status,
    case when v_order.status = 'awaiting_payment' then 'paid' else v_order.status end,
    v_order.payment_status, 'paid',
    'Payment confirmed by Square',
    jsonb_build_object('amount_cents', p_amount_cents, 'square_payment_id', p_square_payment_id),
    p_source
  );

  return jsonb_build_object(
    'ok', true,
    'reason', 'marked_paid',
    'was_cancelled', v_order.status = 'cancelled'
  );
end;
$$;

comment on function public.exp_mark_order_paid(uuid, text, bigint, timestamptz, text) is
  'OCT #4: the single transactional way an order becomes paid. Idempotent, amount-checked, never regresses the fulfilment status, and does not reserve inventory (#12 reserves at checkout).';

-- ── 4. Service-role only (#3) ────────────────────────────────────────────────
revoke execute on function public.exp_mark_order_paid(uuid, text, bigint, timestamptz, text) from public, anon, authenticated;
grant execute on function public.exp_mark_order_paid(uuid, text, bigint, timestamptz, text) to service_role;
