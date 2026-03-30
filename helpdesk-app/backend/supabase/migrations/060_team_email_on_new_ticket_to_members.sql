ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS email_on_new_ticket_to_members BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN teams.email_on_new_ticket_to_members IS
  'When true, all active members of the team receive an email when a new ticket is created with this team.';
