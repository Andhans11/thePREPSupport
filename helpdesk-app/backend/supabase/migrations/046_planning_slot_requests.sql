-- Requests from assigned user to change or remove an approved planning slot. Manager/admin must approve or reject.

CREATE TABLE IF NOT EXISTS planning_slot_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  planning_slot_id UUID NOT NULL REFERENCES planning_slots(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('change', 'remove')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_start_at TIMESTAMP WITH TIME ZONE,
  requested_end_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT planning_slot_requests_change_times CHECK (
    request_type <> 'change' OR (requested_start_at IS NOT NULL AND requested_end_at IS NOT NULL AND requested_end_at > requested_start_at)
  )
);

CREATE INDEX IF NOT EXISTS idx_planning_slot_requests_tenant ON planning_slot_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_planning_slot_requests_slot ON planning_slot_requests(planning_slot_id);
CREATE INDEX IF NOT EXISTS idx_planning_slot_requests_status ON planning_slot_requests(tenant_id, status);

COMMENT ON TABLE planning_slot_requests IS 'User requests to change or remove an approved planning slot; manager/admin approves or rejects.';

ALTER TABLE planning_slot_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can read planning_slot_requests"
  ON planning_slot_requests FOR SELECT TO authenticated
  USING (is_team_member());

-- Requester must be the team member assigned to the slot; slot must be approved
CREATE POLICY "Team members can insert planning_slot_requests"
  ON planning_slot_requests FOR INSERT TO authenticated
  WITH CHECK (
    is_team_member()
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
    is_team_member()
    AND EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid() AND tm.tenant_id = planning_slot_requests.tenant_id
        AND tm.role IN ('admin', 'manager')
    )
  );

-- Trigger: notify assigned user when request is approved/rejected
CREATE OR REPLACE FUNCTION notify_planning_slot_request_reviewed()
RETURNS TRIGGER AS $$
DECLARE
  slot_range TEXT;
  r RECORD;
  target_user_id UUID;
BEGIN
  IF OLD.status = 'pending' AND NEW.status IS DISTINCT FROM 'pending' THEN
    SELECT tm.user_id INTO target_user_id
      FROM team_members tm WHERE tm.id = NEW.requested_by AND tm.user_id IS NOT NULL;
    IF target_user_id IS NOT NULL THEN
      SELECT format_slot_range(ps.start_at, ps.end_at) INTO slot_range
        FROM planning_slots ps WHERE ps.id = NEW.planning_slot_id;
      slot_range := COALESCE(slot_range, 'vakt');
      INSERT INTO notifications (user_id, tenant_id, title, body, link, read_at)
      VALUES (
        target_user_id,
        NEW.tenant_id,
        CASE WHEN NEW.status = 'approved' THEN 'Forespørsel godkjent' ELSE 'Forespørsel avvist' END,
        'Din forespørsel om ' || CASE NEW.request_type WHEN 'remove' THEN 'fjerning' ELSE 'endring' END || ' av vakt (' || slot_range || ') er ' || CASE WHEN NEW.status = 'approved' THEN 'godkjent' ELSE 'avvist' END || '.',
        '/planning',
        NULL
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_notify_planning_slot_request_reviewed ON planning_slot_requests;
CREATE TRIGGER tr_notify_planning_slot_request_reviewed
  AFTER UPDATE OF status ON planning_slot_requests
  FOR EACH ROW
  EXECUTE PROCEDURE notify_planning_slot_request_reviewed();

-- Notify managers/admins when a new request is created
CREATE OR REPLACE FUNCTION notify_planning_slot_request_created()
RETURNS TRIGGER AS $$
DECLARE
  slot_range TEXT;
  requester_name TEXT;
  r RECORD;
BEGIN
  SELECT format_slot_range(ps.start_at, ps.end_at) INTO slot_range
    FROM planning_slots ps WHERE ps.id = NEW.planning_slot_id;
  SELECT name INTO requester_name FROM team_members WHERE id = NEW.requested_by;
  requester_name := COALESCE(requester_name, 'En bruker');
  slot_range := COALESCE(slot_range, 'vakt');
  FOR r IN
    SELECT tm.user_id
    FROM team_members tm
    WHERE tm.tenant_id = NEW.tenant_id AND tm.user_id IS NOT NULL AND tm.role IN ('admin', 'manager')
  LOOP
    INSERT INTO notifications (user_id, tenant_id, title, body, link, read_at)
    VALUES (
      r.user_id,
      NEW.tenant_id,
      'Forespørsel om vakt',
      requester_name || ' ber om ' || CASE NEW.request_type WHEN 'remove' THEN 'å fjerne' ELSE 'å endre' END || ' vakt: ' || slot_range,
      '/planning',
      NULL
    );
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_notify_planning_slot_request_created ON planning_slot_requests;
CREATE TRIGGER tr_notify_planning_slot_request_created
  AFTER INSERT ON planning_slot_requests
  FOR EACH ROW
  EXECUTE PROCEDURE notify_planning_slot_request_created();

-- Keep updated_at in sync
CREATE OR REPLACE FUNCTION set_planning_slot_request_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS tr_planning_slot_requests_updated_at ON planning_slot_requests;
CREATE TRIGGER tr_planning_slot_requests_updated_at
  BEFORE UPDATE ON planning_slot_requests
  FOR EACH ROW
  EXECUTE PROCEDURE set_planning_slot_request_updated_at();
