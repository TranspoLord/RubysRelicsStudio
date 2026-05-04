-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: Homepage CMS placeholder data
-- Matches the static placeholder data previously hardcoded in components.
-- Run after migration 001.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Homepage section registry (all keys that page.tsx knows about) ────────────
insert into exp_homepage_sections (section_key, is_visible, sort_order, content) values
  ('announcement',        true,  0,  '{}'),
  ('hero',                true,  10, '{}'),
  ('order_paths',         true,  20, '{}'),
  ('category_grid',       true,  30, '{}'),
  ('featured_collections',true,  40, '{}'),
  ('fresh_from_forge',    true,  50, '{}'),
  ('materials_teaser',    true,  60, '{}'),
  ('process_strip',       true,  70, '{}'),
  ('custom_order_pitch',  true,  80, '{}'),
  ('testimonials',        true,  90, '{}'),
  ('faq_preview',         true, 100, '{}'),
  ('newsletter',          true, 110, '{}'),
  ('resources_teaser',    true, 120, '{}')
on conflict (section_key) do nothing;

-- ── Announcement ─────────────────────────────────────────────────────────────
insert into exp_announcement (message, cta_label, cta_href, is_active, dismiss_key) values
  ('✨ New: Laser Engraved Tumblers now available — personalized treasures for your hoard.',
   'Shop Drinkware', '/shop/categories/engraved-drinkware', true, 'rr_announcement_v1')
on conflict do nothing;

-- ── Taxonomy — categories ─────────────────────────────────────────────────────
insert into exp_taxonomy
  (key, display_name, slug, type, visible, sort_order, emoji, gradient, glow_color, tagline)
values
  ('engraved_drinkware',  'Engraved Drinkware',  'engraved-drinkware',  'category', true, 1,
   '🥤', 'linear-gradient(135deg, #2A1800 0%, #4A2E00 40%, #3A2000 100%)', '#C4921A',
   'Tumblers, cups & bottles — forged with precision.'),
  ('sublimated_gifts',    'Sublimated Gifts',    'sublimated-gifts',    'category', true, 2,
   '☕', 'linear-gradient(135deg, #1A0A2A 0%, #2E1A4A 40%, #1E0E36 100%)', '#8B4FBE',
   'Full-color magic on mugs, coasters & more.'),
  ('signs_and_decor',     'Signs & Decor',       'signs-and-decor',     'category', true, 3,
   '🪵', 'linear-gradient(135deg, #0A1A0A 0%, #1A3A10 40%, #0E2210 100%)', '#5A9A3A',
   'Wood signs, acrylic panels & wall art.'),
  ('acrylic_pieces',      'Acrylic Pieces',      'acrylic-pieces',      'category', true, 4,
   '💎', 'linear-gradient(135deg, #001A2A 0%, #003A4A 40%, #002030 100%)', '#2ABCD4',
   'Crystal-clear custom shapes & panels.'),
  ('leather_goods',       'Leather Goods',       'leather-goods',       'category', true, 5,
   '🪡', 'linear-gradient(135deg, #1A0E00 0%, #3A2010 40%, #281400 100%)', '#B87333',
   'Engraved patches, keychains & wallets.'),
  ('apparel',             'Apparel',             'apparel',             'category', true, 6,
   '👕', 'linear-gradient(135deg, #0A0A14 0%, #1A1A2A 40%, #121220 100%)', '#6A7AC4',
   'Custom shirts, hats & wearable art.'),
  ('seasonal_items',      'Seasonal Items',      'seasonal-items',      'category', true, 7,
   '✨', 'linear-gradient(135deg, #1A0808 0%, #3A1010 40%, #280808 100%)', '#9B1C1C',
   'Holiday drops, event specials & limited runs.'),
  ('gift_bundles',        'Gift Bundles',        'gift-bundles',        'category', true, 8,
   '🎁', 'linear-gradient(135deg, #1A0A14 0%, #3A1A2A 40%, #280E1E 100%)', '#BE4F8B',
   'Curated sets for legendary gift-givers.')
on conflict (key) do nothing;

-- ── Taxonomy — materials ──────────────────────────────────────────────────────
insert into exp_taxonomy
  (key, display_name, slug, type, visible, sort_order, emoji, gradient, tagline)
values
  ('wood_basswood',           'Basswood',              'wood-basswood',           'material', true, 1,
   '🪵', 'linear-gradient(160deg, #2A1800 0%, #4A2E0A 100%)',
   'Lightweight, fine-grained wood ideal for detailed engravings, signs, and ornaments.'),
  ('acrylic_frosted',         'Frosted Acrylic',       'acrylic-frosted',         'material', true, 2,
   '🧊', 'linear-gradient(160deg, #001A2A 0%, #003A4A 100%)',
   'Semi-transparent acrylic that diffuses light beautifully — perfect for glowing panels and keychains.'),
  ('leather',                 'Leather',               'leather',                 'material', true, 3,
   '🪡', 'linear-gradient(160deg, #1A0E00 0%, #3A2010 100%)',
   'Natural leather accepts deep, high-contrast engravings that age beautifully over time.'),
  ('powder_coated_tumbler',   'Powder Coated Tumblers','powder-coated-tumbler',   'material', true, 4,
   '🥤', 'linear-gradient(160deg, #2A1800 0%, #4A3000 100%)',
   'The classic — engraving cuts through the coating to reveal gleaming metal beneath.'),
  ('ceramic_mug',             'Ceramic Blanks',        'ceramic-mug',             'material', true, 5,
   '☕', 'linear-gradient(160deg, #1A0A2A 0%, #2E1A3A 100%)',
   'Specially coated ceramics accept full-color sublimation prints that last a lifetime.'),
  ('slate',                   'Slate',                 'slate',                   'material', true, 6,
   '🪨', 'linear-gradient(160deg, #121212 0%, #282828 100%)',
   'Rustic and weighty — slate engraves with a striking natural contrast.')
on conflict (key) do nothing;

-- ── Featured collections ──────────────────────────────────────────────────────
insert into exp_featured_collections
  (title, tagline, description, slug, emoji, tag_label, gradient, border_color, is_visible, sort_order)
values
  ('The Tavern Collection',
   'For feasts worthy of legend.',
   'Engraved tumblers, ceramic mugs, and coordinating coasters — the complete drinkware set for any adventurer''s table.',
   'collections/tavern-collection', '🍺', 'Best Sellers',
   'linear-gradient(135deg, rgba(138,101,16,0.25) 0%, rgba(184,115,51,0.15) 60%, rgba(35,31,25,0.8) 100%)',
   'rgba(196,146,26,0.25)', true, 1),
  ('Adventurer''s Pack',
   'Gear for the road ahead.',
   'Laser-engraved leather patches, personalised tumblers, and acrylic keychains built for those who travel far and collect everything.',
   'collections/adventurers-pack', '🗡️', 'Popular',
   'linear-gradient(135deg, rgba(155,28,28,0.2) 0%, rgba(74,21,0,0.6) 60%, rgba(35,31,25,0.8) 100%)',
   'rgba(155,28,28,0.25)', true, 2),
  ('Forest Hearth Holiday',
   'Gifts straight from the grove.',
   'Engraved wood ornaments, sublimated coaster sets, and personalised mugs perfect for seasonal gifting and winter celebrations.',
   'collections/forest-hearth-holiday', '🌲', 'Seasonal',
   'linear-gradient(135deg, rgba(10,42,16,0.8) 0%, rgba(20,42,16,0.6) 60%, rgba(35,31,25,0.8) 100%)',
   'rgba(74,138,58,0.3)', true, 3)
on conflict (slug) do nothing;

-- ── Gallery items (all start as published so homepage shows them) ─────────────
insert into exp_gallery
  (title, caption, category_key, emoji, gradient, material_used, turnaround_band,
   display_permission, moderation_status, visible, sort_order)
values
  ('Walnut Tumbler — Dragon Motif',
   'Deep engraving on a powder-coated tumbler with a custom dragon scale pattern.',
   'engraved_drinkware', '🐉',
   'linear-gradient(135deg, #2A1800, #4A2E00)',
   'Powder Coated Tumbler', '4 days', true, 'published', true, 1),
  ('Leather Patch — Runic Lettering',
   'Engraved leather patch with custom runic script and a reinforced border.',
   'leather_goods', '⚔️',
   'linear-gradient(135deg, #1A0E00, #3A2010)',
   'Leather', '3 days', true, 'published', true, 2),
  ('Sublimated Mug — Watercolor Mountains',
   'Full-color sublimation transfer of a watercolor mountain landscape on ceramic.',
   'sublimated_gifts', '🏔️',
   'linear-gradient(135deg, #1A0A2A, #2E1A4A)',
   'Ceramic Mug Blank', '3 days', true, 'published', true, 3),
  ('Basswood Sign — "Here Be Cozy"',
   'Cut and engraved basswood wall sign with a hand-styled lettering layout.',
   'signs_and_decor', '🏡',
   'linear-gradient(135deg, #0A1A0A, #1A3A10)',
   'Basswood', '5 days', true, 'published', true, 4),
  ('Frosted Acrylic Lantern Panel',
   'Custom-cut frosted acrylic panel with an intricate geometric pattern for a lantern frame.',
   'acrylic_pieces', '🔮',
   'linear-gradient(135deg, #001A2A, #003A4A)',
   'Frosted Acrylic', '4 days', true, 'published', true, 5),
  ('Sublimated Coaster Set',
   'Set of four full-color sublimated coasters featuring a tarot card art series.',
   'sublimated_gifts', '🎴',
   'linear-gradient(135deg, #2A001A, #4A1030)',
   'Ceramic Mug Blank', '3 days', true, 'published', true, 6)
on conflict do nothing;

-- ── Testimonials ─────────────────────────────────────────────────────────────
insert into exp_testimonials
  (quote, author, location, product_label, stars, emoji, is_visible, sort_order)
values
  ('My tumbler arrived with the most intricate dragon engraving I''ve ever seen. The forge gods have truly blessed this shop.',
   'Mira T.', 'Pacific Northwest', 'Engraved Drinkware', 5, '🐉', true, 1),
  ('Ordered a full set of leather patches for my LARP kit. They look like actual artifacts — like they were pulled from a prop master''s collection.',
   'Bren K.', 'Austin, TX', 'Leather Goods', 5, '⚔️', true, 2),
  ('The basswood sign for my home office is absolutely stunning. Communication was clear, production was faster than I expected, and the quality is unmatched.',
   'Lily W.', 'Vermont', 'Signs & Decor', 5, '🪵', true, 3)
on conflict do nothing;

-- ── FAQ items ─────────────────────────────────────────────────────────────────
insert into exp_faq (question, answer, link_label, link_href, is_visible, sort_order, section) values
  ('Can I upload my own artwork?',
   'Yes — most of our products support custom artwork uploads. We accept PNG, JPG, and PDF files. For best results, provide the highest-resolution file you have. The configurator will preview estimated quality before you add to cart. Reference photos are also welcome for custom order requests.',
   'Artwork requirements', '/resources/artwork', true, 1, 'homepage'),
  ('What materials do you work with?',
   'We engrave and cut on wood (basswood, walnut), acrylic (clear, frosted, black, mirror), leather, and slate. We also do sublimation printing on ceramic mugs, powder-coated tumblers, cotton apparel, and canvas.',
   'Materials guide', '/resources/materials', true, 2, 'homepage'),
  ('How long does production take?',
   'Most orders are crafted within 3–7 business days depending on category and current queue depth. Production time is visible on every product page. Shipping time is additional.',
   'How It Works', '/how-it-works#production', true, 3, 'homepage'),
  ('Do you take completely custom commissions?',
   'Absolutely. If your idea doesn''t fit our standard catalog, submit a Custom Order request. Describe your vision, upload reference files, and we''ll review feasibility. You only pay once you approve the price.',
   'Start a custom request', '/custom-orders', true, 4, 'homepage')
on conflict do nothing;
