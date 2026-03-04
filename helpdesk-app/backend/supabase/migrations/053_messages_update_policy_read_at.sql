-- Allow team members to update messages (e.g. set read_at when viewing customer replies)
CREATE POLICY "Team members can update messages"
  ON messages FOR UPDATE TO authenticated
  USING (user_has_tenant_access(tenant_id))
  WITH CHECK (user_has_tenant_access(tenant_id));
