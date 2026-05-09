-- Migration 012: Recently viewed products tracking
-- Track products viewed by customers (authenticated only)

CREATE TABLE exp_recently_viewed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES exp_customers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES exp_products(id) ON DELETE CASCADE,
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(customer_id, product_id)
);

-- Index for fast queries
CREATE INDEX idx_recently_viewed_customer_id ON exp_recently_viewed(customer_id, viewed_at DESC);

-- Keep only the 50 most recent viewed products per customer
-- We could implement this with a trigger in production, but for now it's handled via API

-- Enable RLS
ALTER TABLE exp_recently_viewed ENABLE ROW LEVEL SECURITY;

-- Policy: customers can only view their own
CREATE POLICY "Customers can view own recently viewed" ON exp_recently_viewed
  FOR SELECT
  USING (customer_id = auth.uid());
