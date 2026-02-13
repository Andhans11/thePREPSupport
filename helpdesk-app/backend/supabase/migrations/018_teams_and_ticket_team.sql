-- Teams: groups that can own tickets. Users (team_members) can belong to multiple teams.

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_name ON teams(name);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can read teams" ON teams;
CREATE POLICY "Team members can read teams"
  ON teams FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND is_active = true)
  );

DROP POLICY IF EXISTS "Admins can manage teams" ON teams;
CREATE POLICY "Admins can manage teams"
  ON teams FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND is_active = true AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND is_active = true AND role = 'admin')
  );

-- Junction: which team_members belong to which teams (many-to-many)
CREATE TABLE IF NOT EXISTS team_member_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_member_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_team_member_teams_team_member ON team_member_teams(team_member_id);
CREATE INDEX IF NOT EXISTS idx_team_member_teams_team ON team_member_teams(team_id);

ALTER TABLE team_member_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can read team_member_teams" ON team_member_teams;
CREATE POLICY "Team members can read team_member_teams"
  ON team_member_teams FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND is_active = true)
  );

DROP POLICY IF EXISTS "Admins can manage team_member_teams" ON team_member_teams;
CREATE POLICY "Admins can manage team_member_teams"
  ON team_member_teams FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND is_active = true AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND is_active = true AND role = 'admin')
  );

-- Ticket owning team
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_team_id ON tickets(team_id);

-- Trigger to keep teams.updated_at in sync (optional)
CREATE OR REPLACE FUNCTION update_teams_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_teams_updated_at ON teams;
CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE PROCEDURE update_teams_updated_at();
