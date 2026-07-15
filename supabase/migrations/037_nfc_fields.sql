-- ── Migration 037: NFC configuration fields on products and order items
-- Adds NFC-related columns for NFC tag encoding workflow.

-- NFC price delta on products (default $1)
alter table if exists exp_products
  add column if not exists nfc_price_delta numeric(12,4) not null default 1 check (nfc_price_delta >= 0);

-- NFC fields on order items
alter table if exists exp_order_items
  add column if not exists nfc_target_data text,
  add column if not exists leave_unlocked boolean not null default false,
  add column if not exists source_file_url text;

-- Source file URL should reference uploaded artwork
create index if not exists idx_exp_order_items_source_file on exp_order_items(source_file_url);

-- Add comment for documentation
comment on column exp_order_items.nfc_target_data is 'Initial data to encode on NFC tag during fabrication';
comment on column exp_order_items.leave_unlocked is 'If true, tag should remain unlocked (writable) after production';
comment on column exp_order_items.source_file_url is 'URL to customer-uploaded artwork file in storage';