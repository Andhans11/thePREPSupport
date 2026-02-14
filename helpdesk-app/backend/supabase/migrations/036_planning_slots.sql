-- Planning slots: support schedule per team member (who is on support when).
-- Used by Planlegging page for calendar and list view.

CREATE TABLE IF NOT EXISTS planning_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  start_at TIMESTAMP WITH TIME ZONE NOT NULL,
  end_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT planning_slots_end_after_start CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_planning_slots_tenant_id ON planning_slots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_planning_slots_team_member_id ON planning_slots(team_member_id);
CREATE INDEX IF NOT EXISTS idx_planning_slots_start_at ON planning_slots(start_at);
CREATE INDEX IF NOT EXISTS idx_planning_slots_tenant_start ON planning_slots(tenant_id, start_at);

ALTER TABLE planning_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can read planning_slots"
  ON planning_slots FOR SELECT TO authenticated
  USING (is_team_member());

CREATE POLICY "Team members can insert planning_slots"
  ON planning_slots FOR INSERT TO authenticated
  WITH CHECK (is_team_member());

CREATE POLICY "Team members can update planning_slots"
  ON planning_slots FOR UPDATE TO authenticated
  USING (is_team_member());

CREATE POLICY "Team members can delete planning_slots"
  ON planning_slots FOR DELETE TO authenticated
  USING (is_team_member());

COMMENT ON TABLE planning_slots IS 'Scheduled support shifts for planlegging (calendar and list).';
