-- Let admins configure which users receive an email when a new ticket is created.
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS email_on_new_ticket BOOLEAN DEFAULT false;

COMMENT ON COLUMN team_members.email_on_new_ticket IS 'When true, this user receives an email notification each time a new ticket is created in the tenant. Admin configurable in Settings > Brukere.';
