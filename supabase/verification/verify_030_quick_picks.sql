-- ─────────────────────────────────────────────────────────────────────────────
-- Verification script: Migration 030 — Homepage quick-pick sections
--                       + process_type taxonomy + join table
--
-- Run in the Supabase SQL editor (or psql) after applying migration 030.
-- Each section is a self-contained query. The final DO block raises an
-- EXCEPTION on any hard failure so CI catches it immediately.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Taxonomy type check constraint includes 'process_type' ─────────────────
SELECT
  con.conname                    AS constraint_name,
  pg_get_constraintdef(con.oid)  AS definition
FROM pg_constraint con
JOIN pg_class     rel ON rel.oid = con.conrelid
JOIN pg_namespace ns  ON ns.oid  = rel.relnamespace
WHERE ns.nspname  = 'public'
  AND rel.relname = 'exp_taxonomy'
  AND con.conname = 'exp_taxonomy_type_check';
-- Expected: definition contains 'process_type'

-- ── 2. Process type taxonomy rows ────────────────────────────────────────────
SELECT
  key,
  display_name,
  slug,
  type,
  visible,
  emoji,
  glow_color,
  tagline
FROM exp_taxonomy
WHERE type = 'process_type'
ORDER BY sort_order;
-- Expected: 3 rows — engraving_cutting, printing, sublimation (all visible = true)

-- ── 3. exp_product_process_types table structure ──────────────────────────────
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'exp_product_process_types'
ORDER BY ordinal_position;
-- Expected: product_id (uuid, NO), process_type_key (text, NO)

-- ── 4. Indexes on exp_product_process_types ───────────────────────────────────
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename  = 'exp_product_process_types'
ORDER BY indexname;
-- Expected: primary key + idx_exp_product_process_types_product + idx_exp_product_process_types_key

-- ── 5. RLS status on exp_product_process_types ────────────────────────────────
SELECT
  c.relname           AS table_name,
  c.relrowsecurity    AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class     c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname  = 'public'
  AND c.relname  = 'exp_product_process_types';
-- Expected: rls_enabled = true

-- ── 6. RLS policies on exp_product_process_types ─────────────────────────────
SELECT
  policyname,
  cmd,
  roles,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'exp_product_process_types'
ORDER BY policyname;
-- Expected: "public read product process types" — SELECT — {anon,authenticated} — (true)

-- ── 7. Homepage section rows exist ───────────────────────────────────────────
SELECT
  section_key,
  is_visible,
  sort_order,
  jsonb_typeof(content)                          AS content_type,
  content ->> 'heading'                          AS heading,
  jsonb_array_length(content -> 'items')         AS item_count
FROM exp_homepage_sections
WHERE section_key IN ('quick_picks', 'process_picks')
ORDER BY sort_order;
-- Expected: 2 rows
--   quick_picks   | true | 12 | object | "What are you here for?!" | 3
--   process_picks | true | 13 | object | "Start with the action!"  | 3

-- ── 8. Homepage section items are well-formed ─────────────────────────────────
SELECT
  section_key,
  item ->> 'key'       AS item_key,
  item ->> 'label'     AS label,
  item ->> 'emoji'     AS emoji,
  item ->> 'href'      AS href,
  (item ->> 'is_visible')::boolean AS is_visible
FROM exp_homepage_sections
CROSS JOIN LATERAL jsonb_array_elements(content -> 'items') AS item
WHERE section_key IN ('quick_picks', 'process_picks')
ORDER BY section_key, (item ->> 'sort_order')::int;
-- Expected: 6 rows total — all is_visible = true, all hrefs start with '/'

-- ── 9. process_picks hrefs match process type keys ────────────────────────────
SELECT
  item ->> 'key'  AS tile_key,
  item ->> 'href' AS href,
  t.key           AS taxonomy_key,
  t.display_name
FROM exp_homepage_sections s
CROSS JOIN LATERAL jsonb_array_elements(s.content -> 'items') AS item
LEFT JOIN exp_taxonomy t
  ON t.key = (item ->> 'key')
 AND t.type = 'process_type'
WHERE s.section_key = 'process_picks'
ORDER BY (item ->> 'sort_order')::int;
-- Expected: all 3 rows have a matching taxonomy_key (not null)

-- ── 10. sort_orders — quick_picks/process_picks slot between hero and order_paths
SELECT
  section_key,
  sort_order
FROM exp_homepage_sections
WHERE section_key IN ('hero', 'order_paths', 'quick_picks', 'process_picks')
ORDER BY sort_order;
-- Expected order: hero(10) → quick_picks(12) → process_picks(13) → order_paths(20)

-- ─────────────────────────────────────────────────────────────────────────────
-- Hard-fail assertions — raises EXCEPTION on any violation
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count  integer;
  v_def    text;
BEGIN

  -- 1) Taxonomy constraint must include 'process_type'
  SELECT pg_get_constraintdef(con.oid) INTO v_def
  FROM pg_constraint con
  JOIN pg_class     rel ON rel.oid = con.conrelid
  JOIN pg_namespace ns  ON ns.oid  = rel.relnamespace
  WHERE ns.nspname  = 'public'
    AND rel.relname = 'exp_taxonomy'
    AND con.conname = 'exp_taxonomy_type_check';

  IF v_def IS NULL OR position('process_type' IN v_def) = 0 THEN
    RAISE EXCEPTION
      'FAIL: exp_taxonomy type check constraint does not include ''process_type''. Got: %', v_def;
  END IF;

  -- 2) All three process_type taxonomy rows must exist
  SELECT COUNT(*) INTO v_count
  FROM exp_taxonomy
  WHERE type = 'process_type'
    AND key IN ('engraving_cutting', 'printing', 'sublimation')
    AND visible = true;

  IF v_count <> 3 THEN
    RAISE EXCEPTION
      'FAIL: Expected 3 visible process_type taxonomy rows, found %.', v_count;
  END IF;

  -- 3) exp_product_process_types table must exist
  SELECT COUNT(*) INTO v_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name   = 'exp_product_process_types';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: exp_product_process_types table does not exist.';
  END IF;

  -- 4) RLS must be enabled on exp_product_process_types
  SELECT COUNT(*) INTO v_count
  FROM pg_class     c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname       = 'public'
    AND c.relname        = 'exp_product_process_types'
    AND c.relrowsecurity = true;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: RLS is not enabled on exp_product_process_types.';
  END IF;

  -- 5) Public read policy must exist on exp_product_process_types
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'exp_product_process_types'
    AND cmd        = 'SELECT';

  IF v_count < 1 THEN
    RAISE EXCEPTION
      'FAIL: No SELECT policy found on exp_product_process_types.';
  END IF;

  -- 6) Both homepage section rows must exist with correct sort_orders
  SELECT COUNT(*) INTO v_count
  FROM exp_homepage_sections
  WHERE section_key IN ('quick_picks', 'process_picks')
    AND is_visible   = true
    AND sort_order  BETWEEN 11 AND 19;  -- must sit between hero(10) and order_paths(20)

  IF v_count <> 2 THEN
    RAISE EXCEPTION
      'FAIL: Expected 2 visible homepage section rows (quick_picks, process_picks) with sort_order 11–19, found %.', v_count;
  END IF;

  -- 7) Each section must have exactly 3 visible items
  SELECT COUNT(*) INTO v_count
  FROM exp_homepage_sections s
  CROSS JOIN LATERAL jsonb_array_elements(s.content -> 'items') AS item
  WHERE s.section_key IN ('quick_picks', 'process_picks')
    AND (item ->> 'is_visible')::boolean = true;

  IF v_count <> 6 THEN
    RAISE EXCEPTION
      'FAIL: Expected 6 visible tile items across quick_picks + process_picks, found %.', v_count;
  END IF;

  -- 8) All item hrefs must be relative (start with '/')
  SELECT COUNT(*) INTO v_count
  FROM exp_homepage_sections s
  CROSS JOIN LATERAL jsonb_array_elements(s.content -> 'items') AS item
  WHERE s.section_key IN ('quick_picks', 'process_picks')
    AND (item ->> 'href') NOT LIKE '/%';

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'FAIL: Found % tile item(s) with non-relative href values.', v_count;
  END IF;

  -- 9) process_picks tile keys must all match existing process_type taxonomy entries
  SELECT COUNT(*) INTO v_count
  FROM exp_homepage_sections s
  CROSS JOIN LATERAL jsonb_array_elements(s.content -> 'items') AS item
  LEFT JOIN exp_taxonomy t
         ON t.key  = (item ->> 'key')
        AND t.type = 'process_type'
  WHERE s.section_key = 'process_picks'
    AND t.key IS NULL;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'FAIL: % process_picks tile(s) have a key that does not match any process_type taxonomy entry.', v_count;
  END IF;

  RAISE NOTICE 'All migration 030 assertions passed.';

END $$;
