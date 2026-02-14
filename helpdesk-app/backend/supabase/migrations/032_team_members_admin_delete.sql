-- Allow tenant admins to delete team members (e.g. from Settings → Users).
-- team_member_teams rows are removed by ON DELETE CASCADE on team_members(id).

CREATE POLICY "Admins can delete team_members"
  ON team_members FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members admin_tm
      WHERE admin_tm.tenant_id = team_members.tenant_id
        AND admin_tm.user_id = auth.uid()
        AND admin_tm.is_active = true
        AND admin_tm.role = 'admin'
    )
  );
