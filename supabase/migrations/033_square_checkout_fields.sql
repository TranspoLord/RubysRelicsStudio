-- Add Square checkout fields to products
-- Allows per-product Square variant linking for payment processing

ALTER TABLE exp_products
ADD COLUMN IF NOT EXISTS square_variant_id TEXT,
ADD COLUMN IF NOT EXISTS is_square_enabled BOOLEAN DEFAULT FALSE;

-- Create index for quick lookup of Square-enabled products
CREATE INDEX IF NOT EXISTS idx_exp_products_square_enabled
ON exp_products (is_square_enabled)
WHERE is_square_enabled = TRUE;