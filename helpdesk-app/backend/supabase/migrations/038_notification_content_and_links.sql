-- Richer notification content: include what changed (times, ticket numbers, status).
-- Also use view=all for ticket links so the ticket is in the list when opening from notification.

-- Helper: format timestamp range for Norwegian display (e.g. "15. feb 14:00–16:00")
CREATE OR REPLACE FUNCTION format_slot_range(p_start TIMESTAMP WITH TIME ZONE, p_end TIMESTAMP WITH TIME ZONE)
RETURNS TEXT AS $$
  SELECT to_char(p_start AT TIME ZONE 'Europe/Oslo', 'DD. Mon ') ||
         to_char(p_start AT TIME ZONE 'Europe/Oslo', 'HH24:MI') || '–' ||
         to_char(p_end AT TIME ZONE 'Europe/Oslo', 'HH24:MI');
$$ LANGUAGE sql STABLE;

-- 1) Planning slot inserted: show the time you were added to
CREATE OR REPLACE FUNCTION notify_planning_slot_inserted()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id UUID;
  slot_range TEXT;
BEGIN
  target_user_id := get_user_id_from_team_member(NEW.team_member_id);
  IF target_user_id IS NOT NULL THEN
    slot_range := format_slot_range(NEW.start_at, NEW.end_at);
    INSERT INTO notifications (user_id, tenant_id, title, body, link, read_at)
    VALUES (
      target_user_id,
      NEW.tenant_id,
      'Du er lagt til i en planlegging',
      'Tid: ' || slot_range,
      '/planning',
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2) Planning slot updated: show new time (and old if we want); for reassignment, show new time
CREATE OR REPLACE FUNCTION notify_planning_slot_updated()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id UUID;
  new_range TEXT;
  old_range TEXT;
  body_text TEXT;
BEGIN
  target_user_id := get_user_id_from_team_member(NEW.team_member_id);
  IF target_user_id IS NOT NULL THEN
    new_range := format_slot_range(NEW.start_at, NEW.end_at);
    old_range := format_slot_range(OLD.start_at, OLD.end_at);
    IF OLD.start_at IS DISTINCT FROM NEW.start_at OR OLD.end_at IS DISTINCT FROM NEW.end_at THEN
      body_text := 'Ny tid: ' || new_range || ' (tidligere: ' || old_range || ')';
    ELSIF OLD.team_member_id IS DISTINCT FROM NEW.team_member_id THEN
      body_text := 'Du er flyttet til tid: ' || new_range;
    ELSE
      body_text := 'Tid: ' || new_range;
    END IF;
    INSERT INTO notifications (user_id, tenant_id, title, body, link, read_at)
    VALUES (
      target_user_id,
      NEW.tenant_id,
      'En planlegging du er med i er endret',
      body_text,
      '/planning',
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3) Planning slot deleted: show which time was removed
CREATE OR REPLACE FUNCTION notify_planning_slot_deleted()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id UUID;
  slot_range TEXT;
BEGIN
  target_user_id := get_user_id_from_team_member(OLD.team_member_id);
  IF target_user_id IS NOT NULL THEN
    slot_range := format_slot_range(OLD.start_at, OLD.end_at);
    INSERT INTO notifications (user_id, tenant_id, title, body, link, read_at)
    VALUES (
      target_user_id,
      OLD.tenant_id,
      'En planlegging du var med i er fjernet',
      'Fjernet tid: ' || slot_range,
      '/planning',
      NULL
    );
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4) Ticket assigned: include ticket number and subject
CREATE OR REPLACE FUNCTION notify_ticket_assigned()
RETURNS TRIGGER AS $$
DECLARE
  ticket_subject TEXT;
  ticket_number_val TEXT;
  ticket_tenant_id UUID;
BEGIN
  IF NEW.assigned_to IS NOT NULL AND (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
    ticket_tenant_id := NEW.tenant_id;
    SELECT ticket_number, subject INTO ticket_number_val, ticket_subject FROM tickets WHERE id = NEW.id;
    INSERT INTO notifications (user_id, tenant_id, title, body, link, read_at)
    VALUES (
      NEW.assigned_to,
      ticket_tenant_id,
      'Du er tildelt sak ' || COALESCE(ticket_number_val, NEW.id::TEXT),
      COALESCE(ticket_subject, 'Ingen emne'),
      '/tickets?view=all&select=' || NEW.id::TEXT,
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5) Ticket status changed: include ticket number, subject, and new status
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
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6) Mention notifications: internal notes and replies to customer
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

  -- Notify every mentioned user (including self-mentions)
  FOREACH uid IN ARRAY NEW.mentioned_user_ids
  LOOP
    INSERT INTO notifications (user_id, tenant_id, title, body, link, read_at)
    VALUES (
      uid,
      NEW.tenant_id,
      title_base,
      body_text,
      '/tickets?view=all&select=' || NEW.ticket_id::TEXT,
      NULL
    );
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
