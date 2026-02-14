-- Add manager role and team manager assignment.
-- Manager: can be assigned as manager of a team, sees all tickets in that team, can update team member statuses for members in their team.

-- 1) Allow 'manager' in team_members.role (current CHECK may be (admin, agent, viewer))
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
ALTER TABLE team_members ADD CONSTRAINT team_members_role_check
  CHECK (role IN ('admin', 'manager', 'agent', 'viewer'));

-- 2) Teams: one optional manager per team (references team_members.id)
ALTER TABLE teams ADD COLUMN IF NOT EXISTS manager_team_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_teams_manager_team_member_id ON teams(manager_team_member_id);

-- 3) Managers can update teams they manage (to assign themselves or others as manager would be admin-only; here we allow update for manager_team_member_id only via app logic)
-- RLS: managers can read teams they manage; admins can do everything. Existing "Admins can manage teams" stays. Add policy: managers can update teams where they are the manager (e.g. for future fields). For now, only admins manage teams; manager just needs to read.
-- So no new team RLS for manager. Manager assignment is done by admin in Settings.

-- 4) Team member status: manager can update availability_status of team_members who are in a team they manage.
-- Current: "Team members can update team_members" allows any tenant member to update any team_member (same tenant). We keep that; the app can restrict "change other users' status" to admin + manager of their team.
-- Optional: add a policy "Managers can update team_members availability_status for members in their team" - would require a policy that joins team_members -> team_member_teams -> teams where manager_team_member_id = current user's team_member id. That's complex in RLS. Simpler: app-level check. So we don't add RLS for manager updating others' status; the UI will show "Brukere" and status controls only for admin/manager, and we could allow manager to update only members in their team in the API. For now we leave RLS as-is (any team member can update any team member in tenant).

COMMENT ON COLUMN teams.manager_team_member_id IS 'Team manager: this team_member can see all team tickets and manage team member statuses for this team.';
