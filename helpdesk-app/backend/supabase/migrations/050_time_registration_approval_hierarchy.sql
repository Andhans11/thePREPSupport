-- Approval hierarchy for time registration:
-- - Admin: can approve everyone (unchanged).
-- - Manager: can approve all entries for team members in teams they manage.
-- - Explicit approvers: can approve only team members/teams they are assigned to (new assignments table).

-- 1) Assignments: which teams or which single users an approver can approve
CREATE TABLE IF NOT EXISTS time_registration_approver_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  approver_team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  scope VARCHAR(20) NOT NULL CHECK (scope IN ('team', 'member')),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT chk_assignments_scope CHECK (
    (scope = 'team' AND team_id IS NOT NULL AND team_member_id IS NULL)
    OR (scope = 'member' AND team_member_id IS NOT NULL AND team_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_approver_assignments_approver_team ON time_registration_approver_assignments(approver_team_member_id, team_id) WHERE team_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_approver_assignments_approver_member ON time_registration_approver_assignments(approver_team_member_id, team_member_id) WHERE team_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_approver_assignments_tenant ON time_registration_approver_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_approver_assignments_approver ON time_registration_approver_assignments(approver_team_member_id);

ALTER TABLE time_registration_approver_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can read time_registration_approver_assignments"
  ON time_registration_approver_assignments FOR SELECT TO authenticated
  USING (user_has_tenant_access(tenant_id));

CREATE POLICY "Admins can manage time_registration_approver_assignments"
  ON time_registration_approver_assignments FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM team_members WHERE tenant_id = time_registration_approver_assignments.tenant_id AND user_id = auth.uid() AND is_active = true AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM team_members WHERE tenant_id = time_registration_approver_assignments.tenant_id AND user_id = auth.uid() AND is_active = true AND role = 'admin')
  );

COMMENT ON TABLE time_registration_approver_assignments IS 'Which teams or which single users a time registration approver can approve.';

-- 2) Replace time_entries SELECT policy: admin sees all; manager sees their team; approvers see only assigned
DROP POLICY IF EXISTS "Team members can read own time_entries" ON time_entries;

CREATE POLICY "Team members can read own time_entries"
  ON time_entries FOR SELECT TO authenticated
  USING (
    user_has_tenant_access(tenant_id)
    AND (
      -- own entries
      team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid() AND tenant_id = time_entries.tenant_id)
      -- admin sees all
      OR EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.tenant_id = time_entries.tenant_id AND tm.user_id = auth.uid() AND tm.is_active = true AND tm.role = 'admin'
      )
      -- manager sees entries of members in teams they manage
      OR EXISTS (
        SELECT 1 FROM team_members tm
        JOIN teams t ON t.tenant_id = time_entries.tenant_id AND t.manager_team_member_id = tm.id
        JOIN team_member_teams tmt ON tmt.team_id = t.id AND tmt.team_member_id = time_entries.team_member_id
        WHERE tm.user_id = auth.uid() AND tm.is_active = true AND tm.tenant_id = time_entries.tenant_id
      )
      -- approver sees entries covered by an assignment (team or member)
      OR EXISTS (
        SELECT 1 FROM team_members tm
        JOIN time_registration_approvers tra ON tra.tenant_id = time_entries.tenant_id AND tra.team_member_id = tm.id
        JOIN time_registration_approver_assignments traa ON traa.approver_team_member_id = tm.id AND traa.tenant_id = time_entries.tenant_id
        WHERE tm.user_id = auth.uid() AND tm.is_active = true
        AND (
          (traa.scope = 'member' AND traa.team_member_id = time_entries.team_member_id)
          OR (traa.scope = 'team' AND traa.team_id IN (SELECT team_id FROM team_member_teams WHERE team_member_id = time_entries.team_member_id))
        )
      )
    )
  );

-- 3) Replace time_entries UPDATE policy for approval: same hierarchy
DROP POLICY IF EXISTS "Admins managers approvers can update time_entries for approval" ON time_entries;

CREATE POLICY "Admins managers approvers can update time_entries for approval"
  ON time_entries FOR UPDATE TO authenticated
  USING (
    user_has_tenant_access(tenant_id)
    AND EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.tenant_id = time_entries.tenant_id AND tm.user_id = auth.uid() AND tm.is_active = true
      AND (
        (tm.role = 'admin')
        OR (tm.role = 'manager' AND EXISTS (
          SELECT 1 FROM teams t
          JOIN team_member_teams tmt ON tmt.team_id = t.id AND tmt.team_member_id = time_entries.team_member_id
          WHERE t.tenant_id = time_entries.tenant_id AND t.manager_team_member_id = tm.id
        ))
        OR (EXISTS (SELECT 1 FROM time_registration_approvers tra WHERE tra.tenant_id = time_entries.tenant_id AND tra.team_member_id = tm.id)
          AND EXISTS (
            SELECT 1 FROM time_registration_approver_assignments traa
            WHERE traa.approver_team_member_id = tm.id AND traa.tenant_id = time_entries.tenant_id
            AND (
              (traa.scope = 'member' AND traa.team_member_id = time_entries.team_member_id)
              OR (traa.scope = 'team' AND traa.team_id IN (SELECT team_id FROM team_member_teams WHERE team_member_id = time_entries.team_member_id))
            )
          ))
      )
    )
  );
