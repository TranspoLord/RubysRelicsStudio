-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 050: Custom requests Square integration fixes
--
-- This migration fixes several critical issues in the custom requests system:
--
-- 1. Adds square_payment_link_id and square_payment_link_url columns to
--    exp_custom_requests (the PATCH route writes to these but they don't exist)
-- 2. Adds square_order_id, square_payment_id, customer_email, and
--    guest_tracking_token columns to exp_orders (used by shop checkout and
--    the Square webhook, but never created by a migration)
-- 3. Adds a payment_mode value 'square_payment_link' to exp_orders
-- 4. Creates a trigger that automatically sets exp_custom_requests.status
--    to 'paid' when a linked exp_orders row is marked as paid
-- 5. Adds an index on exp_orders.square_order_id for webhook lookups
-- 6. Adds an index on exp_orders.custom_request_id for handoff lookups
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Add Square payment link columns to exp_custom_requests ─────────────────
-- The PATCH /api/custom-orders/[id] route writes square_payment_link_id and
-- square_payment_link_url, but no migration ever created these columns.
-- The old stripe_payment_link_id/url columns are kept for backward compat.
ALTER TABLE exp_custom_requests
  ADD COLUMN IF NOT EXISTS square_payment_link_id text,
  ADD COLUMN IF NOT EXISTS square_payment_link_url text;

-- ── 2. Add missing columns to exp_orders ──────────────────────────────────────
-- These columns are used by the shop checkout route and the Square webhook
-- but were never created by a migration. They were likely added manually.
ALTER TABLE exp_orders
  ADD COLUMN IF NOT EXISTS square_order_id text,
  ADD COLUMN IF NOT EXISTS square_payment_id text,
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS guest_tracking_token text;

-- ── 3. Expand payment_mode check to include square_payment_link ───────────────
-- The original check only allows 'stripe_checkout' and 'stripe_payment_link'.
-- We need 'square_payment_link' for custom request quotes.
ALTER TABLE exp_orders DROP CONSTRAINT IF EXISTS exp_orders_payment_mode_check;
ALTER TABLE exp_orders ADD CONSTRAINT exp_orders_payment_mode_check
  CHECK (payment_mode IN ('stripe_checkout', 'stripe_payment_link', 'square_payment_link'));

-- ── 4. Indexes for webhook and handoff lookups ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_exp_orders_square_order_id
  ON exp_orders(square_order_id)
  WHERE square_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exp_orders_custom_request
  ON exp_orders(custom_request_id)
  WHERE custom_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exp_orders_guest_token
  ON exp_orders(guest_tracking_token)
  WHERE guest_tracking_token IS NOT NULL;

-- ── 5. Trigger: auto-set exp_custom_requests.status = 'paid' when linked
--    order is marked as paid ───────────────────────────────────────────────────
-- The Square webhook updates exp_orders.payment_status = 'paid' but never
-- touches exp_custom_requests. This trigger bridges that gap so the admin
-- UI's "Handoff to Production" button (which requires status = 'paid')
-- becomes usable.

CREATE OR REPLACE FUNCTION exp_mark_custom_request_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only act when payment_status transitions TO 'paid'
  -- and the order is linked to a custom request
  IF NEW.payment_status = 'paid'
     AND OLD.payment_status <> 'paid'
     AND NEW.custom_request_id IS NOT NULL
  THEN
    UPDATE exp_custom_requests
      SET status = 'paid',
          updated_at = now()
      WHERE id = NEW.custom_request_id
        AND status IN ('quote_sent', 'awaiting_quote');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_exp_orders_mark_custom_request_paid
  ON exp_orders;

CREATE TRIGGER trg_exp_orders_mark_custom_request_paid
  AFTER UPDATE OF payment_status ON exp_orders
  FOR EACH ROW
  EXECUTE FUNCTION exp_mark_custom_request_paid();