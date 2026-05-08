-- ─────────────────────────────────────────────────────────────────────────────
-- Seed 002: Product catalog placeholder data
-- Run after migration 002.
-- Creates ~15 products across 6 categories, with variants and options.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- ENGRAVED DRINKWARE
-- ─────────────────────────────────────────────────────────────────────────────

insert into exp_products
  (title, slug, short_description, description, category_key, base_price,
   is_ready_made, is_customizable, is_active, sort_order,
   production_estimate_band, how_it_works_anchor)
values
  ('Custom Engraved Tumbler',
   'custom-engraved-tumbler',
   'Personalize a powder-coated tumbler with your name, monogram, or custom artwork.',
   'Our most popular piece. A powder-coated stainless steel tumbler laser-engraved with your design. Choose your size, submit your text or artwork, and we handle the rest. The engraving cuts through the coating to reveal gleaming metal beneath — high-contrast and built to last.',
   'engraved_drinkware', 24.00,
   false, true, true, 1,
   '3–5 business days', '#engraving'),

  ('Engraved Skinny Tumbler',
   'engraved-skinny-tumbler',
   'Sleek 20 oz skinny tumbler — perfect for coffee shops or daily carry.',
   'A slimmer silhouette that fits most standard cup holders. Powder-coated finish accepts deep laser engraving on the full wrap or a focused side panel. Great for monograms, team names, or simple line art.',
   'engraved_drinkware', 22.00,
   false, true, true, 2,
   '3–5 business days', '#engraving'),

  ('Engraved Water Bottle',
   'engraved-water-bottle',
   'Wide-mouth insulated water bottle with a custom engraved design.',
   'Stainless steel, double-walled, and built for adventure. The powder coating takes clean, precise engraving — submit a name, logo, or intricate pattern and we will take it from there.',
   'engraved_drinkware', 28.00,
   false, true, true, 3,
   '3–5 business days', '#engraving')
on conflict (slug) do nothing;

-- Variants: Custom Engraved Tumbler
with p as (select id from exp_products where slug = 'custom-engraved-tumbler')
insert into exp_product_variants (product_id, label, price_delta, sort_order)
select p.id, v.label, v.price_delta, v.sort_order
from p, (values
  ('20 oz',  0.00,  1),
  ('30 oz',  4.00,  2),
  ('40 oz',  6.00,  3)
) as v(label, price_delta, sort_order)
on conflict do nothing;

-- Variants: Skinny Tumbler
with p as (select id from exp_products where slug = 'engraved-skinny-tumbler')
insert into exp_product_variants (product_id, label, price_delta, sort_order)
select p.id, v.label, v.price_delta, v.sort_order
from p, (values
  ('12 oz', 0.00, 1),
  ('20 oz', 2.00, 2)
) as v(label, price_delta, sort_order)
on conflict do nothing;

-- Variants: Water Bottle
with p as (select id from exp_products where slug = 'engraved-water-bottle')
insert into exp_product_variants (product_id, label, price_delta, sort_order)
select p.id, v.label, v.price_delta, v.sort_order
from p, (values
  ('18 oz', 0.00, 1),
  ('32 oz', 5.00, 2)
) as v(label, price_delta, sort_order)
on conflict do nothing;

-- Options: Custom Engraved Tumbler
with p as (select id from exp_products where slug = 'custom-engraved-tumbler')
insert into exp_product_options (product_id, option_key, label, option_type, placeholder, help_text, is_required, sort_order)
select p.id, o.option_key, o.label, o.option_type, o.placeholder, o.help_text, o.is_required, o.sort_order
from p, (values
  ('engraving_text', 'Engraving Text', 'text',
   'e.g. "The Thornwood Family" or your monogram',
   'Leave blank if uploading custom artwork instead.',
   false, 1),
  ('artwork_file', 'Custom Artwork (optional)', 'file',
   null,
   'SVG, PNG, or JPG. Max 20 MB. We will contact you if the file needs adjustment.',
   false, 2),
  ('font_style', 'Font Style', 'select',
   null, null,
   false, 3),
  ('placement', 'Engraving Placement', 'select',
   null, null,
   true, 4)
) as o(option_key, label, option_type, placeholder, help_text, is_required, sort_order)
on conflict do nothing;

-- Option values: font_style
with o as (
  select po.id from exp_product_options po
  join exp_products p on p.id = po.product_id
  where p.slug = 'custom-engraved-tumbler' and po.option_key = 'font_style'
)
insert into exp_product_option_values (option_id, label, value, price_delta, sort_order)
select o.id, v.label, v.value, v.price_delta, v.sort_order
from o, (values
  ('Classic Serif',     'classic_serif',     0.00, 1),
  ('Modern Sans',       'modern_sans',        0.00, 2),
  ('Script / Cursive',  'script',             0.00, 3),
  ('Blackletter / Runic','blackletter',       0.00, 4),
  ('Custom (from file)','custom_from_file',   0.00, 5)
) as v(label, value, price_delta, sort_order)
on conflict do nothing;

-- Option values: placement
with o as (
  select po.id from exp_product_options po
  join exp_products p on p.id = po.product_id
  where p.slug = 'custom-engraved-tumbler' and po.option_key = 'placement'
)
insert into exp_product_option_values (option_id, label, value, price_delta, sort_order)
select o.id, v.label, v.value, v.price_delta, v.sort_order
from o, (values
  ('Front panel only',    'front_only',     0.00, 1),
  ('Full wrap (360°)',    'full_wrap',       8.00, 2),
  ('Opposite side panel', 'opposite_panel', 4.00, 3)
) as v(label, value, price_delta, sort_order)
on conflict do nothing;

-- Media: Engraved Drinkware products
with p as (select id, slug from exp_products where slug in ('custom-engraved-tumbler','engraved-skinny-tumbler','engraved-water-bottle'))
insert into exp_product_media (product_id, alt, emoji, gradient, is_featured, sort_order)
select p.id,
  case p.slug
    when 'custom-engraved-tumbler'  then 'Custom engraved tumbler'
    when 'engraved-skinny-tumbler'  then 'Engraved skinny tumbler'
    when 'engraved-water-bottle'    then 'Engraved water bottle'
  end,
  '🥤',
  'linear-gradient(135deg, #2A1800 0%, #4A2E00 40%, #3A2000 100%)',
  true, 1
from p
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- SUBLIMATED GIFTS
-- ─────────────────────────────────────────────────────────────────────────────

insert into exp_products
  (title, slug, short_description, description, category_key, base_price,
   is_ready_made, is_customizable, is_active, sort_order,
   production_estimate_band, how_it_works_anchor)
values
  ('Custom Sublimated Mug',
   'custom-sublimated-mug',
   'Full-color sublimation on a ceramic mug — your photo, artwork, or design.',
   'Ceramic blank treated for full dye-sublimation. The print bonds permanently into the coating — it will not peel, fade, or wash off. Upload your design or let us know what you have in mind.',
   'sublimated_gifts', 18.00,
   false, true, true, 1,
   '3–4 business days', '#sublimation'),

  ('Sublimated Coaster Set',
   'sublimated-coaster-set',
   'Set of 4 hardboard coasters with full-color sublimated designs.',
   'Four 3.75" hardboard coasters with full bleed color sublimation. Order with matching designs, mix patterns, or go fully custom — each coaster in the set can be different.',
   'sublimated_gifts', 26.00,
   false, true, true, 2,
   '3–4 business days', '#sublimation'),

  ('Custom Photo Ornament',
   'custom-photo-ornament',
   'Sublimated photo ornament — circle, star, or tree shape.',
   'Aluminum blanks with a glossy sublimation surface. Upload your favorite photo, artwork, or design. Comes with a satin ribbon for hanging. A perfect personalized gift year-round.',
   'sublimated_gifts', 14.00,
   false, true, true, 3,
   '2–3 business days', '#sublimation')
on conflict (slug) do nothing;

-- Variants: Sublimated Mug
with p as (select id from exp_products where slug = 'custom-sublimated-mug')
insert into exp_product_variants (product_id, label, price_delta, sort_order)
select p.id, v.label, v.price_delta, v.sort_order
from p, (values
  ('11 oz', 0.00, 1),
  ('15 oz', 3.00, 2)
) as v(label, price_delta, sort_order)
on conflict do nothing;

-- Options: Sublimated Mug
with p as (select id from exp_products where slug = 'custom-sublimated-mug')
insert into exp_product_options (product_id, option_key, label, option_type, placeholder, help_text, is_required, sort_order)
select p.id, o.option_key, o.label, o.option_type, o.placeholder, o.help_text, o.is_required, o.sort_order
from p, (values
  ('artwork_file', 'Upload Your Design', 'file',
   null,
   'PNG or JPG, 300 DPI or higher recommended. We will send a proof before production.',
   true, 1),
  ('design_notes', 'Design Notes', 'textarea',
   'Colors to match, text changes, positioning notes…',
   'Optional — leave blank if the file is print-ready.',
   false, 2),
  ('wrap_style', 'Wrap Style', 'select',
   null, null,
   true, 3)
) as o(option_key, label, option_type, placeholder, help_text, is_required, sort_order)
on conflict do nothing;

-- Option values: wrap_style
with o as (
  select po.id from exp_product_options po
  join exp_products p on p.id = po.product_id
  where p.slug = 'custom-sublimated-mug' and po.option_key = 'wrap_style'
)
insert into exp_product_option_values (option_id, label, value, price_delta, sort_order)
select o.id, v.label, v.value, v.price_delta, v.sort_order
from o, (values
  ('Full wrap (360°)',   'full_wrap',    0.00, 1),
  ('Single-side panel', 'single_panel', 0.00, 2)
) as v(label, value, price_delta, sort_order)
on conflict do nothing;

-- Variants: Ornament
with p as (select id from exp_products where slug = 'custom-photo-ornament')
insert into exp_product_variants (product_id, label, price_delta, sort_order)
select p.id, v.label, v.price_delta, v.sort_order
from p, (values
  ('Circle',    0.00, 1),
  ('Star',      0.00, 2),
  ('Christmas Tree', 0.00, 3)
) as v(label, price_delta, sort_order)
on conflict do nothing;

-- Media: Sublimated Gifts products
with p as (select id, slug from exp_products where slug in ('custom-sublimated-mug','sublimated-coaster-set','custom-photo-ornament'))
insert into exp_product_media (product_id, alt, emoji, gradient, is_featured, sort_order)
select p.id,
  case p.slug
    when 'custom-sublimated-mug'    then 'Custom sublimated mug'
    when 'sublimated-coaster-set'   then 'Sublimated coaster set'
    when 'custom-photo-ornament'    then 'Custom photo ornament'
  end,
  '☕',
  'linear-gradient(135deg, #1A0A2A 0%, #2E1A4A 40%, #1E0E36 100%)',
  true, 1
from p
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- SIGNS & DECOR
-- ─────────────────────────────────────────────────────────────────────────────

insert into exp_products
  (title, slug, short_description, description, category_key, base_price,
   is_ready_made, is_customizable, is_active, sort_order,
   production_estimate_band, how_it_works_anchor)
values
  ('Custom Engraved Wood Sign',
   'custom-engraved-wood-sign',
   'Personalized wood sign — names, quotes, family crests, or custom artwork.',
   'Baltic birch or basswood panels laser engraved with deep, clean precision. Perfect for home décor, wedding gifts, or business signage. Comes unfinished (ready to stain or paint) or with a natural clear-coat.',
   'signs_and_decor', 32.00,
   false, true, true, 1,
   '4–6 business days', '#engraving'),

  ('Engraved Slate Sign',
   'engraved-slate-sign',
   'Natural slate tile engraved with your design — rustic and weighty.',
   'Genuine slate accepts crisp laser engraving with striking natural contrast. A grounding piece for kitchens, bars, entryways, or outdoor spaces. Each piece is unique — natural variation in the stone is part of the charm.',
   'signs_and_decor', 28.00,
   false, true, true, 2,
   '3–5 business days', '#engraving')
on conflict (slug) do nothing;

-- Variants: Wood Sign
with p as (select id from exp_products where slug = 'custom-engraved-wood-sign')
insert into exp_product_variants (product_id, label, price_delta, sort_order)
select p.id, v.label, v.price_delta, v.sort_order
from p, (values
  ('Small (6" × 8")',   0.00, 1),
  ('Medium (8" × 10")', 8.00, 2),
  ('Large (12" × 16")', 18.00, 3)
) as v(label, price_delta, sort_order)
on conflict do nothing;

-- Options: Wood Sign
with p as (select id from exp_products where slug = 'custom-engraved-wood-sign')
insert into exp_product_options (product_id, option_key, label, option_type, placeholder, help_text, is_required, sort_order)
select p.id, o.option_key, o.label, o.option_type, o.placeholder, o.help_text, o.is_required, o.sort_order
from p, (values
  ('sign_text', 'Sign Text', 'textarea',
   'e.g. "The Henderson Family Est. 2018"',
   'Include all lines of text. Line breaks will be preserved.',
   false, 1),
  ('artwork_file', 'Custom Artwork / Logo (optional)', 'file',
   null,
   'SVG preferred. PNG or JPG at 300 DPI minimum.',
   false, 2),
  ('finish', 'Wood Finish', 'select',
   null, null,
   true, 3)
) as o(option_key, label, option_type, placeholder, help_text, is_required, sort_order)
on conflict do nothing;

-- Option values: finish
with o as (
  select po.id from exp_product_options po
  join exp_products p on p.id = po.product_id
  where p.slug = 'custom-engraved-wood-sign' and po.option_key = 'finish'
)
insert into exp_product_option_values (option_id, label, value, price_delta, sort_order)
select o.id, v.label, v.value, v.price_delta, v.sort_order
from o, (values
  ('Unfinished (raw wood)', 'unfinished',   0.00, 1),
  ('Natural clear-coat',    'clear_coat',   0.00, 2),
  ('Dark walnut stain',     'dark_walnut',  3.00, 3),
  ('Black painted',         'black_paint',  3.00, 4)
) as v(label, value, price_delta, sort_order)
on conflict do nothing;

-- Media: Signs & Decor
with p as (select id, slug from exp_products where slug in ('custom-engraved-wood-sign','engraved-slate-sign'))
insert into exp_product_media (product_id, alt, emoji, gradient, is_featured, sort_order)
select p.id,
  case p.slug
    when 'custom-engraved-wood-sign' then 'Custom engraved wood sign'
    when 'engraved-slate-sign'       then 'Engraved slate sign'
  end,
  '🪵',
  'linear-gradient(135deg, #0A1A0A 0%, #1A3A10 40%, #0E2210 100%)',
  true, 1
from p
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- LEATHER GOODS
-- ─────────────────────────────────────────────────────────────────────────────

insert into exp_products
  (title, slug, short_description, description, category_key, base_price,
   is_ready_made, is_customizable, is_active, sort_order,
   production_estimate_band, how_it_works_anchor)
values
  ('Engraved Leather Patch',
   'engraved-leather-patch',
   'Custom engraved leather patch — hats, bags, jackets, and more.',
   'Genuine leather patch laser engraved with your logo, monogram, or artwork. Deep engraving creates rich contrast that darkens beautifully over time. Ideal for hat patches, bag labels, jacket emblems, and brand labeling.',
   'leather_goods', 12.00,
   false, true, true, 1,
   '2–4 business days', '#engraving'),

  ('Engraved Leather Keychain',
   'engraved-leather-keychain',
   'Personalized leather keychain with name, initials, or custom art.',
   'A thick, sturdy keychain cut from genuine leather and engraved with precision. The natural texture makes every piece unique. Great for gifts, party favors, or everyday carry.',
   'leather_goods', 9.00,
   false, true, true, 2,
   '2–3 business days', '#engraving')
on conflict (slug) do nothing;

-- Variants: Leather Patch
with p as (select id from exp_products where slug = 'engraved-leather-patch')
insert into exp_product_variants (product_id, label, price_delta, sort_order)
select p.id, v.label, v.price_delta, v.sort_order
from p, (values
  ('Standard (2" × 3")',  0.00, 1),
  ('Large (3" × 4")',     4.00, 2),
  ('Round (2.5")',        2.00, 3)
) as v(label, price_delta, sort_order)
on conflict do nothing;

-- Options: Leather Patch
with p as (select id from exp_products where slug = 'engraved-leather-patch')
insert into exp_product_options (product_id, option_key, label, option_type, placeholder, help_text, is_required, sort_order)
select p.id, o.option_key, o.label, o.option_type, o.placeholder, o.help_text, o.is_required, o.sort_order
from p, (values
  ('engraving_text', 'Engraving Text', 'text',
   'Name, initials, brand name…',
   'Leave blank if uploading artwork.',
   false, 1),
  ('artwork_file', 'Artwork / Logo (optional)', 'file',
   null,
   'SVG preferred for clean engraving. PNG at 300 DPI minimum.',
   false, 2),
  ('backing', 'Backing', 'select',
   null, null,
   true, 3)
) as o(option_key, label, option_type, placeholder, help_text, is_required, sort_order)
on conflict do nothing;

-- Option values: backing
with o as (
  select po.id from exp_product_options po
  join exp_products p on p.id = po.product_id
  where p.slug = 'engraved-leather-patch' and po.option_key = 'backing'
)
insert into exp_product_option_values (option_id, label, value, price_delta, sort_order)
select o.id, v.label, v.value, v.price_delta, v.sort_order
from o, (values
  ('Iron-on adhesive', 'iron_on',   0.00, 1),
  ('Velcro (hook side)', 'velcro',  1.00, 2),
  ('No backing (sew-on)', 'sew_on', 0.00, 3)
) as v(label, value, price_delta, sort_order)
on conflict do nothing;

-- Media: Leather Goods
with p as (select id, slug from exp_products where slug in ('engraved-leather-patch','engraved-leather-keychain'))
insert into exp_product_media (product_id, alt, emoji, gradient, is_featured, sort_order)
select p.id,
  case p.slug
    when 'engraved-leather-patch'   then 'Engraved leather patch'
    when 'engraved-leather-keychain' then 'Engraved leather keychain'
  end,
  '🪡',
  'linear-gradient(135deg, #1A0E00 0%, #3A2010 40%, #281400 100%)',
  true, 1
from p
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- ACRYLIC PIECES
-- ─────────────────────────────────────────────────────────────────────────────

insert into exp_products
  (title, slug, short_description, description, category_key, base_price,
   is_ready_made, is_customizable, is_active, sort_order,
   production_estimate_band, how_it_works_anchor)
values
  ('Custom Acrylic Keychain',
   'custom-acrylic-keychain',
   'Cut-to-shape acrylic keychain with engraved or printed design.',
   'Laser-cut acrylic in any shape you like — we cut to your design. Available in clear, frosted, and colored acrylic. Lightweight, durable, and eye-catching. Perfect for keychains, bag charms, or ornament hangers.',
   'acrylic_pieces', 10.00,
   false, true, true, 1,
   '2–4 business days', '#cutting'),

  ('Engraved Acrylic Panel',
   'engraved-acrylic-panel',
   'Custom-engraved frosted acrylic panel for wall display or signage.',
   'Frosted acrylic panels laser-engraved with deep, frosted contrast. Mounted on standoffs or with strong adhesive, these panels make striking wall art, menu boards, or business signs.',
   'acrylic_pieces', 36.00,
   false, true, true, 2,
   '4–6 business days', '#cutting')
on conflict (slug) do nothing;

-- Variants: Acrylic Keychain
with p as (select id from exp_products where slug = 'custom-acrylic-keychain')
insert into exp_product_variants (product_id, label, price_delta, sort_order)
select p.id, v.label, v.price_delta, v.sort_order
from p, (values
  ('Clear acrylic',   0.00, 1),
  ('Frosted acrylic', 0.00, 2),
  ('Colored acrylic', 1.00, 3)
) as v(label, price_delta, sort_order)
on conflict do nothing;

-- Media: Acrylic Pieces
with p as (select id, slug from exp_products where slug in ('custom-acrylic-keychain','engraved-acrylic-panel'))
insert into exp_product_media (product_id, alt, emoji, gradient, is_featured, sort_order)
select p.id,
  case p.slug
    when 'custom-acrylic-keychain' then 'Custom acrylic keychain'
    when 'engraved-acrylic-panel'  then 'Engraved acrylic panel'
  end,
  '💎',
  'linear-gradient(135deg, #001A2A 0%, #003A4A 40%, #002030 100%)',
  true, 1
from p
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- APPAREL
-- ─────────────────────────────────────────────────────────────────────────────

insert into exp_products
  (title, slug, short_description, description, category_key, base_price,
   is_ready_made, is_customizable, is_active, sort_order,
   production_estimate_band, how_it_works_anchor)
values
  ('Sublimated Custom T-Shirt',
   'sublimated-custom-t-shirt',
   'Full-color sublimation print on a polyester tee — vivid and wash-safe.',
   'Upload your artwork for a full-color dye-sublimation print directly into the fabric. Colors are vibrant, permanent, and safe for regular washing. Available in a range of sizes. Best on 100% polyester or poly-blend fabrics.',
   'apparel', 26.00,
   false, true, true, 1,
   '4–6 business days', '#sublimation')
on conflict (slug) do nothing;

-- Variants: T-Shirt
with p as (select id from exp_products where slug = 'sublimated-custom-t-shirt')
insert into exp_product_variants (product_id, label, price_delta, sort_order)
select p.id, v.label, v.price_delta, v.sort_order
from p, (values
  ('S',   0.00, 1),
  ('M',   0.00, 2),
  ('L',   0.00, 3),
  ('XL',  0.00, 4),
  ('2XL', 3.00, 5),
  ('3XL', 3.00, 6)
) as v(label, price_delta, sort_order)
on conflict do nothing;

-- Options: T-Shirt
with p as (select id from exp_products where slug = 'sublimated-custom-t-shirt')
insert into exp_product_options (product_id, option_key, label, option_type, placeholder, help_text, is_required, sort_order)
select p.id, o.option_key, o.label, o.option_type, o.placeholder, o.help_text, o.is_required, o.sort_order
from p, (values
  ('artwork_file', 'Upload Your Design', 'file',
   null,
   'PNG or JPG, 300 DPI minimum. We will send a proof before production.',
   true, 1),
  ('print_placement', 'Print Placement', 'select',
   null, null,
   true, 2),
  ('design_notes', 'Design Notes', 'textarea',
   'Color corrections, text changes, special requests…',
   null,
   false, 3)
) as o(option_key, label, option_type, placeholder, help_text, is_required, sort_order)
on conflict do nothing;

-- Option values: print_placement
with o as (
  select po.id from exp_product_options po
  join exp_products p on p.id = po.product_id
  where p.slug = 'sublimated-custom-t-shirt' and po.option_key = 'print_placement'
)
insert into exp_product_option_values (option_id, label, value, price_delta, sort_order)
select o.id, v.label, v.value, v.price_delta, v.sort_order
from o, (values
  ('Front only',         'front_only',   0.00, 1),
  ('Back only',          'back_only',    0.00, 2),
  ('Front + back',       'front_back',   8.00, 3),
  ('All-over print',     'all_over',    12.00, 4)
) as v(label, value, price_delta, sort_order)
on conflict do nothing;

-- Media: Apparel
with p as (select id from exp_products where slug = 'sublimated-custom-t-shirt')
insert into exp_product_media (product_id, alt, emoji, gradient, is_featured, sort_order)
select p.id, 'Custom sublimated t-shirt', '👕',
  'linear-gradient(135deg, #0A0A14 0%, #1A1A2A 40%, #121220 100%)', true, 1
from p
on conflict do nothing;
