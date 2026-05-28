-- Backfill missing configuration for Engraved Slate Sign.
-- This adds starter variants and options so the product page has full customization inputs.

with product as (
  select id from exp_products where slug = 'engraved-slate-sign' limit 1
)
insert into exp_product_variants (product_id, label, price_delta, sort_order)
select p.id, v.label, v.price_delta, v.sort_order
from product p
cross join (values
  ('Small (6" x 8")', 0.00::numeric, 1),
  ('Medium (8" x 10")', 8.00::numeric, 2),
  ('Large (12" x 16")', 16.00::numeric, 3)
) as v(label, price_delta, sort_order)
where not exists (
  select 1 from exp_product_variants existing
  where existing.product_id = p.id
    and existing.label = v.label
);

with product as (
  select id from exp_products where slug = 'engraved-slate-sign' limit 1
)
insert into exp_product_options (product_id, option_key, label, option_type, placeholder, help_text, is_required, sort_order)
select p.id, o.option_key, o.label, o.option_type, o.placeholder, o.help_text, o.is_required, o.sort_order
from product p
cross join (values
  (
    'sign_text',
    'Text or Message',
    'textarea',
    'Example: The Henderson Family - Est. 2018',
    'Line breaks are preserved exactly as entered.',
    false,
    1
  ),
  (
    'artwork_file',
    'Artwork or Logo Upload',
    'file',
    null,
    'SVG is preferred. PNG/JPG/PDF accepted at 300 DPI or higher.',
    false,
    2
  ),
  (
    'finish',
    'Finish',
    'select',
    null,
    'Pick the final look for your engraved slate sign.',
    true,
    3
  )
) as o(option_key, label, option_type, placeholder, help_text, is_required, sort_order)
where not exists (
  select 1 from exp_product_options existing
  where existing.product_id = p.id
    and existing.option_key = o.option_key
);

with finish_option as (
  select po.id
  from exp_product_options po
  join exp_products p on p.id = po.product_id
  where p.slug = 'engraved-slate-sign'
    and po.option_key = 'finish'
  limit 1
)
insert into exp_product_option_values (option_id, label, value, price_delta, sort_order)
select o.id, v.label, v.value, v.price_delta, v.sort_order
from finish_option o
cross join (values
  ('Natural (default)', 'natural', 0.00::numeric, 1),
  ('Clear coat', 'clear_coat', 0.00::numeric, 2),
  ('Dark walnut edge finish', 'dark_walnut', 3.00::numeric, 3)
) as v(label, value, price_delta, sort_order)
where not exists (
  select 1 from exp_product_option_values existing
  where existing.option_id = o.id
    and existing.value = v.value
);
