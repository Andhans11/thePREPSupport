-- Fix ticket-attachments storage RLS: first path segment (tenant_id) must work
-- whether storage.objects.name has a leading slash or not (Supabase may store either).
-- Using (regexp_split_to_array(trim(both '/' from name), '/'))[1] for reliable first segment.

DROP POLICY IF EXISTS "Users can read tenant ticket attachments" ON storage.objects;
CREATE POLICY "Users can read tenant ticket attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ticket-attachments'
    AND EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.is_active = true
        AND tm.tenant_id::text = (regexp_split_to_array(trim(both '/' from name), '/'))[1]
    )
  );

DROP POLICY IF EXISTS "Users can upload tenant ticket attachments" ON storage.objects;
CREATE POLICY "Users can upload tenant ticket attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ticket-attachments'
    AND EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.is_active = true
        AND tm.tenant_id::text = (regexp_split_to_array(trim(both '/' from name), '/'))[1]
    )
  );

DROP POLICY IF EXISTS "Users can delete tenant ticket attachments" ON storage.objects;
CREATE POLICY "Users can delete tenant ticket attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'ticket-attachments'
    AND EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.is_active = true
        AND tm.tenant_id::text = (regexp_split_to_array(trim(both '/' from name), '/'))[1]
    )
  );
