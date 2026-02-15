-- Track last activity heartbeat so we can show "offline" for users with no active session.
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN team_members.last_seen_at IS 'Updated by the client heartbeat while the user has an active session. Used to display "Frakoblet" (offline) when null or older than a few minutes.';

CREATE INDEX IF NOT EXISTS idx_team_members_last_seen_at ON team_members(last_seen_at) WHERE last_seen_at IS NOT NULL;
