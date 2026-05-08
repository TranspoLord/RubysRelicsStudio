-- ─────────────────────────────────────────────────────────────────────────────
-- Seed 003: Sticker catalog + laminate options + bulk pricing tiers
-- Run after migrations 001, 002, and 004.
-- ─────────────────────────────────────────────────────────────────────────────

-- Category: Stickers
insert into exp_taxonomy
  (key, display_name, slug, type, visible, sort_order, emoji, gradient, glow_color, tagline, how_it_works_anchor)
values
  (
    'stickers',
    'Stickers',
    'stickers',
    'category',
    true,
    7,
    '🧷',
    'linear-gradient(135deg, #1A1A1F 0%, #2C2A30 100%)',
    '#A0A0B0',
    'Matte, glossy, and holographic sticker builds.',
    '#production'
  )
on conflict (key) do update
set
  display_name = excluded.display_name,
  slug = excluded.slug,
  type = excluded.type,
  visible = excluded.visible,
  sort_order = excluded.sort_order,
  emoji = excluded.emoji,
  gradient = excluded.gradient,
  glow_color = excluded.glow_color,
  tagline = excluded.tagline,
  how_it_works_anchor = excluded.how_it_works_anchor,
  updated_at = now();

-- Products
insert into exp_products
  (title, slug, short_description, description, category_key, base_price,
   is_ready_made, is_customizable, is_active, sort_order,
   production_estimate_band, how_it_works_anchor)
values
  (
    'Custom Die-Cut Sticker',
    'custom-die-cut-sticker',
    'Single die-cut stickers with your artwork, logo, or design.',
    'Custom contour-cut sticker prints with durable base stock options and optional laminate add-ons for extra protection.',
    'stickers',
    2.50,
    false,
    true,
    true,
    1,
    '2–4 business days',
    '#production'
  ),
  (
    'Custom Sticker Sheet',
    'custom-sticker-sheet',
    'Multiple kiss-cut stickers on one sheet, ready for packaging or merch tables.',
    'Sticker sheets configured with your selected base finish and optional laminate to match use case and durability requirements.',
    'stickers',
    9.00,
    false,
    true,
    true,
    2,
    '2–4 business days',
    '#production'
  )
on conflict (slug) do nothing;

-- Variants: Die-Cut size
with p as (select id from exp_products where slug = 'custom-die-cut-sticker')
insert into exp_product_variants (product_id, label, price_delta, sort_order)
select p.id, v.label, v.price_delta, v.sort_order
from p,
(values
  ('Small (2 in)', 0.00, 1),
  ('Medium (3 in)', 0.85, 2),
  ('Large (4 in)', 1.75, 3)
) as v(label, price_delta, sort_order)
on conflict do nothing;

-- Variants: Sheet size
with p as (select id from exp_products where slug = 'custom-sticker-sheet')
insert into exp_product_variants (product_id, label, price_delta, sort_order)
select p.id, v.label, v.price_delta, v.sort_order
from p,
(values
  ('Mini Sheet (4x6)', 0.00, 1),
  ('Standard Sheet (5x7)', 2.50, 2),
  ('Large Sheet (8.5x11)', 5.50, 3)
) as v(label, price_delta, sort_order)
on conflict do nothing;

-- Options: shared base + laminate + upload
with p as (
  select id from exp_products where slug in ('custom-die-cut-sticker','custom-sticker-sheet')
)
insert into exp_product_options (product_id, option_key, label, option_type, placeholder, help_text, is_required, sort_order)
select p.id, o.option_key, o.label, o.option_type, o.placeholder, o.help_text, o.is_required, o.sort_order
from p,
(values
  ('base_finish', 'Base Finish', 'select', null, null, true, 1),
  ('laminate_addon', 'Laminate Add-On', 'select', null, 'Adds protective top layer. Great for wear and weather resistance.', true, 2),
  ('artwork_file', 'Artwork File', 'file', null, 'PNG, SVG, PDF, or JPG. 300 DPI recommended for raster files.', true, 3),
  ('cut_notes', 'Cut Notes (optional)', 'textarea', 'Any contour, border, or white-keyline notes...', null, false, 4)
) as o(option_key, label, option_type, placeholder, help_text, is_required, sort_order)
on conflict do nothing;

-- Base finish values
with o as (
  select po.id
  from exp_product_options po
  join exp_products p on p.id = po.product_id
  where p.slug in ('custom-die-cut-sticker','custom-sticker-sheet')
    and po.option_key = 'base_finish'
)
insert into exp_product_option_values (option_id, label, value, price_delta, sort_order)
select o.id, v.label, v.value, v.price_delta, v.sort_order
from o,
(values
  ('Matte Base',        'matte_base',        0.00, 1),
  ('Glossy Base',       'glossy_base',       0.20, 2),
  ('Holographic Base',  'holographic_base',  0.75, 3)
) as v(label, value, price_delta, sort_order)
on conflict do nothing;

-- Laminate values
with o as (
  select po.id
  from exp_product_options po
  join exp_products p on p.id = po.product_id
  where p.slug in ('custom-die-cut-sticker','custom-sticker-sheet')
    and po.option_key = 'laminate_addon'
)
insert into exp_product_option_values (option_id, label, value, price_delta, sort_order)
select o.id, v.label, v.value, v.price_delta, v.sort_order
from o,
(values
  ('No Laminate',      'none',             0.00, 1),
  ('Matte Laminate',   'matte_laminate',   0.35, 2),
  ('Glossy Laminate',  'glossy_laminate',  0.35, 3)
) as v(label, value, price_delta, sort_order)
on conflict do nothing;

-- Media placeholders
with p as (select id, slug from exp_products where slug in ('custom-die-cut-sticker','custom-sticker-sheet'))
insert into exp_product_media (product_id, alt, emoji, gradient, is_featured, sort_order)
select p.id,
  case p.slug
    when 'custom-die-cut-sticker' then 'Custom die-cut sticker'
    when 'custom-sticker-sheet' then 'Custom sticker sheet'
  end,
  '🧷',
  'linear-gradient(135deg, #1D1B22 0%, #302B3A 45%, #1A1820 100%)',
  true,
  1
from p
on conflict do nothing;

-- Bulk tiers: Die-cut (admin-configurable rows)
with p as (select id from exp_products where slug = 'custom-die-cut-sticker')
insert into exp_product_bulk_discounts
  (product_id, min_qty, max_qty, discount_type, discount_value, label, is_enabled, sort_order)
select p.id, v.min_qty, v.max_qty, v.discount_type, v.discount_value, v.label, true, v.sort_order
from p,
(values
  (10, 24, 'percent', 5.00,  'Starter bulk', 1),
  (25, 49, 'percent', 10.00, 'Small run',    2),
  (50, 99, 'percent', 15.00, 'Shop run',     3),
  (100, null, 'percent', 20.00, 'Large run', 4)
) as v(min_qty, max_qty, discount_type, discount_value, label, sort_order)
on conflict do nothing;

-- Bulk tiers: Sticker sheet
with p as (select id from exp_products where slug = 'custom-sticker-sheet')
insert into exp_product_bulk_discounts
  (product_id, min_qty, max_qty, discount_type, discount_value, label, is_enabled, sort_order)
select p.id, v.min_qty, v.max_qty, v.discount_type, v.discount_value, v.label, true, v.sort_order
from p,
(values
  (5, 14, 'percent', 5.00,  'Bundle',      1),
  (15, 29, 'percent', 10.00, 'Booth stock', 2),
  (30, null, 'percent', 15.00, 'Wholesale prep', 3)
) as v(min_qty, max_qty, discount_type, discount_value, label, sort_order)
on conflict do nothing;
