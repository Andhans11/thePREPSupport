-- Storage bucket for company logos (per-tenant). Create bucket and allow authenticated uploads.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-logos',
  'company-logos',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Allow authenticated users to upload/update in company-logos (path = tenant_id/*)
DROP POLICY IF EXISTS "Authenticated can upload company logos" ON storage.objects;
CREATE POLICY "Authenticated can upload company logos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-logos');

DROP POLICY IF EXISTS "Authenticated can update company logos" ON storage.objects;
CREATE POLICY "Authenticated can update company logos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'company-logos');

DROP POLICY IF EXISTS "Authenticated can delete company logos" ON storage.objects;
CREATE POLICY "Authenticated can delete company logos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'company-logos');

-- Public read is implicit for public buckets; allow SELECT so signed-in users can list if needed
DROP POLICY IF EXISTS "Public read company logos" ON storage.objects;
CREATE POLICY "Public read company logos"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'company-logos');
