-- Tenant invitations: invite users by email with a code; they sign up or log in and accept to join the tenant.

-- 1) Table: one row per invitation (single use, optional expiry)
CREATE TABLE IF NOT EXISTS tenant_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL DEFAULT '',
  role VARCHAR(50) NOT NULL DEFAULT 'agent' CHECK (role IN ('admin', 'agent', 'viewer')),
  invitation_code VARCHAR(64) NOT NULL,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(invitation_code)
);

CREATE INDEX IF NOT EXISTS idx_tenant_invitations_tenant_id ON tenant_invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_email ON tenant_invitations(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_code ON tenant_invitations(invitation_code);

ALTER TABLE tenant_invitations ENABLE ROW LEVEL SECURITY;

-- Only admins of the tenant can read/create invitations for that tenant
DROP POLICY IF EXISTS "Admins can read tenant_invitations" ON tenant_invitations;
CREATE POLICY "Admins can read tenant_invitations"
  ON tenant_invitations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.tenant_id = tenant_invitations.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.is_active = true
        AND tm.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can insert tenant_invitations" ON tenant_invitations;
CREATE POLICY "Admins can insert tenant_invitations"
  ON tenant_invitations FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.tenant_id = tenant_invitations.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.is_active = true
        AND tm.role = 'admin'
    )
  );

-- 2) RPC: Create invitation and ensure team_member row exists (called by admin from settings).
-- Returns invitation_code and invite_link path; frontend or Edge Function builds full URL.
CREATE OR REPLACE FUNCTION create_tenant_invitation(
  p_tenant_id UUID,
  p_email TEXT,
  p_name TEXT,
  p_role TEXT DEFAULT 'agent'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  inv_code TEXT;
  inv_id UUID;
  is_admin BOOLEAN;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  IF p_tenant_id IS NULL OR trim(coalesce(p_email, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tenant and email are required');
  END IF;

  IF p_role IS NULL OR p_role NOT IN ('admin', 'agent', 'viewer') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid role');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE tenant_id = p_tenant_id AND user_id = uid AND is_active = true AND role = 'admin'
  ) INTO is_admin;
  IF NOT is_admin THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only admins can create invitations');
  END IF;

  -- Ensure team_member row exists (pending invite: user_id NULL)
  INSERT INTO team_members (tenant_id, user_id, name, email, role, is_active)
  VALUES (p_tenant_id, NULL, trim(coalesce(p_name, '')), lower(trim(p_email)), p_role, true)
  ON CONFLICT (tenant_id, email) DO UPDATE SET
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    is_active = true;

  -- Generate a secure short code (url-safe, no special chars)
  inv_code := encode(gen_random_bytes(18), 'base64');
  inv_code := replace(replace(replace(inv_code, '+', ''), '/', ''), '=', '');

  INSERT INTO tenant_invitations (id, tenant_id, email, name, role, invitation_code, invited_by, expires_at)
  VALUES (gen_random_uuid(), p_tenant_id, lower(trim(p_email)), trim(coalesce(p_name, '')), p_role, inv_code, uid, NOW() + INTERVAL '7 days')
  RETURNING id, invitation_code INTO inv_id, inv_code;

  RETURN jsonb_build_object(
    'ok', true,
    'invitation_code', inv_code,
    'invite_path', '/accept-invite?code=' || inv_code
  );
END;
$$;

COMMENT ON FUNCTION create_tenant_invitation(UUID, TEXT, TEXT, TEXT) IS 'Creates a team_member (if needed) and a tenant_invitation; returns code and path for invite link.';

-- 3) RPC: Get invitation details by code (for accept-invite page; minimal public info).
-- Allowed without auth so the landing page can show "You're invited to join X".
CREATE OR REPLACE FUNCTION get_invitation_by_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
BEGIN
  IF trim(coalesce(p_code, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Code required');
  END IF;

  SELECT i.id, i.tenant_id, i.email, i.name, i.role, i.used_at, i.expires_at, t.name AS tenant_name
  INTO inv
  FROM tenant_invitations i
  JOIN tenants t ON t.id = i.tenant_id
  WHERE i.invitation_code = trim(p_code);

  IF inv.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation not found');
  END IF;

  IF inv.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation already used');
  END IF;

  IF inv.expires_at IS NOT NULL AND inv.expires_at < NOW() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation expired');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', inv.tenant_id,
    'tenant_name', inv.tenant_name,
    'email', inv.email,
    'role', inv.role,
    'name', inv.name
  );
END;
$$;

COMMENT ON FUNCTION get_invitation_by_code(TEXT) IS 'Returns non-sensitive invitation details for the accept-invite page.';

-- 4) RPC: Accept invitation (authenticated). Links current user to the tenant with the invited role.
CREATE OR REPLACE FUNCTION accept_tenant_invitation(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  inv RECORD;
  user_email TEXT;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  IF trim(coalesce(p_code, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Code required');
  END IF;

  SELECT email FROM auth.users WHERE id = uid INTO user_email;
  user_email := lower(trim(coalesce(user_email, '')));

  SELECT id, tenant_id, email, role, used_at, expires_at
  INTO inv
  FROM tenant_invitations
  WHERE invitation_code = trim(p_code);

  IF inv.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation not found');
  END IF;

  IF inv.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation already used');
  END IF;

  IF inv.expires_at IS NOT NULL AND inv.expires_at < NOW() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation expired');
  END IF;

  -- Require that the logged-in user's email matches the invitation (security)
  IF user_email <> lower(trim(inv.email)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation was sent to a different email address');
  END IF;

  -- Mark invitation as used
  UPDATE tenant_invitations SET used_at = NOW() WHERE id = inv.id;

  -- Link or update team_member: set user_id for this tenant+email row
  UPDATE team_members
  SET user_id = uid,
      name = COALESCE(NULLIF(trim(name), ''), (SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = uid), '')
  WHERE tenant_id = inv.tenant_id AND lower(trim(email)) = user_email;

  -- If no row existed (e.g. different tenant_email uniqueness), insert one
  IF NOT FOUND THEN
    INSERT INTO team_members (tenant_id, user_id, name, email, role, is_active)
    SELECT inv.tenant_id, uid,
           COALESCE(u.raw_user_meta_data->>'full_name', ''),
           u.email, inv.role, true
    FROM auth.users u WHERE u.id = uid;
  END IF;

  RETURN jsonb_build_object('ok', true, 'tenant_id', inv.tenant_id);
END;
$$;

COMMENT ON FUNCTION accept_tenant_invitation(TEXT) IS 'Accepts an invitation: links current user to the tenant with the invited role.';
