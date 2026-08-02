-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 052: Add description column to bulk discounts
--
-- Adds a nullable `description` column to exp_product_bulk_discounts so
-- merchants can show a short customer-facing note under the price in the
-- storefront product preview (e.g. "Mix & match any design").
--
-- Also re-asserts the step_qty column and stepped discount_type from
-- migration 051 as an idempotent safety net in case 051 was not applied.
-- ─────────────────────────────────────────────────────────────────────────────

-- Safety net: ensure step_qty exists (from migration 051)
ALTER TABLE exp_product_bulk_discounts
  ADD COLUMN IF NOT EXISTS step_qty integer
  CHECK (step_qty IS NULL OR step_qty > 0);

-- Safety net: ensure 'stepped' is an allowed discount_type (from migration 051)
ALTER TABLE exp_product_bulk_discounts DROP CONSTRAINT IF EXISTS exp_product_bulk_discounts_discount_type_check;
ALTER TABLE exp_product_bulk_discounts ADD CONSTRAINT exp_product_bulk_discounts_discount_type_check
  CHECK (discount_type IN ('percent', 'fixed_amount', 'unit_price', 'stepped'));

-- Add description column (customer-facing note shown under the price)
ALTER TABLE exp_product_bulk_discounts
  ADD COLUMN IF NOT EXISTS description text;