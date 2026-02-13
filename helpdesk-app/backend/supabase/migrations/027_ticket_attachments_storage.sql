-- Storage bucket for ticket/message attachments (synced from Gmail or sent with replies).
-- Path: {tenant_id}/{ticket_id}/{message_id}/{filename}
-- Private bucket; RLS allows read/insert for users who have access to the tenant.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ticket-attachments',
  'ticket-attachments',
  false,
  52428800,
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;

-- Allow authenticated users to read objects in paths where they have tenant access (first path segment = tenant_id).
DROP POLICY IF EXISTS "Users can read tenant ticket attachments" ON storage.objects;
CREATE POLICY "Users can read tenant ticket attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ticket-attachments'
    AND EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.is_active = true
        AND tm.tenant_id::text = (storage.foldername(name))[1]
    )
  );

-- Allow authenticated users to upload to their tenant's path (first segment = tenant_id).
DROP POLICY IF EXISTS "Users can upload tenant ticket attachments" ON storage.objects;
CREATE POLICY "Users can upload tenant ticket attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ticket-attachments'
    AND EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.is_active = true
        AND tm.tenant_id::text = (storage.foldername(name))[1]
    )
  );

-- Allow authenticated users to delete in their tenant path (e.g. cleanup).
DROP POLICY IF EXISTS "Users can delete tenant ticket attachments" ON storage.objects;
CREATE POLICY "Users can delete tenant ticket attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'ticket-attachments'
    AND EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.is_active = true
        AND tm.tenant_id::text = (storage.foldername(name))[1]
    )
  );
