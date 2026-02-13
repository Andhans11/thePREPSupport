-- Fix create_tenant_invitation: use pgcrypto.gen_random_bytes (enable pgcrypto in Dashboard → Extensions).
-- search_path includes extensions so gen_random_bytes is found.

CREATE OR REPLACE FUNCTION create_tenant_invitation(
  p_tenant_id UUID,
  p_email TEXT,
  p_name TEXT,
  p_role TEXT DEFAULT 'agent'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

  -- Generate a secure url-safe code (pgcrypto)
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

COMMENT ON FUNCTION create_tenant_invitation(UUID, TEXT, TEXT, TEXT) IS 'Creates a team_member (if needed) and a tenant_invitation; returns code and path for invite link. Uses pgcrypto.gen_random_bytes.';
