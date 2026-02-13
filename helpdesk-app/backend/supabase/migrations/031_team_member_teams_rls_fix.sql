-- Fix RLS on team_member_teams: admins must be able to add any tenant member to teams,
-- not only their own membership. Allow SELECT for any row in a tenant the user can access;
-- allow INSERT/UPDATE/DELETE when the row's team_member is in a tenant where current user is admin.

DROP POLICY IF EXISTS "Team members can read team_member_teams" ON team_member_teams;
CREATE POLICY "Team members can read team_member_teams"
  ON team_member_teams FOR SELECT TO authenticated
  USING (
    user_has_tenant_access(
      (SELECT tenant_id FROM team_members WHERE id = team_member_teams.team_member_id)
    )
  );

DROP POLICY IF EXISTS "Admins can manage team_member_teams" ON team_member_teams;
CREATE POLICY "Admins can manage team_member_teams"
  ON team_member_teams FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.id = team_member_teams.team_member_id
        AND tm.tenant_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM team_members admin_tm
          WHERE admin_tm.tenant_id = tm.tenant_id
            AND admin_tm.user_id = auth.uid()
            AND admin_tm.is_active = true
            AND admin_tm.role = 'admin'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN teams t ON t.id = team_member_teams.team_id AND t.tenant_id = tm.tenant_id
      WHERE tm.id = team_member_teams.team_member_id
        AND tm.tenant_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM team_members admin_tm
          WHERE admin_tm.tenant_id = tm.tenant_id
            AND admin_tm.user_id = auth.uid()
            AND admin_tm.is_active = true
            AND admin_tm.role = 'admin'
        )
    )
  );
