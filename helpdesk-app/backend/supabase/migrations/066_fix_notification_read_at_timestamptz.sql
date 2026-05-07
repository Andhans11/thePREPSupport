-- Ensure notification trigger functions always write read_at as timestamptz.
-- Some environments may still have older function bodies that pass text values.

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
