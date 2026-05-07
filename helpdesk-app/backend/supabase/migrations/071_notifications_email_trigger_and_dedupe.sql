-- Automatically trigger notification-email Edge Function on notification inserts.
-- Also add a sent marker to avoid duplicate emails if multiple triggers/webhooks exist.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN notifications.email_sent_at IS
  'Timestamp when send-notification-email successfully sent an email for this notification.';

CREATE OR REPLACE FUNCTION trigger_send_notification_email()
RETURNS TRIGGER AS $$
DECLARE
  project_url TEXT;
BEGIN
  -- Already sent (or explicitly marked), skip dispatch.
  IF NEW.email_sent_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO project_url
  FROM vault.decrypted_secrets
  WHERE name = 'project_url'
  LIMIT 1;

  IF project_url IS NULL OR trim(project_url) = '' THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := project_url || '/functions/v1/send-notification-email',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('record', to_jsonb(NEW))
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_send_notification_email ON notifications;
CREATE TRIGGER tr_send_notification_email
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE PROCEDURE trigger_send_notification_email();
