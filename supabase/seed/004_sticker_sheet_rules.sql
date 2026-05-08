-- ─────────────────────────────────────────────────────────────────────────────
-- Seed 004: Sticker sheet-only rules + size guidance values
-- Run after seeds 003 and migration 004.
-- Purpose:
-- - Disable die-cut sticker product (sheet-only storefront)
-- - Enforce sticker size type choices for sheets
-- - Set laminate add-ons to $1 each
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Sheet-only: disable die-cut SKU if present
update exp_products
set is_active = false, is_archived = true, updated_at = now()
where slug = 'custom-die-cut-sticker';

-- 2) Keep sheet product active and update naming/copy
update exp_products
set
  title = 'Custom Sticker Sheet',
  short_description = 'Sheet-only sticker orders with matte, glossy, or holographic base finishes.',
  description = 'Sticker sheets only. Choose size type, base finish, and optional laminate. Final counts are guided by size and confirmed in proofing.',
  is_active = true,
  is_archived = false,
  is_customizable = true,
  is_ready_made = false,
  updated_at = now()
where slug = 'custom-sticker-sheet';

-- 3) Remove sheet variants (size type will be option-driven)
delete from exp_product_variants pv
using exp_products p
where pv.product_id = p.id
  and p.slug = 'custom-sticker-sheet';

-- 4) Ensure size-type option exists
with p as (
  select id from exp_products where slug = 'custom-sticker-sheet'
)
insert into exp_product_options
  (product_id, option_key, label, option_type, placeholder, help_text, is_required, sort_order)
select
  p.id,
  'sticker_size_type',
  'Sticker Size Type',
  'select',
  null,
  'Sheet-only product. Select target sticker size to estimate count per sheet.',
  true,
  1
from p
where not exists (
  select 1 from exp_product_options o
  where o.product_id = p.id and o.option_key = 'sticker_size_type'
);

-- Move existing options down so size type appears first
update exp_product_options o
set sort_order = o.sort_order + 1
from exp_products p
where o.product_id = p.id
  and p.slug = 'custom-sticker-sheet'
  and o.option_key in ('base_finish', 'laminate_addon', 'artwork_file', 'cut_notes')
  and o.sort_order < 2;

-- 5) Replace size-type values idempotently
with o as (
  select po.id
  from exp_product_options po
  join exp_products p on p.id = po.product_id
  where p.slug = 'custom-sticker-sheet'
    and po.option_key = 'sticker_size_type'
)
delete from exp_product_option_values
where option_id in (select id from o);

with o as (
  select po.id
  from exp_product_options po
  join exp_products p on p.id = po.product_id
  where p.slug = 'custom-sticker-sheet'
    and po.option_key = 'sticker_size_type'
)
insert into exp_product_option_values (option_id, label, value, price_delta, sort_order)
select o.id, v.label, v.value, v.price_delta, v.sort_order
from o,
(values
  ('1" x 1"', '1x1', 0.00, 1),
  ('2" x 2"', '2x2', 0.00, 2),
  ('3" x 3"', '3x3', 0.00, 3),
  ('4" x 4"', '4x4', 0.00, 4),
  ('Custom Size', 'custom', 0.00, 5)
) as v(label, value, price_delta, sort_order);

-- 6) Set laminate add-on values to $1 for matte/glossy
with o as (
  select po.id
  from exp_product_options po
  join exp_products p on p.id = po.product_id
  where p.slug = 'custom-sticker-sheet'
    and po.option_key = 'laminate_addon'
)
update exp_product_option_values pov
set
  price_delta = case
    when pov.value in ('matte_laminate', 'glossy_laminate') then 1.00
    else 0.00
  end,
  sort_order = case
    when pov.value = 'none' then 1
    when pov.value = 'matte_laminate' then 2
    when pov.value = 'glossy_laminate' then 3
    else pov.sort_order
  end
where pov.option_id in (select id from o);
