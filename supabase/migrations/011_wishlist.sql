-- Migration 011: Wishlist system
-- Allows authenticated customers to save products for later

-- Create wishlists table
CREATE TABLE exp_wishlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES exp_customers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES exp_products(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(customer_id, product_id)
);

-- Index for fast queries by customer
CREATE INDEX idx_wishlists_customer_id ON exp_wishlists(customer_id);
CREATE INDEX idx_wishlists_product_id ON exp_wishlists(product_id);

-- Enable RLS for wishlists
ALTER TABLE exp_wishlists ENABLE ROW LEVEL SECURITY;

-- Policy: customers can only view their own wishlists
CREATE POLICY "Customers can view own wishlists" ON exp_wishlists
  FOR SELECT
  USING (customer_id = auth.uid());

-- Policy: admin can view all (via service role)
-- Service role bypasses RLS by default
