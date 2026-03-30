-- Strengthen message notifications:
-- 1) Include team managers (teams.manager_team_member_id) in team activity, not only team_member_teams.
-- 2) Avoid duplicate alerts: team broadcast skips users in mentioned_user_ids (they get mention notifications).
-- 3) If assignee is @mentioned on an internal note, only the mention notifier runs (not generic owner line).
-- 4) Mention notifier skips the author (created_by).

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
  v_mentions UUID[];
BEGIN
  SELECT t.assigned_to, t.team_id, t.tenant_id, t.ticket_number, t.subject
    INTO v_assigned_to, v_team_id, v_tenant_id, v_ticket_number, v_subject
  FROM tickets t
  WHERE t.id = NEW.ticket_id;

  v_mentions := COALESCE(NEW.mentioned_user_ids, '{}'::uuid[]);

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

  -- Owner/assignee: skip if author is assignee; skip if internal note and assignee is @mentioned (mention trigger handles them).
  IF v_assigned_to IS NOT NULL
     AND (NEW.created_by IS NULL OR NEW.created_by IS DISTINCT FROM v_assigned_to)
     AND NOT (
       NEW.is_internal_note = true
       AND cardinality(v_mentions) > 0
       AND v_assigned_to = ANY (v_mentions)
     )
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

  -- Team: members of team + team manager; exclude actor, assignee, and @mentioned users (they get mention notifications).
  IF v_team_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, tenant_id, title, body, link, read_at)
    SELECT DISTINCT tm.user_id, v_tenant_id, v_title, v_body_team, v_link, NULL
    FROM (
      SELECT tmt.team_member_id AS member_id
      FROM team_member_teams tmt
      WHERE tmt.team_id = v_team_id
      UNION
      SELECT t.manager_team_member_id AS member_id
      FROM teams t
      WHERE t.id = v_team_id AND t.manager_team_member_id IS NOT NULL
    ) x
    JOIN team_members tm ON tm.id = x.member_id
    WHERE tm.tenant_id = v_tenant_id
      AND tm.is_active = true
      AND tm.user_id IS NOT NULL
      AND tm.notify_team_activity = true
      AND (NEW.created_by IS NULL OR tm.user_id IS DISTINCT FROM NEW.created_by)
      AND (v_assigned_to IS NULL OR tm.user_id IS DISTINCT FROM v_assigned_to)
      AND NOT (cardinality(v_mentions) > 0 AND tm.user_id = ANY (v_mentions));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_notify_assignee_on_message ON messages;
CREATE TRIGGER tr_notify_assignee_on_message
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE PROCEDURE notify_assignee_on_message();

CREATE OR REPLACE FUNCTION notify_message_mentions()
RETURNS TRIGGER AS $$
DECLARE
  uid UUID;
  ticket_subject TEXT;
  ticket_number_val TEXT;
  note_preview TEXT;
  body_text TEXT;
  title_base TEXT;
BEGIN
  IF NEW.mentioned_user_ids IS NULL OR array_length(NEW.mentioned_user_ids, 1) IS NULL OR array_length(NEW.mentioned_user_ids, 1) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT ticket_number, subject INTO ticket_number_val, ticket_subject FROM tickets WHERE id = NEW.ticket_id;
  note_preview := LEFT(TRIM(REGEXP_REPLACE(NEW.content, E'\\s+', ' ', 'g')), 80);
  IF LENGTH(NEW.content) > 80 THEN
    note_preview := note_preview || '…';
  END IF;
  body_text := COALESCE(ticket_number_val, 'Sak') || ' – ' || COALESCE(ticket_subject, '') || ': ' || note_preview;

  IF NEW.is_internal_note THEN
    title_base := CASE WHEN ticket_number_val IS NOT NULL AND ticket_number_val != '' THEN 'Du er nevnt i et notat (sak ' || ticket_number_val || ')' ELSE 'Du er nevnt i et notat' END;
  ELSE
    title_base := CASE WHEN ticket_number_val IS NOT NULL AND ticket_number_val != '' THEN 'Du er nevnt i et svar (sak ' || ticket_number_val || ')' ELSE 'Du er nevnt i et svar' END;
  END IF;

  FOREACH uid IN ARRAY NEW.mentioned_user_ids
  LOOP
    IF uid IS NOT NULL AND uid IS DISTINCT FROM NEW.created_by THEN
      INSERT INTO notifications (user_id, tenant_id, title, body, link, read_at)
      VALUES (
        uid,
        NEW.tenant_id,
        title_base,
        body_text,
        '/tickets?view=all&select=' || NEW.ticket_id::TEXT,
        NULL
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ticket updates: include team manager in «team» recipients (same as message path).
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
  SELECT DISTINCT tm.user_id, NEW.tenant_id, v_title, v_body, v_link, NULL
  FROM (
    SELECT tmt.team_member_id AS member_id
    FROM team_member_teams tmt
    WHERE tmt.team_id = NEW.team_id
    UNION
    SELECT t.manager_team_member_id AS member_id
    FROM teams t
    WHERE t.id = NEW.team_id AND t.manager_team_member_id IS NOT NULL
  ) x
  JOIN team_members tm ON tm.id = x.member_id
  WHERE tm.tenant_id = NEW.tenant_id
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
