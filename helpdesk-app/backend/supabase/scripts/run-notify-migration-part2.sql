-- PART 2 of 2: Add email_on_notifications column to team_members.
-- Run this in SQL Editor after run-notify-migration-part1.sql has succeeded.

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS email_on_notifications BOOLEAN DEFAULT false;

COMMENT ON COLUMN team_members.email_on_notifications IS 'When true, user receives email when they get a notification (assigned to ticket, new note/reply on assigned ticket, customer reply).';
