-- Multi-tenant: tenants table and tenant_id on all relevant tables.
-- Users can belong to multiple tenants via team_members (one row per user per tenant).

-- 1) Tenants table
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_name ON tenants(name);
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
-- Policy on tenants is created after team_members.tenant_id exists (see step 2).

-- 2) Add tenant_id to team_members (and allow multiple rows per user, one per tenant)
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_team_members_tenant_id ON team_members(tenant_id);
-- Unique: one membership per user per tenant
DROP INDEX IF EXISTS idx_team_members_user_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_tenant_user ON team_members(tenant_id, user_id) WHERE user_id IS NOT NULL;

-- 3) Backfill: create default tenant and assign existing team_members to it
DO $$
DECLARE
  default_tenant_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants LIMIT 1) THEN
    INSERT INTO tenants (id, name) VALUES (gen_random_uuid(), 'Default') RETURNING id INTO default_tenant_id;
    UPDATE team_members SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  ELSE
    SELECT id INTO default_tenant_id FROM tenants LIMIT 1;
    UPDATE team_members SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  END IF;
END $$;

ALTER TABLE team_members ALTER COLUMN tenant_id SET NOT NULL;

-- Policy on tenants: users can read tenants they belong to (requires team_members.tenant_id to exist)
CREATE POLICY "Users can read tenants they belong to"
  ON tenants FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM team_members WHERE team_members.tenant_id = tenants.id AND team_members.user_id = auth.uid() AND team_members.is_active = true)
  );

-- 4) Add tenant_id to all other tables
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE gmail_sync ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE ticket_statuses ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE ticket_categories ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE business_hour_templates ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL;

-- company_settings: key is currently PRIMARY KEY; we need (tenant_id, key)
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
DO $$
DECLARE
  default_tenant_id UUID;
BEGIN
  SELECT id INTO default_tenant_id FROM tenants LIMIT 1;
  UPDATE company_settings SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE customers SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE tickets SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE messages SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE templates SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE gmail_sync SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE teams SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE ticket_statuses SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE ticket_categories SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE business_hour_templates SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE messages m SET tenant_id = t.tenant_id FROM tickets t WHERE m.ticket_id = t.id AND m.tenant_id IS NULL;
END $$;

ALTER TABLE customers ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE tickets ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE messages ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE templates ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE gmail_sync ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE teams ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE ticket_statuses ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE ticket_categories ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE business_hour_templates ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE company_settings ALTER COLUMN tenant_id SET NOT NULL;

-- company_settings: composite primary key
ALTER TABLE company_settings DROP CONSTRAINT IF EXISTS company_settings_pkey;
ALTER TABLE company_settings ADD PRIMARY KEY (tenant_id, key);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_id ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_id ON tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_messages_tenant_id ON messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_templates_tenant_id ON templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gmail_sync_tenant_id ON gmail_sync(tenant_id);
DROP INDEX IF EXISTS idx_gmail_sync_user_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_gmail_sync_tenant_user ON gmail_sync(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_teams_tenant_id ON teams(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_id ON notifications(tenant_id);

-- Tenant-scoped unique constraints (replace global uniques)
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_ticket_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_tenant_ticket_number ON tickets(tenant_id, ticket_number);
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_tenant_email ON customers(tenant_id, email);
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_tenant_email ON team_members(tenant_id, email);
ALTER TABLE ticket_statuses DROP CONSTRAINT IF EXISTS ticket_statuses_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_statuses_tenant_code ON ticket_statuses(tenant_id, code);
ALTER TABLE ticket_categories DROP CONSTRAINT IF EXISTS ticket_categories_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_categories_tenant_name ON ticket_categories(tenant_id, name);
DROP INDEX IF EXISTS idx_teams_name;
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_tenant_name ON teams(tenant_id, name);

-- 5) Ticket number: per-tenant sequence
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM 5) AS INTEGER)), 0) + 1
    INTO next_num
    FROM tickets
    WHERE tenant_id = NEW.tenant_id AND ticket_number ~ '^TKT-[0-9]+$';
    NEW.ticket_number := 'TKT-' || LPAD(next_num::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6) RLS helper: user is active team member in a given tenant
CREATE OR REPLACE FUNCTION user_has_tenant_access(check_tenant_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE user_id = auth.uid() AND tenant_id = check_tenant_id AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 7) Drop old is_team_member and use tenant-scoped checks; re-create is_team_member for backward compat (true if user is in any tenant)
CREATE OR REPLACE FUNCTION is_team_member()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE user_id = auth.uid() AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 8) RLS: tenant-scoped policies (replace generic is_team_member with user_has_tenant_access(tenant_id))
DROP POLICY IF EXISTS "Team members can read customers" ON customers;
DROP POLICY IF EXISTS "Team members can insert customers" ON customers;
DROP POLICY IF EXISTS "Team members can update customers" ON customers;
CREATE POLICY "Team members can read customers" ON customers FOR SELECT TO authenticated USING (user_has_tenant_access(tenant_id));
CREATE POLICY "Team members can insert customers" ON customers FOR INSERT TO authenticated WITH CHECK (user_has_tenant_access(tenant_id));
CREATE POLICY "Team members can update customers" ON customers FOR UPDATE TO authenticated USING (user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "Team members can read tickets" ON tickets;
DROP POLICY IF EXISTS "Team members can insert tickets" ON tickets;
DROP POLICY IF EXISTS "Team members can update tickets" ON tickets;
CREATE POLICY "Team members can read tickets" ON tickets FOR SELECT TO authenticated USING (user_has_tenant_access(tenant_id));
CREATE POLICY "Team members can insert tickets" ON tickets FOR INSERT TO authenticated WITH CHECK (user_has_tenant_access(tenant_id));
CREATE POLICY "Team members can update tickets" ON tickets FOR UPDATE TO authenticated USING (user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "Team members can read messages" ON messages;
DROP POLICY IF EXISTS "Team members can insert messages" ON messages;
CREATE POLICY "Team members can read messages" ON messages FOR SELECT TO authenticated USING (user_has_tenant_access(tenant_id));
CREATE POLICY "Team members can insert messages" ON messages FOR INSERT TO authenticated WITH CHECK (user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "Team members can read team_members" ON team_members;
DROP POLICY IF EXISTS "Team members can insert team_members" ON team_members;
DROP POLICY IF EXISTS "Team members can update team_members" ON team_members;
CREATE POLICY "Team members can read team_members" ON team_members FOR SELECT TO authenticated USING (user_has_tenant_access(tenant_id));
CREATE POLICY "Team members can insert team_members" ON team_members FOR INSERT TO authenticated WITH CHECK (user_has_tenant_access(tenant_id));
CREATE POLICY "Team members can update team_members" ON team_members FOR UPDATE TO authenticated USING (user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "Team members can read templates" ON templates;
DROP POLICY IF EXISTS "Team members can insert templates" ON templates;
DROP POLICY IF EXISTS "Team members can update templates" ON templates;
DROP POLICY IF EXISTS "Team members can delete templates" ON templates;
CREATE POLICY "Team members can read templates" ON templates FOR SELECT TO authenticated USING (user_has_tenant_access(tenant_id));
CREATE POLICY "Team members can insert templates" ON templates FOR INSERT TO authenticated WITH CHECK (user_has_tenant_access(tenant_id));
CREATE POLICY "Team members can update templates" ON templates FOR UPDATE TO authenticated USING (user_has_tenant_access(tenant_id));
CREATE POLICY "Team members can delete templates" ON templates FOR DELETE TO authenticated USING (user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "Users can read own gmail_sync" ON gmail_sync;
DROP POLICY IF EXISTS "Users can insert own gmail_sync" ON gmail_sync;
DROP POLICY IF EXISTS "Users can update own gmail_sync" ON gmail_sync;
DROP POLICY IF EXISTS "Users can delete own gmail_sync" ON gmail_sync;
CREATE POLICY "Users can read own gmail_sync" ON gmail_sync FOR SELECT TO authenticated USING (auth.uid() = user_id AND user_has_tenant_access(tenant_id));
CREATE POLICY "Users can insert own gmail_sync" ON gmail_sync FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND user_has_tenant_access(tenant_id));
CREATE POLICY "Users can update own gmail_sync" ON gmail_sync FOR UPDATE TO authenticated USING (auth.uid() = user_id AND user_has_tenant_access(tenant_id));
CREATE POLICY "Users can delete own gmail_sync" ON gmail_sync FOR DELETE TO authenticated USING (auth.uid() = user_id AND user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "Team members can read teams" ON teams;
DROP POLICY IF EXISTS "Admins can manage teams" ON teams;
CREATE POLICY "Team members can read teams" ON teams FOR SELECT TO authenticated USING (user_has_tenant_access(tenant_id));
CREATE POLICY "Admins can manage teams" ON teams FOR ALL TO authenticated USING (user_has_tenant_access(tenant_id) AND EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND tenant_id = teams.tenant_id AND is_active = true AND role = 'admin')) WITH CHECK (user_has_tenant_access(tenant_id) AND EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND tenant_id = teams.tenant_id AND is_active = true AND role = 'admin'));

DROP POLICY IF EXISTS "Team members can read team_member_teams" ON team_member_teams;
DROP POLICY IF EXISTS "Admins can manage team_member_teams" ON team_member_teams;
CREATE POLICY "Team members can read team_member_teams" ON team_member_teams FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.id = team_member_teams.team_member_id AND tm.user_id = auth.uid() AND tm.is_active = true));
CREATE POLICY "Admins can manage team_member_teams" ON team_member_teams FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.id = team_member_teams.team_member_id AND tm.user_id = auth.uid() AND tm.is_active = true AND tm.role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM team_members tm WHERE tm.id = team_member_teams.team_member_id AND tm.user_id = auth.uid() AND tm.is_active = true AND tm.role = 'admin'));

DROP POLICY IF EXISTS "Team members can read company_settings" ON company_settings;
DROP POLICY IF EXISTS "Admins can update company_settings" ON company_settings;
DROP POLICY IF EXISTS "Admins can insert company_settings" ON company_settings;
CREATE POLICY "Team members can read company_settings" ON company_settings FOR SELECT TO authenticated USING (user_has_tenant_access(tenant_id));
CREATE POLICY "Admins can update company_settings" ON company_settings FOR UPDATE TO authenticated USING (user_has_tenant_access(tenant_id) AND EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND tenant_id = company_settings.tenant_id AND is_active = true AND role = 'admin'));
CREATE POLICY "Admins can insert company_settings" ON company_settings FOR INSERT TO authenticated WITH CHECK (user_has_tenant_access(tenant_id) AND EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND tenant_id = company_settings.tenant_id AND is_active = true AND role = 'admin'));

DROP POLICY IF EXISTS "Team members can read ticket_statuses" ON ticket_statuses;
DROP POLICY IF EXISTS "Admins can manage ticket_statuses" ON ticket_statuses;
CREATE POLICY "Team members can read ticket_statuses" ON ticket_statuses FOR SELECT TO authenticated USING (user_has_tenant_access(tenant_id));
CREATE POLICY "Admins can manage ticket_statuses" ON ticket_statuses FOR ALL TO authenticated USING (user_has_tenant_access(tenant_id) AND EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND tenant_id = ticket_statuses.tenant_id AND is_active = true AND role = 'admin')) WITH CHECK (user_has_tenant_access(tenant_id) AND EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND tenant_id = ticket_statuses.tenant_id AND is_active = true AND role = 'admin'));

DROP POLICY IF EXISTS "Team members can read ticket_categories" ON ticket_categories;
DROP POLICY IF EXISTS "Admins can manage ticket_categories" ON ticket_categories;
CREATE POLICY "Team members can read ticket_categories" ON ticket_categories FOR SELECT TO authenticated USING (user_has_tenant_access(tenant_id));
CREATE POLICY "Admins can manage ticket_categories" ON ticket_categories FOR ALL TO authenticated USING (user_has_tenant_access(tenant_id) AND EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND tenant_id = ticket_categories.tenant_id AND is_active = true AND role = 'admin')) WITH CHECK (user_has_tenant_access(tenant_id) AND EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND tenant_id = ticket_categories.tenant_id AND is_active = true AND role = 'admin'));

DROP POLICY IF EXISTS "Team members can read business_hour_templates" ON business_hour_templates;
DROP POLICY IF EXISTS "Admins can manage business_hour_templates" ON business_hour_templates;
CREATE POLICY "Team members can read business_hour_templates" ON business_hour_templates FOR SELECT TO authenticated USING (user_has_tenant_access(tenant_id));
CREATE POLICY "Admins can manage business_hour_templates" ON business_hour_templates FOR ALL TO authenticated USING (user_has_tenant_access(tenant_id) AND EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND tenant_id = business_hour_templates.tenant_id AND is_active = true AND role = 'admin')) WITH CHECK (user_has_tenant_access(tenant_id) AND EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND tenant_id = business_hour_templates.tenant_id AND is_active = true AND role = 'admin'));

-- Notifications: optional tenant scope; keep user-based read/update, add tenant filter for insert if we use it
DROP POLICY IF EXISTS "Users can read own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications (mark read)" ON notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON notifications;
CREATE POLICY "Users can read own notifications" ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications (mark read)" ON notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "System can insert notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (true);
