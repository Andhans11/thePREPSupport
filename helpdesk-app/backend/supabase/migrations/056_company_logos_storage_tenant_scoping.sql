-- Security fix C3: Add path-based tenant scoping to company-logos bucket.
-- First path segment must be a tenant_id the user belongs to (user_has_tenant_access).
-- Prevents upload/overwrite/delete of other tenants' logos.

DROP POLICY IF EXISTS "Authenticated can upload company logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update company logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete company logos" ON storage.objects;

CREATE POLICY "Authenticated can upload company logos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-logos'
    AND user_has_tenant_access(((regexp_split_to_array(trim(both '/' from name), '/'))[1])::uuid)
  );

CREATE POLICY "Authenticated can update company logos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND user_has_tenant_access(((regexp_split_to_array(trim(both '/' from name), '/'))[1])::uuid)
  );

CREATE POLICY "Authenticated can delete company logos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND user_has_tenant_access(((regexp_split_to_array(trim(both '/' from name), '/'))[1])::uuid)
  );
