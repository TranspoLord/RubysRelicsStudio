-- Verify product processes implementation
-- Run this after applying migration 032_product_process_pricing.sql

-- 1. Check that the process pricing table exists and has correct structure
-- If this query returns no rows, the table may not exist yet
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'exp_product_process_pricing' 
ORDER BY ordinal_position;

-- 2. Check that the combo discounts table exists and has correct structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'exp_product_combo_discounts' 
ORDER BY ordinal_position;

-- 3. Check foreign key relationship to products
SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu 
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu 
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'exp_product_process_pricing' 
AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY kcu.column_name;

-- 4. Show existing process types
SELECT key, display_name, emoji
FROM exp_taxonomy 
WHERE type = 'process_type' 
ORDER BY sort_order;

-- 5. Check if backfill occurred (count rows in new table)
SELECT COUNT(*) as total_entries FROM exp_product_process_pricing;

-- 6. Verify RLS is enabled on both tables
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('exp_product_process_pricing', 'exp_product_combo_discounts');