-- Allow pending invites: team members can be added by email before they sign up.
-- When they sign up, you can link the account (e.g. by updating user_id where email matches).
ALTER TABLE team_members
  ALTER COLUMN user_id DROP NOT NULL;
