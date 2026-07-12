-- Add embedded product designer fields
ALTER TABLE exp_products 
ADD COLUMN has_designer BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN designer_mockup_url TEXT;

-- Add size constraints to product options (for designer)
ALTER TABLE exp_product_options
ADD COLUMN min_width NUMERIC,
ADD COLUMN max_width NUMERIC,
ADD COLUMN min_height NUMERIC,
ADD COLUMN max_height NUMERIC;

-- Add color constraint for text options (optional)
ALTER TABLE exp_product_options
ADD COLUMN allowed_colors TEXT[]; -- array of hex colors like '{"#FFFFFF", "#000000"}'