-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 034: Split engraving_cutting into separate engraving and cutting process types
--
-- Changes:
--   1. Add 'engraving' and 'cutting' as separate process_type taxonomy entries
--   2. Mark 'engraving_cutting' as invisible (for backward compatibility)
--   3. Migrate existing engraving_cutting assignments to engraving
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Add separate process types ─────────────────────────────────────────────────

insert into exp_taxonomy
  (key, display_name, slug, type, visible, sort_order, emoji, gradient, glow_color, tagline)
values
  (
    'engraving',
    'Engraving',
    'engraving',
    'process_type',
    true,
    1,
    '🔥',
    'linear-gradient(135deg, #1C0A00 0%, #3A1A00 60%, #1C0A00 100%)',
    '#C4921A',
    'Laser precision on wood, slate, acrylic, leather, and metal.'
  ),
  (
    'cutting',
    'Cutting',
    'cutting',
    'process_type',
    true,
    2,
    '✂️',
    'linear-gradient(135deg, #2A1A00 0%, #5A3A00 60%, #2A1A00 100%)',
    '#E8B84A',
    'Precision cutting for custom shapes and sizes.'
  )
on conflict (key) do nothing;

-- ── 2. Mark the combined engraving_cutting as invisible ────────────────────────
-- This keeps it in the database for backward compatibility but hides it from UI

update exp_taxonomy
set visible = false
where key = 'engraving_cutting'
  and type = 'process_type';

-- ── 3. Update sort orders for existing process types ───────────────────────────

update exp_taxonomy
set sort_order = 3
where key = 'printing';

update exp_taxonomy
set sort_order = 4
where key = 'sublimation';

-- ── Note: Existing products assigned to engraving_cutting should be manually
-- reviewed. By default, we do NOT auto-migrate them since we cannot know
-- which process they use. Admins will need to re-assign in the new Processes page.