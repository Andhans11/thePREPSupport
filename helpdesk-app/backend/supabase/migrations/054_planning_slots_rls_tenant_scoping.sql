-- Security fix C1: Replace is_team_member() with user_has_tenant_access(tenant_id)
-- to prevent cross-tenant read/write/delete on planning_slots.

DROP POLICY IF EXISTS "Team members can read planning_slots" ON planning_slots;
DROP POLICY IF EXISTS "Team members can insert planning_slots" ON planning_slots;
DROP POLICY IF EXISTS "Team members can update planning_slots" ON planning_slots;
DROP POLICY IF EXISTS "Team members can delete planning_slots" ON planning_slots;

CREATE POLICY "Team members can read planning_slots"
  ON planning_slots FOR SELECT TO authenticated
  USING (user_has_tenant_access(tenant_id));

CREATE POLICY "Team members can insert planning_slots"
  ON planning_slots FOR INSERT TO authenticated
  WITH CHECK (user_has_tenant_access(tenant_id));

CREATE POLICY "Team members can update planning_slots"
  ON planning_slots FOR UPDATE TO authenticated
  USING (user_has_tenant_access(tenant_id));

CREATE POLICY "Team members can delete planning_slots"
  ON planning_slots FOR DELETE TO authenticated
  USING (user_has_tenant_access(tenant_id));
