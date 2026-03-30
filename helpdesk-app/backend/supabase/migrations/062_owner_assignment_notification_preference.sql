-- Add explicit preference for assignment notifications to ticket owner.
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS notify_owner_assignment BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN team_members.notify_owner_assignment IS
  'When true, receive notifications when a ticket is assigned to you.';

-- Replace assignment/status triggers to honor preferences.
DROP TRIGGER IF EXISTS tr_notify_ticket_assigned ON tickets;
DROP TRIGGER IF EXISTS tr_notify_ticket_status_changed ON tickets;

-- Recreate team-change trigger to include assignment-to-me with owner preference.
CREATE OR REPLACE FUNCTION notify_team_on_ticket_change()
RETURNS TRIGGER AS $$
DECLARE
  v_title TEXT;
  v_body TEXT;
  v_link TEXT;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  v_link := '/tickets?view=all&select=' || NEW.id::TEXT;

  -- Personal assignment notification (assigned_to changed to this user).
  IF NEW.assigned_to IS NOT NULL
     AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to
     AND EXISTS (
       SELECT 1 FROM team_members tm
       WHERE tm.tenant_id = NEW.tenant_id
         AND tm.user_id = NEW.assigned_to
         AND tm.is_active = true
         AND tm.notify_owner_assignment = true
     ) THEN
    INSERT INTO notifications (user_id, tenant_id, title, body, link, read_at)
    VALUES (
      NEW.assigned_to,
      NEW.tenant_id,
      'Du er tildelt sak ' || COALESCE(NEW.ticket_number, NEW.id::TEXT),
      COALESCE(NEW.subject, 'Ingen emne'),
      v_link,
      NULL
    );
  END IF;

  -- Team-change notifications.
  IF NEW.team_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.assigned_to IS NOT DISTINCT FROM NEW.assigned_to
     AND OLD.team_id IS NOT DISTINCT FROM NEW.team_id
     AND OLD.priority IS NOT DISTINCT FROM NEW.priority
     AND OLD.subject IS NOT DISTINCT FROM NEW.subject THEN
    RETURN NEW;
  END IF;

  v_title := 'Endring på sak ' || COALESCE(NEW.ticket_number, NEW.id::TEXT);
  v_body := COALESCE(NEW.subject, 'Sak oppdatert');

  INSERT INTO notifications (user_id, tenant_id, title, body, link, read_at)
  SELECT tm.user_id, NEW.tenant_id, v_title, v_body, v_link, NULL
  FROM team_member_teams tmt
  JOIN team_members tm ON tm.id = tmt.team_member_id
  WHERE tmt.team_id = NEW.team_id
    AND tm.tenant_id = NEW.tenant_id
    AND tm.is_active = true
    AND tm.user_id IS NOT NULL
    AND tm.notify_team_changes = true
    AND (auth.uid() IS NULL OR tm.user_id <> auth.uid());

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_notify_team_on_ticket_change ON tickets;
CREATE TRIGGER tr_notify_team_on_ticket_change
  AFTER UPDATE ON tickets
  FOR EACH ROW EXECUTE PROCEDURE notify_team_on_ticket_change();
