-- Run this entire file once in Supabase Dashboard → SQL Editor → New query
-- Use on a fresh project. If tables already exist, run the individual migration files in order and skip any that error.

-- ========== 001_create_customers ==========
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  phone VARCHAR(50),
  company VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ========== 002_create_tickets ==========
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_number VARCHAR(50) UNIQUE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved', 'closed')),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  category VARCHAR(100),
  assigned_to UUID REFERENCES auth.users(id),
  gmail_thread_id VARCHAR(255),
  gmail_message_id VARCHAR(255),
  tags TEXT[],
  due_date TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  first_response_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_customer ON tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_gmail_thread ON tickets(gmail_thread_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at DESC);

DROP TRIGGER IF EXISTS update_tickets_updated_at ON tickets;
CREATE TRIGGER update_tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM 5) AS INTEGER)), 0) + 1
    INTO next_num
    FROM tickets
    WHERE ticket_number ~ '^TKT-[0-9]+$';
    NEW.ticket_number := 'TKT-' || LPAD(next_num::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_ticket_number ON tickets;
CREATE TRIGGER set_ticket_number
  BEFORE INSERT ON tickets
  FOR EACH ROW EXECUTE PROCEDURE generate_ticket_number();

-- ========== 003_create_messages ==========
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  from_email VARCHAR(255) NOT NULL,
  from_name VARCHAR(255),
  content TEXT NOT NULL,
  html_content TEXT,
  is_customer BOOLEAN DEFAULT true,
  is_internal_note BOOLEAN DEFAULT false,
  gmail_message_id VARCHAR(255),
  attachments JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_ticket ON messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

-- ========== 004_create_team_members ==========
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(50) DEFAULT 'agent' CHECK (role IN ('admin', 'agent', 'viewer')),
  is_active BOOLEAN DEFAULT true,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_email ON team_members(email);

-- ========== 005_create_templates ==========
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(500),
  content TEXT NOT NULL,
  category VARCHAR(100),
  created_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_templates_updated_at ON templates;
CREATE TRIGGER update_templates_updated_at
  BEFORE UPDATE ON templates
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ========== 006_create_gmail_sync ==========
CREATE TABLE IF NOT EXISTS gmail_sync (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email_address VARCHAR(255) NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  token_expiry TIMESTAMP WITH TIME ZONE,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  history_id VARCHAR(255),
  watch_expiration TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gmail_sync_user_id ON gmail_sync(user_id);
CREATE INDEX IF NOT EXISTS idx_gmail_sync_email ON gmail_sync(email_address);

DROP TRIGGER IF EXISTS update_gmail_sync_updated_at ON gmail_sync;
CREATE TRIGGER update_gmail_sync_updated_at
  BEFORE UPDATE ON gmail_sync
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ========== 007_setup_rls ==========
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_sync ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_team_member()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE user_id = auth.uid() AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

DROP POLICY IF EXISTS "Team members can read customers" ON customers;
CREATE POLICY "Team members can read customers"
  ON customers FOR SELECT TO authenticated USING (is_team_member());

DROP POLICY IF EXISTS "Team members can insert customers" ON customers;
CREATE POLICY "Team members can insert customers"
  ON customers FOR INSERT TO authenticated WITH CHECK (is_team_member());

DROP POLICY IF EXISTS "Team members can update customers" ON customers;
CREATE POLICY "Team members can update customers"
  ON customers FOR UPDATE TO authenticated USING (is_team_member());

DROP POLICY IF EXISTS "Team members can read tickets" ON tickets;
CREATE POLICY "Team members can read tickets"
  ON tickets FOR SELECT TO authenticated USING (is_team_member());

DROP POLICY IF EXISTS "Team members can insert tickets" ON tickets;
CREATE POLICY "Team members can insert tickets"
  ON tickets FOR INSERT TO authenticated WITH CHECK (is_team_member());

DROP POLICY IF EXISTS "Team members can update tickets" ON tickets;
CREATE POLICY "Team members can update tickets"
  ON tickets FOR UPDATE TO authenticated USING (is_team_member());

DROP POLICY IF EXISTS "Team members can read messages" ON messages;
CREATE POLICY "Team members can read messages"
  ON messages FOR SELECT TO authenticated USING (is_team_member());

DROP POLICY IF EXISTS "Team members can insert messages" ON messages;
CREATE POLICY "Team members can insert messages"
  ON messages FOR INSERT TO authenticated WITH CHECK (is_team_member());

DROP POLICY IF EXISTS "Team members can read team_members" ON team_members;
CREATE POLICY "Team members can read team_members"
  ON team_members FOR SELECT TO authenticated USING (is_team_member());

DROP POLICY IF EXISTS "Team members can insert team_members" ON team_members;
CREATE POLICY "Team members can insert team_members"
  ON team_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR is_team_member());

DROP POLICY IF EXISTS "Team members can update team_members" ON team_members;
CREATE POLICY "Team members can update team_members"
  ON team_members FOR UPDATE TO authenticated USING (is_team_member());

DROP POLICY IF EXISTS "Team members can read templates" ON templates;
CREATE POLICY "Team members can read templates"
  ON templates FOR SELECT TO authenticated USING (is_team_member());

DROP POLICY IF EXISTS "Team members can insert templates" ON templates;
CREATE POLICY "Team members can insert templates"
  ON templates FOR INSERT TO authenticated WITH CHECK (is_team_member());

DROP POLICY IF EXISTS "Team members can update templates" ON templates;
CREATE POLICY "Team members can update templates"
  ON templates FOR UPDATE TO authenticated USING (is_team_member());

DROP POLICY IF EXISTS "Team members can delete templates" ON templates;
CREATE POLICY "Team members can delete templates"
  ON templates FOR DELETE TO authenticated USING (is_team_member());

DROP POLICY IF EXISTS "Users can read own gmail_sync" ON gmail_sync;
CREATE POLICY "Users can read own gmail_sync"
  ON gmail_sync FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own gmail_sync" ON gmail_sync;
CREATE POLICY "Users can insert own gmail_sync"
  ON gmail_sync FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own gmail_sync" ON gmail_sync;
CREATE POLICY "Users can update own gmail_sync"
  ON gmail_sync FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own gmail_sync" ON gmail_sync;
CREATE POLICY "Users can delete own gmail_sync"
  ON gmail_sync FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ========== Realtime (for live ticket/message updates in the app) ==========
-- If you get "already member of publication", the tables are already enabled; ignore.
ALTER PUBLICATION supabase_realtime ADD TABLE tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- ========== 009_add_gmail_sync_group_email ==========
ALTER TABLE gmail_sync
  ADD COLUMN IF NOT EXISTS group_email VARCHAR(255) NULL;

-- ========== 010_team_members_nullable_user_id ==========
ALTER TABLE team_members
  ALTER COLUMN user_id DROP NOT NULL;

-- ========== 011_company_settings_and_availability ==========
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

INSERT INTO company_settings (key, value) VALUES
  ('signature_new', '"Best regards,\nSupport Team"'::jsonb),
  ('signature_follow_up', '"Best regards,\nSupport Team"'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS available_for_email BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS available_for_chat BOOLEAN DEFAULT true;

-- ========== 012_business_hours ==========
CREATE TABLE IF NOT EXISTS business_hour_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  timezone VARCHAR(100) DEFAULT 'UTC',
  schedule JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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

-- ========== 013_notifications ==========
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications (mark read)"
  ON notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT TO authenticated WITH CHECK (true);
