-- Improve notification details:
-- - ticket changes include who changed what and when
-- - message notifications clarify when a new customer email arrives
-- - keep read_at writes explicitly typed as timestamptz

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
  v_event_time TEXT;
BEGIN
  SELECT t.assigned_to, t.team_id, t.tenant_id, t.ticket_number, t.subject
    INTO v_assigned_to, v_team_id, v_tenant_id, v_ticket_number, v_subject
  FROM tickets t
  WHERE t.id = NEW.ticket_id;

  v_event_time := to_char(now() AT TIME ZONE 'Europe/Oslo', 'DD.MM.YYYY HH24:MI');
  v_preview := LEFT(TRIM(REGEXP_REPLACE(COALESCE(NEW.content, ''), E'\\s+', ' ', 'g')), 140);
  IF LENGTH(COALESCE(NEW.content, '')) > 140 THEN
    v_preview := v_preview || '…';
  END IF;
  v_link := '/tickets?view=all&select=' || NEW.ticket_id::TEXT;

  IF NEW.is_customer = true THEN
    v_title := 'Ny e-post på sak ' || COALESCE(v_ticket_number, NEW.ticket_id::TEXT);
    v_body_owner := 'Kunde svarte ' || v_event_time || E'.\n' || COALESCE(v_subject, '(uten emne)') || ': ' || v_preview;
    v_body_team := 'Ny kunde-e-post ' || v_event_time || E'.\n' || COALESCE(v_subject, '(uten emne)') || ': ' || v_preview;
  ELSE
    SELECT COALESCE(name, email, 'Ukjent') INTO v_author_name
    FROM team_members
    WHERE user_id = NEW.created_by AND tenant_id = v_tenant_id AND is_active = true
    LIMIT 1;
    v_author_name := COALESCE(v_author_name, 'Ukjent');

    IF NEW.is_internal_note = true THEN
      v_title := 'Nytt notat på sak ' || COALESCE(v_ticket_number, NEW.ticket_id::TEXT);
      v_body_owner := 'Notat fra ' || v_author_name || ' ' || v_event_time || E'.\n' || COALESCE(v_subject, '(uten emne)') || ': ' || v_preview;
      v_body_team := 'Nytt notat fra ' || v_author_name || ' ' || v_event_time || E'.\n' || COALESCE(v_subject, '(uten emne)') || ': ' || v_preview;
    ELSE
      v_title := 'Ny melding på sak ' || COALESCE(v_ticket_number, NEW.ticket_id::TEXT);
      v_body_owner := 'Melding fra ' || v_author_name || ' ' || v_event_time || E'.\n' || COALESCE(v_subject, '(uten emne)') || ': ' || v_preview;
      v_body_team := 'Ny melding fra ' || v_author_name || ' ' || v_event_time || E'.\n' || COALESCE(v_subject, '(uten emne)') || ': ' || v_preview;
    END IF;
  END IF;

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
    VALUES (v_assigned_to, v_tenant_id, v_title, v_body_owner, v_link, NULL::TIMESTAMPTZ);
  END IF;

  IF v_team_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, tenant_id, title, body, link, read_at)
    SELECT tm.user_id, v_tenant_id, v_title, v_body_team, v_link, NULL::TIMESTAMPTZ
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

CREATE OR REPLACE FUNCTION notify_team_on_ticket_change()
RETURNS TRIGGER AS $$
DECLARE
  v_title TEXT;
  v_body TEXT;
  v_link TEXT;
  v_actor_name TEXT;
  v_event_time TEXT;
  v_old_assignee_name TEXT;
  v_new_assignee_name TEXT;
  v_old_team_name TEXT;
  v_new_team_name TEXT;
  v_changes TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  v_link := '/tickets?view=all&select=' || NEW.id::TEXT;
  v_event_time := to_char(now() AT TIME ZONE 'Europe/Oslo', 'DD.MM.YYYY HH24:MI');

  SELECT COALESCE(tm.name, tm.email, 'Systemet') INTO v_actor_name
  FROM team_members tm
  WHERE tm.tenant_id = NEW.tenant_id
    AND tm.user_id = auth.uid()
    AND tm.is_active = true
  LIMIT 1;
  v_actor_name := COALESCE(v_actor_name, 'Systemet');

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
      'Tildelt av ' || v_actor_name || ' ' || v_event_time || E'.\n' || COALESCE(NEW.subject, 'Ingen emne'),
      v_link,
      NULL::TIMESTAMPTZ
    );
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

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    v_changes := array_append(v_changes, 'Status: ' || COALESCE(OLD.status, 'ukjent') || ' -> ' || COALESCE(NEW.status, 'ukjent'));
  END IF;

  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    v_changes := array_append(v_changes, 'Prioritet: ' || COALESCE(OLD.priority, 'ukjent') || ' -> ' || COALESCE(NEW.priority, 'ukjent'));
  END IF;

  IF OLD.subject IS DISTINCT FROM NEW.subject THEN
    v_changes := array_append(v_changes, 'Emne: "' || COALESCE(NEW.subject, '(uten emne)') || '"');
  END IF;

  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    SELECT COALESCE(name, email, 'Ingen') INTO v_old_assignee_name
    FROM team_members
    WHERE tenant_id = NEW.tenant_id AND user_id = OLD.assigned_to
    LIMIT 1;
    SELECT COALESCE(name, email, 'Ingen') INTO v_new_assignee_name
    FROM team_members
    WHERE tenant_id = NEW.tenant_id AND user_id = NEW.assigned_to
    LIMIT 1;
    v_changes := array_append(v_changes, 'Ansvarlig: ' || COALESCE(v_old_assignee_name, 'Ingen') || ' -> ' || COALESCE(v_new_assignee_name, 'Ingen'));
  END IF;

  IF OLD.team_id IS DISTINCT FROM NEW.team_id THEN
    SELECT COALESCE(name, 'Ukjent team') INTO v_old_team_name FROM teams WHERE id = OLD.team_id LIMIT 1;
    SELECT COALESCE(name, 'Ukjent team') INTO v_new_team_name FROM teams WHERE id = NEW.team_id LIMIT 1;
    v_changes := array_append(v_changes, 'Team: ' || COALESCE(v_old_team_name, 'Ukjent team') || ' -> ' || COALESCE(v_new_team_name, 'Ukjent team'));
  END IF;

  v_title := 'Endring på sak ' || COALESCE(NEW.ticket_number, NEW.id::TEXT);
  v_body := 'Endret av ' || v_actor_name || ' ' || v_event_time || E'.\n' || array_to_string(v_changes, E'\n');

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
