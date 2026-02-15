-- Per-tenant Google OAuth credentials. Each tenant uses their own Client ID/Secret so
-- Gmail connections are isolated per organisation.
CREATE TABLE IF NOT EXISTS tenant_google_oauth (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_google_oauth_tenant_id ON tenant_google_oauth(tenant_id);

COMMENT ON TABLE tenant_google_oauth IS 'Google OAuth client_id and client_secret per tenant; used for Gmail connect and token refresh.';

ALTER TABLE tenant_google_oauth ENABLE ROW LEVEL SECURITY;

-- Team members can read their tenant's config (to build OAuth URL with client_id)
CREATE POLICY "Team members can read tenant_google_oauth"
  ON tenant_google_oauth FOR SELECT TO authenticated
  USING (user_has_tenant_access(tenant_id));

-- Only admins can insert/update/delete (configure OAuth for their tenant)
CREATE POLICY "Admins can insert tenant_google_oauth"
  ON tenant_google_oauth FOR INSERT TO authenticated
  WITH CHECK (
    user_has_tenant_access(tenant_id)
    AND EXISTS (
      SELECT 1 FROM team_members
      WHERE user_id = auth.uid() AND tenant_id = tenant_google_oauth.tenant_id
        AND is_active = true AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update tenant_google_oauth"
  ON tenant_google_oauth FOR UPDATE TO authenticated
  USING (
    user_has_tenant_access(tenant_id)
    AND EXISTS (
      SELECT 1 FROM team_members
      WHERE user_id = auth.uid() AND tenant_id = tenant_google_oauth.tenant_id
        AND is_active = true AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete tenant_google_oauth"
  ON tenant_google_oauth FOR DELETE TO authenticated
  USING (
    user_has_tenant_access(tenant_id)
    AND EXISTS (
      SELECT 1 FROM team_members
      WHERE user_id = auth.uid() AND tenant_id = tenant_google_oauth.tenant_id
        AND is_active = true AND role = 'admin'
    )
  );

CREATE TRIGGER update_tenant_google_oauth_updated_at
  BEFORE UPDATE ON tenant_google_oauth
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
