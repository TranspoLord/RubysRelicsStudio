-- Preserve immutable add-on definitions at checkout time.
-- This prevents historical orders from changing meaning when admins edit product options later.

alter table if exists exp_order_items
  add column if not exists option_snapshot jsonb not null default '{}'::jsonb;

comment on column exp_order_items.option_snapshot is
  'Frozen option metadata captured at checkout: label, type, selected value label, price delta, and required flag.';
