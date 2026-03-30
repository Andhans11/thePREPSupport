-- Agents: only tickets assigned to them or tickets whose team_id is one of their teams.
-- Admin, manager, viewer: unchanged (full tenant ticket access).

CREATE OR REPLACE FUNCTION ticket_readable_by_current_user(tenant_uuid uuid, ticket_team_id uuid, ticket_assigned_to uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r text;
  tm_id uuid;
BEGIN
  SELECT tm.role::text, tm.id INTO r, tm_id
  FROM team_members tm
  WHERE tm.user_id = auth.uid() AND tm.tenant_id = tenant_uuid AND tm.is_active = true
  LIMIT 1;

  IF r IS NULL THEN
    RETURN false;
  END IF;

  IF r IN ('admin', 'manager', 'viewer') THEN
    RETURN true;
  END IF;

  IF r = 'agent' THEN
    IF ticket_assigned_to IS NOT NULL AND ticket_assigned_to = auth.uid() THEN
      RETURN true;
    END IF;
    IF ticket_team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM team_member_teams tmt
      WHERE tmt.team_member_id = tm_id AND tmt.team_id = ticket_team_id
    ) THEN
      RETURN true;
    END IF;
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

DROP POLICY IF EXISTS "Team members can read tickets" ON tickets;
DROP POLICY IF EXISTS "Team members can update tickets" ON tickets;

CREATE POLICY "Team members can read tickets" ON tickets FOR SELECT TO authenticated
  USING (
    user_has_tenant_access(tenant_id)
    AND ticket_readable_by_current_user(tenant_id, team_id, assigned_to)
  );

CREATE POLICY "Team members can update tickets" ON tickets FOR UPDATE TO authenticated
  USING (
    user_has_tenant_access(tenant_id)
    AND ticket_readable_by_current_user(tenant_id, team_id, assigned_to)
  )
  WITH CHECK (
    user_has_tenant_access(tenant_id)
    AND ticket_readable_by_current_user(tenant_id, team_id, assigned_to)
  );

DROP POLICY IF EXISTS "Team members can read messages" ON messages;
DROP POLICY IF EXISTS "Team members can insert messages" ON messages;
DROP POLICY IF EXISTS "Team members can update messages" ON messages;

CREATE POLICY "Team members can read messages" ON messages FOR SELECT TO authenticated
  USING (
    user_has_tenant_access(tenant_id)
    AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = messages.ticket_id
        AND t.tenant_id = messages.tenant_id
        AND ticket_readable_by_current_user(t.tenant_id, t.team_id, t.assigned_to)
    )
  );

CREATE POLICY "Team members can insert messages" ON messages FOR INSERT TO authenticated
  WITH CHECK (
    user_has_tenant_access(tenant_id)
    AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = messages.ticket_id
        AND t.tenant_id = messages.tenant_id
        AND ticket_readable_by_current_user(t.tenant_id, t.team_id, t.assigned_to)
    )
  );

CREATE POLICY "Team members can update messages" ON messages FOR UPDATE TO authenticated
  USING (
    user_has_tenant_access(tenant_id)
    AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = messages.ticket_id
        AND t.tenant_id = messages.tenant_id
        AND ticket_readable_by_current_user(t.tenant_id, t.team_id, t.assigned_to)
    )
  )
  WITH CHECK (
    user_has_tenant_access(tenant_id)
    AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = messages.ticket_id
        AND t.tenant_id = messages.tenant_id
        AND ticket_readable_by_current_user(t.tenant_id, t.team_id, t.assigned_to)
    )
  );

COMMENT ON FUNCTION ticket_readable_by_current_user(uuid, uuid, uuid) IS 'RLS helper: agents see tickets assigned to them or in their teams; others see all tenant tickets.';
