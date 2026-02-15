-- Add optional rejection comment and notify assigned user on approve/reject.

ALTER TABLE planning_slots
  ADD COLUMN IF NOT EXISTS rejection_comment TEXT;

COMMENT ON COLUMN planning_slots.rejection_comment IS 'Optional reason when status is rejected; shown to the assigned user.';

-- Notify managers/admins AND the assigned user when status changes to approved/rejected.
-- Assigned user gets approval or rejection (with comment) so they know the outcome.
CREATE OR REPLACE FUNCTION notify_planning_slot_status_changed()
RETURNS TRIGGER AS $$
DECLARE
  slot_range TEXT;
  agent_name TEXT;
  r RECORD;
  assigned_user_id UUID;
  body_for_assigned TEXT;
BEGIN
  IF OLD.status = 'pending' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'rejected') THEN
    slot_range := format_slot_range(NEW.start_at, NEW.end_at);
    SELECT tm.name INTO agent_name
      FROM team_members tm WHERE tm.id = NEW.team_member_id;
    agent_name := COALESCE(agent_name, 'En agent');

    -- Notify all managers and admins (existing behaviour)
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

    -- Notify the assigned user (the one who "applied" / was assigned the slot)
    SELECT tm.user_id INTO assigned_user_id
      FROM team_members tm WHERE tm.id = NEW.team_member_id AND tm.user_id IS NOT NULL;
    IF assigned_user_id IS NOT NULL THEN
      IF NEW.status = 'approved' THEN
        body_for_assigned := 'Vakten din er godkjent: ' || slot_range;
      ELSE
        body_for_assigned := 'Vakten er avvist: ' || slot_range;
        IF NEW.rejection_comment IS NOT NULL AND trim(NEW.rejection_comment) <> '' THEN
          body_for_assigned := body_for_assigned || E'\n\nBegrunnelse: ' || trim(NEW.rejection_comment);
        END IF;
      END IF;
      INSERT INTO notifications (user_id, tenant_id, title, body, link, read_at)
      VALUES (
        assigned_user_id,
        NEW.tenant_id,
        CASE WHEN NEW.status = 'approved' THEN 'Vakt godkjent' ELSE 'Vakt avvist' END,
        body_for_assigned,
        '/planning',
        NULL
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
