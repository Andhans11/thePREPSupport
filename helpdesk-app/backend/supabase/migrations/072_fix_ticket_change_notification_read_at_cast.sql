-- Fix read_at type errors when updating ticket owner/status (including archive).
-- Some environments may still have legacy function bodies writing text to notifications.read_at.

-- Canonical ticket/team change notifier with explicit timestamptz cast.
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

  -- Personal assignment notification.
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
      NULL::TIMESTAMPTZ
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
  SELECT tm.user_id, NEW.tenant_id, v_title, v_body, v_link, NULL::TIMESTAMPTZ
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

-- Keep trigger binding deterministic.
DROP TRIGGER IF EXISTS tr_notify_team_on_ticket_change ON tickets;
CREATE TRIGGER tr_notify_team_on_ticket_change
  AFTER UPDATE ON tickets
  FOR EACH ROW EXECUTE PROCEDURE notify_team_on_ticket_change();

-- Legacy safety: if older triggers/functions still exist, redefine them safely too.
CREATE OR REPLACE FUNCTION notify_ticket_assigned()
RETURNS TRIGGER AS $$
DECLARE
  ticket_subject TEXT;
  ticket_number_val TEXT;
BEGIN
  IF NEW.assigned_to IS NOT NULL AND (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
    SELECT ticket_number, subject INTO ticket_number_val, ticket_subject FROM tickets WHERE id = NEW.id;
    INSERT INTO notifications (user_id, tenant_id, title, body, link, read_at)
    VALUES (
      NEW.assigned_to,
      NEW.tenant_id,
      'Du er tildelt sak ' || COALESCE(ticket_number_val, NEW.id::TEXT),
      COALESCE(ticket_subject, 'Ingen emne'),
      '/tickets?view=all&select=' || NEW.id::TEXT,
      NULL::TIMESTAMPTZ
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION notify_ticket_status_changed()
RETURNS TRIGGER AS $$
DECLARE
  ticket_subject TEXT;
  ticket_number_val TEXT;
BEGIN
  IF NEW.assigned_to IS NOT NULL
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND (auth.uid() IS NULL OR NEW.assigned_to != auth.uid()) THEN
    SELECT ticket_number, subject INTO ticket_number_val, ticket_subject FROM tickets WHERE id = NEW.id;
    INSERT INTO notifications (user_id, tenant_id, title, body, link, read_at)
    VALUES (
      NEW.assigned_to,
      NEW.tenant_id,
      'Status endret på sak ' || COALESCE(ticket_number_val, NEW.id::TEXT),
      COALESCE(ticket_subject, 'Sak') || ' – ny status: ' || COALESCE(NEW.status, ''),
      '/tickets?view=all&select=' || NEW.id::TEXT,
      NULL::TIMESTAMPTZ
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
