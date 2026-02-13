-- Business hour templates: create and manage schedules
CREATE TABLE IF NOT EXISTS business_hour_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  timezone VARCHAR(100) DEFAULT 'UTC',
  schedule JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- schedule: { "monday": { "start": "09:00", "end": "17:00" }, ... } or { "monday": null } for closed
CREATE INDEX IF NOT EXISTS idx_business_hour_templates_default ON business_hour_templates(is_default) WHERE is_default = true;

ALTER TABLE business_hour_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can read business_hour_templates"
  ON business_hour_templates FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Admins can manage business_hour_templates"
  ON business_hour_templates FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND is_active = true AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND is_active = true AND role = 'admin')
  );

DROP TRIGGER IF EXISTS update_business_hour_templates_updated_at ON business_hour_templates;
CREATE TRIGGER update_business_hour_templates_updated_at
  BEFORE UPDATE ON business_hour_templates
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
