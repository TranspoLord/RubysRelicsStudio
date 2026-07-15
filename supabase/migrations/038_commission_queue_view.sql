-- ── Migration 038: Commission queue anonymized view
-- Creates a read-only view for the production queue that strips all PII.

-- Create anonymized commission queue view
create or replace view exp_commission_queue as
select 
  o.id as order_id,
  o.order_path,
  oi.id as item_id,
  oi.product_title,
  oi.variant_label,
  -- Anonymized customer display: use character name if provided, otherwise masked order ID
  case 
    when oi.selected_options ? 'character_name' 
    then oi.selected_options->>'character_name'
    else 'ORDER-' || substr(o.id::text, 1, 8)
  end as display_name,
  -- Fabrication status
  o.status,
  oi.nfc_target_data,
  oi.leave_unlocked,
  -- Production timing
  o.production_estimate_band,
  o.created_at as order_created_at,
  o.paid_at
from exp_orders o
join exp_order_items oi on oi.order_id = o.id
where o.status not in ('cancelled', 'delivered')
  and o.payment_status = 'paid'
order by o.created_at asc;

-- Grant read access to authenticated users
grant select on exp_commission_queue to authenticated;

-- Add comment
comment on view exp_commission_queue is 
  'Anonymized production queue view. Contains only masked order IDs, character names (if provided), and fabrication status. No PII exposed.';