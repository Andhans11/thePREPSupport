-- Per-user notification preferences for ticket owner/team activity.
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS notify_owner_activity BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_team_activity BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_team_changes BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN team_members.notify_owner_activity IS 'When true, receive notifications when your owned/assigned tickets get customer replies or new notes/messages.';
COMMENT ON COLUMN team_members.notify_team_activity IS 'When true, receive notifications for new customer replies/notes/messages on tickets belonging to your teams.';
COMMENT ON COLUMN team_members.notify_team_changes IS 'When true, receive notifications for ticket changes (status/assignment/team/priority/subject) on tickets belonging to your teams.';

-- Replace owner-message notifier with owner + team notifier honoring preferences.
CREATE OR REPLACE FUNCTION notify_assignee_on_message()
RETURNS TRIGGER AS $$
DECLARE
  v_assigned_to UUID;
  v_team_id UUID;
  v_tenant_id UUID;
  v_ticket_number TEXT;
  v_subject TEXT;
  v_preview TEXT;
  v_title TEXT;
  v_link TEXT;
  v_author_name TEXT;
  v_body_owner TEXT;
  v_body_team TEXT;
BEGIN
  SELECT t.assigned_to, t.team_id, t.tenant_id, t.ticket_number, t.subject
    INTO v_assigned_to, v_team_id, v_tenant_id, v_ticket_number, v_subject
  FROM tickets t
  WHERE t.id = NEW.ticket_id;

  v_preview := LEFT(TRIM(REGEXP_REPLACE(COALESCE(NEW.content, ''), E'\\s+', ' ', 'g')), 120);
  IF LENGTH(COALESCE(NEW.content, '')) > 120 THEN
    v_preview := v_preview || '…';
  END IF;
  v_link := '/tickets?view=all&select=' || NEW.ticket_id::TEXT;

  IF NEW.is_customer = true THEN
    v_title := 'Kunde har svart på sak ' || COALESCE(v_ticket_number, NEW.ticket_id::TEXT);
    v_body_owner := COALESCE(v_subject, '') || ': ' || v_preview;
    v_body_team := 'Kunde har svart. ' || COALESCE(v_subject, '') || ': ' || v_preview;
  ELSE
    SELECT COALESCE(name, email, 'Ukjent') INTO v_author_name
    FROM team_members
    WHERE user_id = NEW.created_by AND tenant_id = v_tenant_id AND is_active = true
    LIMIT 1;
    v_author_name := COALESCE(v_author_name, 'Ukjent');

    IF NEW.is_internal_note = true THEN
      v_title := 'Nytt notat på sak ' || COALESCE(v_ticket_number, NEW.ticket_id::TEXT);
      v_body_owner := 'Notat fra ' || v_author_name || '. ' || COALESCE(v_subject, '') || ': ' || v_preview;
      v_body_team := 'Nytt notat fra ' || v_author_name || '. ' || COALESCE(v_subject, '') || ': ' || v_preview;
    ELSE
      v_title := 'Ny melding på sak ' || COALESCE(v_ticket_number, NEW.ticket_id::TEXT);
      v_body_owner := 'Melding fra ' || v_author_name || '. ' || COALESCE(v_subject, '') || ': ' || v_preview;
      v_body_team := 'Ny melding fra ' || v_author_name || '. ' || COALESCE(v_subject, '') || ': ' || v_preview;
    END IF;
  END IF;

  -- Owner/assignee notification.
  IF v_assigned_to IS NOT NULL
     AND (NEW.created_by IS NULL OR NEW.created_by IS DISTINCT FROM v_assigned_to)
     AND EXISTS (
       SELECT 1 FROM team_members tm
       WHERE tm.tenant_id = v_tenant_id
         AND tm.user_id = v_assigned_to
         AND tm.is_active = true
         AND tm.notify_owner_activity = true
     ) THEN
    INSERT INTO notifications (user_id, tenant_id, title, body, link, read_at)
    VALUES (v_assigned_to, v_tenant_id, v_title, v_body_owner, v_link, NULL);
  END IF;

  -- Team notifications (exclude actor and already-notified owner).
  IF v_team_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, tenant_id, title, body, link, read_at)
    SELECT tm.user_id, v_tenant_id, v_title, v_body_team, v_link, NULL
    FROM team_member_teams tmt
    JOIN team_members tm ON tm.id = tmt.team_member_id
    WHERE tmt.team_id = v_team_id
      AND tm.tenant_id = v_tenant_id
      AND tm.is_active = true
      AND tm.user_id IS NOT NULL
      AND tm.notify_team_activity = true
      AND (NEW.created_by IS NULL OR tm.user_id IS DISTINCT FROM NEW.created_by)
      AND (v_assigned_to IS NULL OR tm.user_id IS DISTINCT FROM v_assigned_to);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_notify_assignee_on_message ON messages;
CREATE TRIGGER tr_notify_assignee_on_message
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE PROCEDURE notify_assignee_on_message();

-- Team change notifications for ticket updates.
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
  v_link := '/tickets?view=all&select=' || NEW.id::TEXT;

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
