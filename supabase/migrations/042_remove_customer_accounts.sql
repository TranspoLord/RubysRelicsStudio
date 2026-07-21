-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 042: Remove customer accounts entirely
--
-- Architectural decision: Customer accounts add significant security surface
-- (password storage, session management, reset flows, CSRF on profile/logout)
-- and data-storage cost, while providing minimal value for a storefront where
-- Square handles order management and cart memory lives in localStorage.
--
-- This migration drops all customer-account tables and nulls out optional
-- customer_id references on surviving tables. Customer-facing features
-- (newsletter, back-in-stock, cart capture, custom orders, order tracking)
-- operate by email + guest tokens only.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop tables with CASCADE dependencies (order matters: dependents first)
DROP TABLE IF EXISTS exp_wishlists CASCADE;
DROP TABLE IF EXISTS exp_customer_addresses CASCADE;
DROP TABLE IF EXISTS exp_password_reset_tokens CASCADE;
DROP TABLE IF EXISTS exp_customer_sessions CASCADE;
DROP TABLE IF EXISTS exp_recently_viewed CASCADE;
DROP TABLE IF EXISTS exp_customers CASCADE;

-- Null out optional customer_id references on surviving tables.
-- These features already work by email; the customer link was a convenience.
ALTER TABLE exp_orders DROP COLUMN IF EXISTS customer_id;
ALTER TABLE exp_custom_requests DROP COLUMN IF EXISTS customer_id;
ALTER TABLE exp_newsletter_subscribers DROP COLUMN IF EXISTS customer_id;
ALTER TABLE exp_back_in_stock_alerts DROP COLUMN IF EXISTS customer_id;
ALTER TABLE exp_capacity_reopen_alerts DROP COLUMN IF EXISTS customer_id;

-- Drop the old recently-viewed migration file's table if it somehow still exists
-- (covered above, but explicit for clarity)
-- exp_recently_viewed already dropped above.