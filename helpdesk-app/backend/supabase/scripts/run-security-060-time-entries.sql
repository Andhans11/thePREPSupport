-- Security fix H1: Replace is_team_member() with user_has_tenant_access(tenant_id)
-- on time_entries INSERT, own-UPDATE, and DELETE policies.
-- Run this in Supabase Dashboard SQL Editor.

-- Fix INSERT policy
DROP POLICY IF EXISTS "Team members can insert own time_entries" ON time_entries;
CREATE POLICY "Team members can insert own time_entries"
  ON time_entries FOR INSERT TO authenticated
  WITH CHECK (
    user_has_tenant_access(tenant_id)
    AND team_member_id IN (
      SELECT id FROM team_members
      WHERE user_id = auth.uid() AND tenant_id = time_entries.tenant_id
    )
  );

-- Fix own-UPDATE policy
DROP POLICY IF EXISTS "Team members can update own time_entries when draft or submitted" ON time_entries;
CREATE POLICY "Team members can update own time_entries when draft or submitted"
  ON time_entries FOR UPDATE TO authenticated
  USING (
    user_has_tenant_access(tenant_id)
    AND team_member_id IN (
      SELECT id FROM team_members
      WHERE user_id = auth.uid() AND tenant_id = time_entries.tenant_id
    )
  );

-- Fix DELETE policy
DROP POLICY IF EXISTS "Team members can delete own draft time_entries" ON time_entries;
CREATE POLICY "Team members can delete own draft time_entries"
  ON time_entries FOR DELETE TO authenticated
  USING (
    user_has_tenant_access(tenant_id)
    AND status = 'draft'
    AND team_member_id IN (
      SELECT id FROM team_members
      WHERE user_id = auth.uid() AND tenant_id = time_entries.tenant_id
    )
  );
