-- Enable RLS on all tables
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_sync ENABLE ROW LEVEL SECURITY;

-- Helper: user is active team member
CREATE OR REPLACE FUNCTION is_team_member()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE user_id = auth.uid() AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Customers: team members can do everything
CREATE POLICY "Team members can read customers"
  ON customers FOR SELECT TO authenticated
  USING (is_team_member());

CREATE POLICY "Team members can insert customers"
  ON customers FOR INSERT TO authenticated
  WITH CHECK (is_team_member());

CREATE POLICY "Team members can update customers"
  ON customers FOR UPDATE TO authenticated
  USING (is_team_member());

-- Tickets: team members can do everything
CREATE POLICY "Team members can read tickets"
  ON tickets FOR SELECT TO authenticated
  USING (is_team_member());

CREATE POLICY "Team members can insert tickets"
  ON tickets FOR INSERT TO authenticated
  WITH CHECK (is_team_member());

CREATE POLICY "Team members can update tickets"
  ON tickets FOR UPDATE TO authenticated
  USING (is_team_member());

-- Messages: team members can do everything
CREATE POLICY "Team members can read messages"
  ON messages FOR SELECT TO authenticated
  USING (is_team_member());

CREATE POLICY "Team members can insert messages"
  ON messages FOR INSERT TO authenticated
  WITH CHECK (is_team_member());

-- Team members: users can read all; only admins can modify (simplified: any team member can manage for MVP)
CREATE POLICY "Team members can read team_members"
  ON team_members FOR SELECT TO authenticated
  USING (is_team_member());

CREATE POLICY "Team members can insert team_members"
  ON team_members FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR is_team_member());

CREATE POLICY "Team members can update team_members"
  ON team_members FOR UPDATE TO authenticated
  USING (is_team_member());

-- Templates: team members can do everything
CREATE POLICY "Team members can read templates"
  ON templates FOR SELECT TO authenticated
  USING (is_team_member());

CREATE POLICY "Team members can insert templates"
  ON templates FOR INSERT TO authenticated
  WITH CHECK (is_team_member());

CREATE POLICY "Team members can update templates"
  ON templates FOR UPDATE TO authenticated
  USING (is_team_member());

CREATE POLICY "Team members can delete templates"
  ON templates FOR DELETE TO authenticated
  USING (is_team_member());

-- Gmail sync: users can only access their own row
CREATE POLICY "Users can read own gmail_sync"
  ON gmail_sync FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own gmail_sync"
  ON gmail_sync FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own gmail_sync"
  ON gmail_sync FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own gmail_sync"
  ON gmail_sync FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
