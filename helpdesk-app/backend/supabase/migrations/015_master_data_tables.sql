-- Master data: ticket statuses and categories (manageable from Settings → Stamdata)

-- Ticket statuses: code is stored on tickets.status
CREATE TABLE IF NOT EXISTS ticket_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  label VARCHAR(100) NOT NULL,
  sort_order INT DEFAULT 0,
  color VARCHAR(30) DEFAULT 'neutral',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_statuses_sort ON ticket_statuses(sort_order);

ALTER TABLE ticket_statuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can read ticket_statuses" ON ticket_statuses;
CREATE POLICY "Team members can read ticket_statuses"
  ON ticket_statuses FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND is_active = true)
  );

DROP POLICY IF EXISTS "Admins can manage ticket_statuses" ON ticket_statuses;
CREATE POLICY "Admins can manage ticket_statuses"
  ON ticket_statuses FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND is_active = true AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND is_active = true AND role = 'admin')
  );

INSERT INTO ticket_statuses (code, label, sort_order, color) VALUES
  ('open', 'Åpen', 10, 'new'),
  ('pending', 'Venter', 20, 'pending'),
  ('resolved', 'Løst', 30, 'resolved'),
  ('closed', 'Lukket', 40, 'closed')
ON CONFLICT (code) DO NOTHING;

-- Ticket categories: name is stored on tickets.category
CREATE TABLE IF NOT EXISTS ticket_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_categories_sort ON ticket_categories(sort_order);

ALTER TABLE ticket_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can read ticket_categories" ON ticket_categories;
CREATE POLICY "Team members can read ticket_categories"
  ON ticket_categories FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND is_active = true)
  );

DROP POLICY IF EXISTS "Admins can manage ticket_categories" ON ticket_categories;
CREATE POLICY "Admins can manage ticket_categories"
  ON ticket_categories FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND is_active = true AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND is_active = true AND role = 'admin')
  );

-- Allow tickets to use any status (drop hardcoded check)
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
