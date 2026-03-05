-- Notify ticket assignee when: (1) customer replies, or (2) another user adds a note/reply.

CREATE OR REPLACE FUNCTION notify_assignee_on_message()
RETURNS TRIGGER AS $$
DECLARE
  v_assigned_to UUID;
  v_tenant_id UUID;
  v_ticket_number TEXT;
  v_subject TEXT;
  v_preview TEXT;
  v_title TEXT;
  v_link TEXT;
  v_author_name TEXT;
  v_comment_time TEXT;
BEGIN
  SELECT t.assigned_to, t.tenant_id, t.ticket_number, t.subject
  INTO v_assigned_to, v_tenant_id, v_ticket_number, v_subject
  FROM tickets t
  WHERE t.id = NEW.ticket_id;

  IF v_assigned_to IS NULL THEN
    RETURN NEW;
  END IF;

  -- Customer reply: always notify assignee
  IF NEW.is_customer = true THEN
    v_preview := LEFT(TRIM(REGEXP_REPLACE(NEW.content, E'\\s+', ' ', 'g')), 80);
    IF LENGTH(NEW.content) > 80 THEN
      v_preview := v_preview || '…';
    END IF;
    v_title := 'Kunde har svart på sak ' || COALESCE(v_ticket_number, NEW.ticket_id::TEXT);
    v_link := '/tickets?view=all&select=' || NEW.ticket_id::TEXT;
    INSERT INTO notifications (user_id, tenant_id, title, body, link, read_at)
    VALUES (v_assigned_to, v_tenant_id, v_title, COALESCE(v_subject, '') || ': ' || v_preview, v_link, NULL);
    RETURN NEW;
  END IF;

  -- Internal note or reply by another user: notify assignee if not the author
  IF NEW.is_internal_note = true OR (NEW.is_customer = false AND NEW.created_by IS NOT NULL) THEN
    IF NEW.created_by IS DISTINCT FROM v_assigned_to THEN
      SELECT COALESCE(name, email, 'Ukjent') INTO v_author_name
        FROM team_members WHERE user_id = NEW.created_by AND tenant_id = v_tenant_id AND is_active = true LIMIT 1;
      v_author_name := COALESCE(v_author_name, 'Ukjent');
      v_comment_time := to_char(NEW.created_at AT TIME ZONE 'Europe/Oslo', 'DD.MM.YYYY "kl." HH24:MI');
      v_preview := LEFT(TRIM(REGEXP_REPLACE(NEW.content, E'\\s+', ' ', 'g')), 80);
      IF LENGTH(NEW.content) > 80 THEN
        v_preview := v_preview || '…';
      END IF;
      v_title := 'Ny kommentar på sak ' || COALESCE(v_ticket_number, NEW.ticket_id::TEXT);
      v_link := '/tickets?view=all&select=' || NEW.ticket_id::TEXT;
      INSERT INTO notifications (user_id, tenant_id, title, body, link, read_at)
      VALUES (
        v_assigned_to,
        v_tenant_id,
        v_title,
        'Kommentert av ' || v_author_name || ' ' || v_comment_time || E'\n\n' || COALESCE(v_subject, '') || ': ' || v_preview,
        v_link,
        NULL
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_notify_assignee_on_message ON messages;
CREATE TRIGGER tr_notify_assignee_on_message
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE PROCEDURE notify_assignee_on_message();
