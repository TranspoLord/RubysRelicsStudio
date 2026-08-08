-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 054: Add updated_at columns to product options tables
--
-- The exp_product_options and exp_product_option_values tables were created
-- in migration 002 WITHOUT an updated_at column (only created_at).
--
-- However, schema_repair.sql (and the trigger function exp_set_updated_at())
-- create BEFORE UPDATE triggers on these tables that set new.updated_at = now().
-- When the admin PUT endpoints update a row, the trigger fires and fails with:
--   record "new" has no field "updated_at"
--
-- This migration adds the missing updated_at columns so the triggers work.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── exp_product_options ───────────────────────────────────────────────────────
alter table exp_product_options
  add column if not exists updated_at timestamptz not null default now();

-- ── exp_product_option_values ─────────────────────────────────────────────────
alter table exp_product_option_values
  add column if not exists updated_at timestamptz not null default now();

-- Backfill existing rows with current timestamp (default now() already handles
-- new rows; this ensures existing rows have a sensible value).
update exp_product_options
  set updated_at = now()
  where updated_at is null;

update exp_product_option_values
  set updated_at = now()
  where updated_at is null;