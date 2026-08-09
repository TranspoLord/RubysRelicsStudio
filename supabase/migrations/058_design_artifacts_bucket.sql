-- -----------------------------------------------------------------------------
-- Migration 058: Design export artifacts bucket
-- Creates a private storage bucket for generated design PNG/PDF artifacts.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'design-artifacts',
  'design-artifacts',
  false,
  52428800,
  array['image/png', 'application/pdf']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
