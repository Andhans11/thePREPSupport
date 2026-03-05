-- Let users receive email for in-app notifications (assignment, new comment, customer reply).

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS email_on_notifications BOOLEAN DEFAULT false;

COMMENT ON COLUMN team_members.email_on_notifications IS 'When true, user receives email when they get a notification (assigned to ticket, new note/reply on assigned ticket, customer reply).';
