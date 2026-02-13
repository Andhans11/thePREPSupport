-- Company-wide settings (signatures, etc.)
CREATE TABLE IF NOT EXISTS company_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can read company_settings"
  ON company_settings FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Admins can update company_settings"
  ON company_settings FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND is_active = true AND role = 'admin')
  );

CREATE POLICY "Admins can insert company_settings"
  ON company_settings FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND is_active = true AND role = 'admin')
  );

-- Global email signatures: new (first reply) vs follow-up
INSERT INTO company_settings (key, value) VALUES
  ('signature_new', '"Best regards,\nSupport Team"'::jsonb),
  ('signature_follow_up', '"Best regards,\nSupport Team"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- User availability (for email/chat or general availability)
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS available_for_email BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS available_for_chat BOOLEAN DEFAULT true;
