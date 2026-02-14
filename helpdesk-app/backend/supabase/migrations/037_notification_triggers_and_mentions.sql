-- Notifications: triggers for planning slots, ticket assignment/status, and note mentions.
-- Also add message columns for @mentions (mentioned_user_ids, created_by).

-- 1) Messages: support @mentions and author for notification triggers
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS mentioned_user_ids UUID[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN messages.mentioned_user_ids IS 'User IDs (auth.users) mentioned in this note via @[Name](user_id).';
COMMENT ON COLUMN messages.created_by IS 'User who created the message (for excluding from mention notifications).';

-- 2) Ensure notifications.tenant_id exists and is set by triggers (already added in 021)
-- Triggers will set tenant_id when inserting.

-- 3) Helper: get user_id from team_member_id
CREATE OR REPLACE FUNCTION get_user_id_from_team_member(p_team_member_id UUID)
RETURNS UUID AS $$
  SELECT user_id FROM team_members WHERE id = p_team_member_id AND user_id IS NOT NULL LIMIT 1;
$$ LANGUAGE sql STABLE;

-- 4) Notify user when added to a planning slot
CREATE OR REPLACE FUNCTION notify_planning_slot_inserted()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id UUID;
BEGIN
  target_user_id := get_user_id_from_team_member(NEW.team_member_id);
  IF target_user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, tenant_id, title, body, link, read_at)
    VALUES (
      target_user_id,
      NEW.tenant_id,
      'Du er lagt til i en planlegging',
      'Du har blitt satt på en tid i planleggingen.',
      '/planning',
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_notify_planning_slot_inserted ON planning_slots;
CREATE TRIGGER tr_notify_planning_slot_inserted
  AFTER INSERT ON planning_slots
  FOR EACH ROW EXECUTE PROCEDURE notify_planning_slot_inserted();

-- 5) Notify user when their planning slot is updated (time or reassignment)
CREATE OR REPLACE FUNCTION notify_planning_slot_updated()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id UUID;
BEGIN
  target_user_id := get_user_id_from_team_member(NEW.team_member_id);
  IF target_user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, tenant_id, title, body, link, read_at)
    VALUES (
      target_user_id,
      NEW.tenant_id,
      'En planlegging du er med i er endret',
      'Tiden eller plasseringen er oppdatert.',
      '/planning',
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_notify_planning_slot_updated ON planning_slots;
CREATE TRIGGER tr_notify_planning_slot_updated
  AFTER UPDATE ON planning_slots
  FOR EACH ROW
  WHEN (
    OLD.start_at IS DISTINCT FROM NEW.start_at
    OR OLD.end_at IS DISTINCT FROM NEW.end_at
    OR OLD.team_member_id IS DISTINCT FROM NEW.team_member_id
  )
  EXECUTE PROCEDURE notify_planning_slot_updated();

-- 6) Notify user when their planning slot is deleted
CREATE OR REPLACE FUNCTION notify_planning_slot_deleted()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id UUID;
  v_tenant_id UUID;
BEGIN
  v_tenant_id := OLD.tenant_id;
  target_user_id := get_user_id_from_team_member(OLD.team_member_id);
  IF target_user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, tenant_id, title, body, link, read_at)
    VALUES (
      target_user_id,
      v_tenant_id,
      'En planlegging du var med i er fjernet',
      'Din tid i planleggingen er slettet.',
      '/planning',
      NULL
    );
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_notify_planning_slot_deleted ON planning_slots;
CREATE TRIGGER tr_notify_planning_slot_deleted
  AFTER DELETE ON planning_slots
  FOR EACH ROW EXECUTE PROCEDURE notify_planning_slot_deleted();

-- 7) Notify user when assigned to a ticket
CREATE OR REPLACE FUNCTION notify_ticket_assigned()
RETURNS TRIGGER AS $$
DECLARE
  ticket_subject TEXT;
  ticket_tenant_id UUID;
BEGIN
  IF NEW.assigned_to IS NOT NULL AND (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
    ticket_tenant_id := NEW.tenant_id;
    SELECT subject INTO ticket_subject FROM tickets WHERE id = NEW.id;
    INSERT INTO notifications (user_id, tenant_id, title, body, link, read_at)
    VALUES (
      NEW.assigned_to,
      ticket_tenant_id,
      'Du er tildelt en sak',
      COALESCE(ticket_subject, 'En sak'),
      '/tickets?select=' || NEW.id::TEXT,
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_notify_ticket_assigned ON tickets;
CREATE TRIGGER tr_notify_ticket_assigned
  AFTER UPDATE OF assigned_to ON tickets
  FOR EACH ROW
  WHEN (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to AND NEW.assigned_to IS NOT NULL)
  EXECUTE PROCEDURE notify_ticket_assigned();

-- 8) Notify assignee when ticket status changes (excluding the person who made the change)
CREATE OR REPLACE FUNCTION notify_ticket_status_changed()
RETURNS TRIGGER AS $$
DECLARE
  ticket_subject TEXT;
BEGIN
  IF NEW.assigned_to IS NOT NULL
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND (auth.uid() IS NULL OR NEW.assigned_to != auth.uid()) THEN
    SELECT subject INTO ticket_subject FROM tickets WHERE id = NEW.id;
    INSERT INTO notifications (user_id, tenant_id, title, body, link, read_at)
    VALUES (
      NEW.assigned_to,
      NEW.tenant_id,
      'Status endret på en sak du er tildelt',
      COALESCE(ticket_subject, 'Sak') || ' – ny status: ' || COALESCE(NEW.status, ''),
      '/tickets?select=' || NEW.id::TEXT,
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_notify_ticket_status_changed ON tickets;
CREATE TRIGGER tr_notify_ticket_status_changed
  AFTER UPDATE OF status ON tickets
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE PROCEDURE notify_ticket_status_changed();

-- 9) Notify mentioned users when an internal note is created with mentions
CREATE OR REPLACE FUNCTION notify_message_mentions()
RETURNS TRIGGER AS $$
DECLARE
  uid UUID;
  ticket_subject TEXT;
  note_preview TEXT;
BEGIN
  IF NOT (NEW.is_internal_note AND NEW.mentioned_user_ids IS NOT NULL AND array_length(NEW.mentioned_user_ids, 1) > 0) THEN
    RETURN NEW;
  END IF;

  SELECT subject INTO ticket_subject FROM tickets WHERE id = NEW.ticket_id;
  note_preview := LEFT(TRIM(REGEXP_REPLACE(NEW.content, E'\\s+', ' ', 'g')), 80);
  IF LENGTH(NEW.content) > 80 THEN
    note_preview := note_preview || '…';
  END IF;

  -- Notify every mentioned user (including self-mentions)
  FOREACH uid IN ARRAY NEW.mentioned_user_ids
  LOOP
    INSERT INTO notifications (user_id, tenant_id, title, body, link, read_at)
    VALUES (
      uid,
      NEW.tenant_id,
      'Du er nevnt i et notat',
      COALESCE(ticket_subject, 'Sak') || ': ' || note_preview,
      '/tickets?select=' || NEW.ticket_id::TEXT,
      NULL
    );
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_notify_message_mentions ON messages;
CREATE TRIGGER tr_notify_message_mentions
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE PROCEDURE notify_message_mentions();

-- Realtime: so the bell badge updates when new notifications arrive
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
