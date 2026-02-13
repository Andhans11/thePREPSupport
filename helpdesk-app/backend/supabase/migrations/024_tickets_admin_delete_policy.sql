-- Allow only admins to delete tickets (e.g. from archived list).
CREATE POLICY "Admins can delete tickets" ON tickets
  FOR DELETE TO authenticated
  USING (
    user_has_tenant_access(tenant_id)
    AND EXISTS (
      SELECT 1 FROM team_members
      WHERE user_id = auth.uid()
        AND tenant_id = tickets.tenant_id
        AND is_active = true
        AND role = 'admin'
    )
  );
