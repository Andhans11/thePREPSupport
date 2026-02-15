-- Planning slots: add status (pending | approved | rejected) and created_by.
-- Agents see only their slots and can approve/reject; manager/admin add slots and see status.

ALTER TABLE planning_slots
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES team_members(id) ON DELETE SET NULL;

COMMENT ON COLUMN planning_slots.status IS 'pending = awaiting agent approval; approved/rejected by agent.';
COMMENT ON COLUMN planning_slots.created_by IS 'Team member (manager/admin) who added the slot.';

CREATE INDEX IF NOT EXISTS idx_planning_slots_status ON planning_slots(tenant_id, status);

-- Notify managers and admins when an agent approves or rejects a slot
CREATE OR REPLACE FUNCTION notify_planning_slot_status_changed()
RETURNS TRIGGER AS $$
DECLARE
  slot_range TEXT;
  agent_name TEXT;
  r RECORD;
BEGIN
  IF OLD.status = 'pending' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'rejected') THEN
    slot_range := format_slot_range(NEW.start_at, NEW.end_at);
    SELECT tm.name INTO agent_name
      FROM team_members tm WHERE tm.id = NEW.team_member_id;
    agent_name := COALESCE(agent_name, 'En agent');

    FOR r IN
      SELECT tm.user_id
      FROM team_members tm
      WHERE tm.tenant_id = NEW.tenant_id
        AND tm.user_id IS NOT NULL
        AND tm.role IN ('admin', 'manager')
    LOOP
      INSERT INTO notifications (user_id, tenant_id, title, body, link, read_at)
      VALUES (
        r.user_id,
        NEW.tenant_id,
        CASE WHEN NEW.status = 'approved' THEN 'Planlegging godkjent' ELSE 'Planlegging avvist' END,
        agent_name || ' har ' || CASE WHEN NEW.status = 'approved' THEN 'godkjent' ELSE 'avvist' END || ' vakt: ' || slot_range,
        '/planning',
        NULL
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_notify_planning_slot_status_changed ON planning_slots;
CREATE TRIGGER tr_notify_planning_slot_status_changed
  AFTER UPDATE OF status ON planning_slots
  FOR EACH ROW
  EXECUTE PROCEDURE notify_planning_slot_status_changed();
