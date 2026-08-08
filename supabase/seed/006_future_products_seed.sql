insert into exp_future_product_statuses (label, color, sort_order, is_default, is_visible) values
  ('Planned', '#6A7AC4', 10, true, true),
  ('In Development', '#F59E0B', 20, false, true),
  ('Under Review', '#EF4444', 30, false, true),
  ('Completed', '#10B981', 40, false, true),
  ('Discontinued', '#6B7280', 50, false, true)
on conflict do nothing;

insert into exp_future_products
  (title, description, estimated_release, category_key, media_url, media_alt, status_id, is_visible, sort_order)
values
  ('Engraved Jewelry', 'Delicate engraved pendants, rings, and bracelets — coming soon.', '2027-03-01', 'engraved_drinkware', null, '✨', (select id from exp_future_product_statuses where label = 'Planned'), true, 10),
  ('Wooden Home Decor', 'Engraved wooden signs, cutting boards, and decorative panels.', '2027-06-01', null, null, '🪵', (select id from exp_future_product_statuses where label = 'In Development'), true, 20)
on conflict do nothing;

insert into exp_homepage_sections (section_key, is_visible, sort_order, content) values
  ('shop_all_preview', true, 75, '{"product_count": 6, "show_filters": true}'),
  ('future_products_notify', true, 105, '{}')
on conflict (section_key) do nothing;

insert into exp_storefront_settings (setting_key, setting_value, description) values
  ('future_products_notify_form', '{"enabled": true}', 'Toggle the notify-for-future-products form on/off storefront-wide')
on conflict (setting_key) do nothing;
