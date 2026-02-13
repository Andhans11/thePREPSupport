-- Run this if you see 400 on team_members, 404 on notifications, 404 on company_settings,
-- or "Could not find the table business_hour_templates".
-- Idempotent: safe to run multiple times.

-- Company settings (company info, signatures, etc.)
CREATE TABLE IF NOT EXISTS company_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can read company_settings" ON company_settings;
CREATE POLICY "Team members can read company_settings"
  ON company_settings FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND is_active = true)
  );

DROP POLICY IF EXISTS "Admins can update company_settings" ON company_settings;
CREATE POLICY "Admins can update company_settings"
  ON company_settings FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND is_active = true AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can insert company_settings" ON company_settings;
CREATE POLICY "Admins can insert company_settings"
  ON company_settings FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND is_active = true AND role = 'admin')
  );

INSERT INTO company_settings (key, value) VALUES
  ('signature_new', '"Best regards,\nSupport Team"'::jsonb),
  ('signature_follow_up', '"Best regards,\nSupport Team"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Availability columns on team_members (for email/chat toggles in header)
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS available_for_email BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS available_for_chat BOOLEAN DEFAULT true;

-- Notifications table (bell icon)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notifications" ON notifications;
CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications (mark read)" ON notifications;
CREATE POLICY "Users can update own notifications (mark read)"
  ON notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can insert notifications" ON notifications;
CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT TO authenticated WITH CHECK (true);

-- Business hour templates (Settings → Åpningstider)
CREATE TABLE IF NOT EXISTS business_hour_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  timezone VARCHAR(100) DEFAULT 'UTC',
  schedule JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_hour_templates_default ON business_hour_templates(is_default) WHERE is_default = true;

ALTER TABLE business_hour_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can read business_hour_templates" ON business_hour_templates;
CREATE POLICY "Team members can read business_hour_templates"
  ON business_hour_templates FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND is_active = true)
  );

DROP POLICY IF EXISTS "Admins can manage business_hour_templates" ON business_hour_templates;
CREATE POLICY "Admins can manage business_hour_templates"
  ON business_hour_templates FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND is_active = true AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND is_active = true AND role = 'admin')
  );

-- updated_at trigger (requires update_updated_at_column() from migration 001)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS update_business_hour_templates_updated_at ON business_hour_templates;
    CREATE TRIGGER update_business_hour_templates_updated_at
      BEFORE UPDATE ON business_hour_templates
      FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
  END IF;
END $$;
