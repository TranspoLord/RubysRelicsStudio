-- -----------------------------------------------------------------------------
-- Migration 029: Product media storage bucket
-- Creates a public storage bucket for admin-uploaded product media assets.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-media',
  'product-media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public storefront can read product media assets.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public read product media assets'
  ) then
    create policy "Public read product media assets"
      on storage.objects
      for select
      using (bucket_id = 'product-media');
  end if;
end $$;
