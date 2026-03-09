-- Security fix C1: Prevent non-admin team members from promoting themselves.
-- Split the permissive UPDATE policy into two: own-profile + admin-only.
-- Add a trigger to block role changes by non-admins even on their own row.

-- 1. Drop the overly permissive UPDATE policy
DROP POLICY IF EXISTS "Team members can update team_members" ON team_members;

-- 2. Non-admin members can update their own row only
CREATE POLICY "Team members can update own profile"
  ON team_members FOR UPDATE TO authenticated
  USING (
    user_has_tenant_access(tenant_id)
    AND user_id = auth.uid()
  );

-- 3. Admins can update any team member in their tenant
CREATE POLICY "Admins can update any team member"
  ON team_members FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members admin_tm
      WHERE admin_tm.tenant_id = team_members.tenant_id
        AND admin_tm.user_id = auth.uid()
        AND admin_tm.is_active = true
        AND admin_tm.role = 'admin'
    )
  );

-- 4. Trigger: block role changes by non-admins (even on own row)
CREATE OR REPLACE FUNCTION prevent_non_admin_role_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF NOT EXISTS (
      SELECT 1 FROM team_members
      WHERE tenant_id = NEW.tenant_id
        AND user_id = auth.uid()
        AND is_active = true
        AND role = 'admin'
    ) THEN
      RAISE EXCEPTION 'Only admins can change roles';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_prevent_non_admin_role_change ON team_members;
CREATE TRIGGER tr_prevent_non_admin_role_change
  BEFORE UPDATE ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION prevent_non_admin_role_change();
