-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 053: Add length CHECK constraint on bulk discount description
--
-- Defense-in-depth: the admin discounts API already caps `description` at
-- 280 characters via `asOptionalString(body.description, 280)`, but a direct
-- DB insert (e.g., via Supabase dashboard or psql) could bypass that limit.
-- This CHECK constraint enforces the 280-char maximum at the database level.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop existing constraint if any (idempotent)
ALTER TABLE exp_product_bulk_discounts
  DROP CONSTRAINT IF EXISTS exp_product_bulk_discounts_description_length_check;

-- Add length constraint: description must be NULL or ≤ 280 characters
ALTER TABLE exp_product_bulk_discounts
  ADD CONSTRAINT exp_product_bulk_discounts_description_length_check
  CHECK (description IS NULL OR length(description) <= 280);