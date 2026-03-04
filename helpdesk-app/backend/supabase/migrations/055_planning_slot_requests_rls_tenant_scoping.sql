-- Security fix C2: Replace is_team_member() with user_has_tenant_access(tenant_id)
-- to prevent cross-tenant read/write on planning_slot_requests.

DROP POLICY IF EXISTS "Team members can read planning_slot_requests" ON planning_slot_requests;
DROP POLICY IF EXISTS "Team members can insert planning_slot_requests" ON planning_slot_requests;
DROP POLICY IF EXISTS "Managers and admins can update planning_slot_requests" ON planning_slot_requests;

CREATE POLICY "Team members can read planning_slot_requests"
  ON planning_slot_requests FOR SELECT TO authenticated
  USING (user_has_tenant_access(tenant_id));

CREATE POLICY "Team members can insert planning_slot_requests"
  ON planning_slot_requests FOR INSERT TO authenticated
  WITH CHECK (
    user_has_tenant_access(tenant_id)
    AND requested_by IN (SELECT id FROM team_members WHERE user_id = auth.uid() AND tenant_id = planning_slot_requests.tenant_id)
    AND EXISTS (
      SELECT 1 FROM planning_slots ps
      WHERE ps.id = planning_slot_requests.planning_slot_id
        AND ps.team_member_id = planning_slot_requests.requested_by
        AND ps.status = 'approved'
    )
  );

CREATE POLICY "Managers and admins can update planning_slot_requests"
  ON planning_slot_requests FOR UPDATE TO authenticated
  USING (
    user_has_tenant_access(tenant_id)
    AND EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid() AND tm.tenant_id = planning_slot_requests.tenant_id
        AND tm.role IN ('admin', 'manager')
    )
  );
