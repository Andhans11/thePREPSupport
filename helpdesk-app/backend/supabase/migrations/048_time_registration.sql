-- Time registration (timeregistrering): work types, projects, absence types, entries, approvers.

-- 1) Work types (type of work) – tenant-scoped
CREATE TABLE IF NOT EXISTS time_registration_work_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_registration_work_types_tenant ON time_registration_work_types(tenant_id);
ALTER TABLE time_registration_work_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can read time_registration_work_types"
  ON time_registration_work_types FOR SELECT TO authenticated
  USING (is_team_member());

CREATE POLICY "Admins can manage time_registration_work_types"
  ON time_registration_work_types FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM team_members WHERE tenant_id = time_registration_work_types.tenant_id AND user_id = auth.uid() AND is_active = true AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM team_members WHERE tenant_id = time_registration_work_types.tenant_id AND user_id = auth.uid() AND is_active = true AND role = 'admin')
  );

-- 2) Projects – optional, tenant-scoped
CREATE TABLE IF NOT EXISTS time_registration_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_registration_projects_tenant ON time_registration_projects(tenant_id);
ALTER TABLE time_registration_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can read time_registration_projects"
  ON time_registration_projects FOR SELECT TO authenticated
  USING (is_team_member());

CREATE POLICY "Admins can manage time_registration_projects"
  ON time_registration_projects FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM team_members WHERE tenant_id = time_registration_projects.tenant_id AND user_id = auth.uid() AND is_active = true AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM team_members WHERE tenant_id = time_registration_projects.tenant_id AND user_id = auth.uid() AND is_active = true AND role = 'admin')
  );

-- 3) Absence types – tenant-scoped, default Norwegian labels
CREATE TABLE IF NOT EXISTS time_registration_absence_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(80) NOT NULL,
  label VARCHAR(200) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_time_registration_absence_types_tenant ON time_registration_absence_types(tenant_id);
ALTER TABLE time_registration_absence_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can read time_registration_absence_types"
  ON time_registration_absence_types FOR SELECT TO authenticated
  USING (is_team_member());

CREATE POLICY "Admins can manage time_registration_absence_types"
  ON time_registration_absence_types FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM team_members WHERE tenant_id = time_registration_absence_types.tenant_id AND user_id = auth.uid() AND is_active = true AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM team_members WHERE tenant_id = time_registration_absence_types.tenant_id AND user_id = auth.uid() AND is_active = true AND role = 'admin')
  );

-- 4) Manual approvers (must exist before time_entries, whose RLS policies reference this table)
CREATE TABLE IF NOT EXISTS time_registration_approvers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, team_member_id)
);

CREATE INDEX IF NOT EXISTS idx_time_registration_approvers_tenant ON time_registration_approvers(tenant_id);
ALTER TABLE time_registration_approvers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can read time_registration_approvers"
  ON time_registration_approvers FOR SELECT TO authenticated
  USING (is_team_member());

CREATE POLICY "Admins can manage time_registration_approvers"
  ON time_registration_approvers FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM team_members WHERE tenant_id = time_registration_approvers.tenant_id AND user_id = auth.uid() AND is_active = true AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM team_members WHERE tenant_id = time_registration_approvers.tenant_id AND user_id = auth.uid() AND is_active = true AND role = 'admin')
  );

-- 5) Time entries
CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  entry_type VARCHAR(20) NOT NULL CHECK (entry_type IN ('work', 'absence')),
  work_type_id UUID REFERENCES time_registration_work_types(id) ON DELETE SET NULL,
  project_id UUID REFERENCES time_registration_projects(id) ON DELETE SET NULL,
  absence_type_id UUID REFERENCES time_registration_absence_types(id) ON DELETE SET NULL,
  hours NUMERIC(6,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  submitted_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_tenant ON time_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_team_member ON time_entries(team_member_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_entry_date ON time_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_time_entries_tenant_date ON time_entries(tenant_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_time_entries_status ON time_entries(tenant_id, status);

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

-- Users see own entries; admins/managers/approvers see all in tenant
CREATE POLICY "Team members can read own time_entries"
  ON time_entries FOR SELECT TO authenticated
  USING (
    is_team_member()
    AND (
      team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid() AND tenant_id = time_entries.tenant_id)
      OR EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.tenant_id = time_entries.tenant_id AND tm.user_id = auth.uid() AND tm.is_active = true
          AND (tm.role IN ('admin', 'manager') OR EXISTS (SELECT 1 FROM time_registration_approvers tra WHERE tra.tenant_id = time_entries.tenant_id AND tra.team_member_id = tm.id))
      )
    )
  );

CREATE POLICY "Team members can insert own time_entries"
  ON time_entries FOR INSERT TO authenticated
  WITH CHECK (
    is_team_member()
    AND team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid() AND tenant_id = time_entries.tenant_id)
  );

CREATE POLICY "Team members can update own time_entries when draft or submitted"
  ON time_entries FOR UPDATE TO authenticated
  USING (
    is_team_member()
    AND team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid() AND tenant_id = time_entries.tenant_id)
  );

CREATE POLICY "Admins managers approvers can update time_entries for approval"
  ON time_entries FOR UPDATE TO authenticated
  USING (
    is_team_member()
    AND EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.tenant_id = time_entries.tenant_id AND tm.user_id = auth.uid() AND tm.is_active = true
        AND (tm.role IN ('admin', 'manager') OR EXISTS (SELECT 1 FROM time_registration_approvers tra WHERE tra.tenant_id = time_entries.tenant_id AND tra.team_member_id = tm.id))
    )
  );

CREATE POLICY "Team members can delete own draft time_entries"
  ON time_entries FOR DELETE TO authenticated
  USING (
    is_team_member()
    AND status = 'draft'
    AND team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid() AND tenant_id = time_entries.tenant_id)
  );

-- Trigger: updated_at
CREATE OR REPLACE FUNCTION update_time_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_time_entries_updated_at ON time_entries;
CREATE TRIGGER update_time_entries_updated_at
  BEFORE UPDATE ON time_entries
  FOR EACH ROW EXECUTE PROCEDURE update_time_entries_updated_at();

-- Seed default absence types per tenant
INSERT INTO time_registration_absence_types (tenant_id, code, label, sort_order)
SELECT t.id, 'syk', 'Syk', 1 FROM tenants t
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO time_registration_absence_types (tenant_id, code, label, sort_order)
SELECT t.id, 'sykt_barn', 'Sykt barn', 2 FROM tenants t
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO time_registration_absence_types (tenant_id, code, label, sort_order)
SELECT t.id, 'permisjon', 'Permisjon', 3 FROM tenants t
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO time_registration_absence_types (tenant_id, code, label, sort_order)
SELECT t.id, 'annen_velferd', 'Annen velferdspermisjon', 4 FROM tenants t
ON CONFLICT (tenant_id, code) DO NOTHING;

COMMENT ON TABLE time_registration_work_types IS 'Arbeidstyper for timeregistrering (f.eks. Support, prosjekt).';
COMMENT ON TABLE time_registration_projects IS 'Valgfrie prosjekter for timeregistrering.';
COMMENT ON TABLE time_registration_absence_types IS 'Fraværstyper: syk, sykt barn, permisjon, velferd.';
COMMENT ON TABLE time_entries IS 'Timeregistrering: arbeid eller fravær, med godkjenningsflyt.';
COMMENT ON TABLE time_registration_approvers IS 'Tilleggsgodkjennere for timeregistrering (i tillegg til ledere og admins).';

-- Default work type per tenant so users can register time immediately
INSERT INTO time_registration_work_types (tenant_id, name, description, sort_order)
SELECT t.id, 'Support / generelt', 'Generell support og arbeid', 0 FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM time_registration_work_types w WHERE w.tenant_id = t.id);
