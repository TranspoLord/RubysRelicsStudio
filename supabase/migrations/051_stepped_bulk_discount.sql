-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 051: Add stepped bulk discount type
--
-- Adds a new discount_type 'stepped' and a step_qty column to
-- exp_product_bulk_discounts. This enables volume pricing where the
-- per-unit discount increases every X items.
--
-- Example: step_qty=10, discount_value=0.50
--   Qty 10: $0.50 off each → $5.00 total discount
--   Qty 20: $1.00 off each → $20.00 total discount
--   Qty 25: $1.00 off each (2 steps) → $25.00 total discount
--   Qty 30: $1.50 off each → $45.00 total discount
-- ─────────────────────────────────────────────────────────────────────────────

-- Add step_qty column (only used when discount_type = 'stepped')
ALTER TABLE exp_product_bulk_discounts
  ADD COLUMN IF NOT EXISTS step_qty integer
  CHECK (step_qty IS NULL OR step_qty > 0);

-- Expand discount_type check to include 'stepped'
ALTER TABLE exp_product_bulk_discounts DROP CONSTRAINT IF EXISTS exp_product_bulk_discounts_discount_type_check;
ALTER TABLE exp_product_bulk_discounts ADD CONSTRAINT exp_product_bulk_discounts_discount_type_check
  CHECK (discount_type IN ('percent', 'fixed_amount', 'unit_price', 'stepped'));