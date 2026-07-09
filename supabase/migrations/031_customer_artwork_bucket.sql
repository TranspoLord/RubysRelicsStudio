-- -----------------------------------------------------------------------------
-- Migration 031: Customer artwork storage bucket
-- Creates a PRIVATE storage bucket for customer-uploaded artwork files.
-- Files are never publicly accessible — admins access via signed URLs
-- generated through the service role client.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-artwork',
  'customer-artwork',
  false,                -- private — no public CDN access
  15728640,            -- 15 MB per file (enforced at bucket level + API level)
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf'
  ]::text[]
)
on conflict (id) do nothing;

-- No public read policy is created intentionally.
-- Only the service-role key (getSupabaseAdmin) may access files.
-- Admins retrieve artwork via createSignedUrl() with a 1-hour expiry.
