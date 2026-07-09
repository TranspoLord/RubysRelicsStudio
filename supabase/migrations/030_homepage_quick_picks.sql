-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 030: Homepage quick-pick sections + process_type taxonomy
--
-- Adds:
--   1. 'process_type' value to the exp_taxonomy.type check constraint
--   2. Three process_type taxonomy entries (engraving_cutting, printing, sublimation)
--   3. exp_product_process_types join table (product ↔ process_type)
--   4. Two new exp_homepage_sections rows: quick_picks and process_picks
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Expand the taxonomy type check constraint ──────────────────────────────
alter table exp_taxonomy drop constraint if exists exp_taxonomy_type_check;
alter table exp_taxonomy add constraint exp_taxonomy_type_check
  check (type in (
    'category',
    'customizability_mode',
    'material',
    'product_type',
    'tag',
    'process_type'
  ));

-- ── 2. Seed process_type taxonomy entries ─────────────────────────────────────
insert into exp_taxonomy
  (key, display_name, slug, type, visible, sort_order, emoji, gradient, glow_color, tagline)
values
  (
    'engraving_cutting',
    'Engraving & Cutting',
    'engraving-cutting',
    'process_type',
    true,
    1,
    '🔥',
    'linear-gradient(135deg, #1C0A00 0%, #3A1A00 60%, #1C0A00 100%)',
    '#C4921A',
    'Laser precision on wood, slate, acrylic, leather, and metal.'
  ),
  (
    'printing',
    'Printing',
    'printing',
    'process_type',
    true,
    2,
    '🖨️',
    'linear-gradient(135deg, #001018 0%, #003040 60%, #001018 100%)',
    '#2ABCD4',
    'Full-color prints on paper, card, and flat surfaces.'
  ),
  (
    'sublimation',
    'Sublimation',
    'sublimation',
    'process_type',
    true,
    3,
    '🌈',
    'linear-gradient(135deg, #120A1C 0%, #2A1A3A 60%, #120A1C 100%)',
    '#8B4FBE',
    'Vibrant dye-infused color on mugs, shirts, coasters, and more.'
  )
on conflict (key) do nothing;

-- ── 3. Product ↔ process_type join table ──────────────────────────────────────
create table if not exists exp_product_process_types (
  product_id       uuid  not null references exp_products(id) on delete cascade,
  process_type_key text  not null references exp_taxonomy(key),
  primary key (product_id, process_type_key)
);

create index if not exists idx_exp_product_process_types_product
  on exp_product_process_types(product_id);

create index if not exists idx_exp_product_process_types_key
  on exp_product_process_types(process_type_key);

-- RLS: public read, service-role write (implicit)
alter table exp_product_process_types enable row level security;

create policy "public read product process types"
  on exp_product_process_types for select to anon, authenticated
  using (true);

-- ── 4. Register quick_picks and process_picks homepage sections ───────────────
-- sort_order 12 and 13 place them between hero (10) and order_paths (20)
insert into exp_homepage_sections (section_key, is_visible, sort_order, content) values
  (
    'quick_picks',
    true,
    12,
    '{
      "heading": "What are you here for?!",
      "subheading": "Jump straight to the good stuff.",
      "items": [
        {
          "key": "stickers",
          "label": "Stickers",
          "emoji": "✨",
          "href": "/shop/categories/seasonal-items",
          "gradient": "linear-gradient(135deg, #1A0820 0%, #3A1045 60%, #1A0820 100%)",
          "glow_color": "#C084FC",
          "is_visible": true,
          "sort_order": 0
        },
        {
          "key": "slate_signs",
          "label": "Slate Signs",
          "emoji": "🪨",
          "href": "/shop/categories/signs-and-decor",
          "gradient": "linear-gradient(135deg, #0D1117 0%, #1C2B1C 60%, #0D1117 100%)",
          "glow_color": "#6B9E6B",
          "is_visible": true,
          "sort_order": 1
        },
        {
          "key": "tshirts",
          "label": "T-Shirts",
          "emoji": "👕",
          "href": "/shop/categories/apparel",
          "gradient": "linear-gradient(135deg, #0A0A14 0%, #1A1A2A 60%, #0A0A14 100%)",
          "glow_color": "#6A7AC4",
          "is_visible": true,
          "sort_order": 2
        }
      ]
    }'::jsonb
  ),
  (
    'process_picks',
    true,
    13,
    '{
      "heading": "Start with the action!",
      "subheading": "Shop by how it''s made.",
      "items": [
        {
          "key": "engraving_cutting",
          "label": "Engraving & Cutting",
          "emoji": "🔥",
          "href": "/shop/all?process=engraving_cutting",
          "gradient": "linear-gradient(135deg, #1C0A00 0%, #3A1A00 60%, #1C0A00 100%)",
          "glow_color": "#C4921A",
          "is_visible": true,
          "sort_order": 0
        },
        {
          "key": "printing",
          "label": "Printing",
          "emoji": "🖨️",
          "href": "/shop/all?process=printing",
          "gradient": "linear-gradient(135deg, #001018 0%, #003040 60%, #001018 100%)",
          "glow_color": "#2ABCD4",
          "is_visible": true,
          "sort_order": 1
        },
        {
          "key": "sublimation",
          "label": "Sublimation",
          "emoji": "🌈",
          "href": "/shop/all?process=sublimation",
          "gradient": "linear-gradient(135deg, #120A1C 0%, #2A1A3A 60%, #120A1C 100%)",
          "glow_color": "#8B4FBE",
          "is_visible": true,
          "sort_order": 2
        }
      ]
    }'::jsonb
  )
on conflict (section_key) do nothing;
