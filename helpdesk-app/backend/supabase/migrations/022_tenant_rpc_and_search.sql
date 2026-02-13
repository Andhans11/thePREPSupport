-- RPC: create a new tenant and add the current user as admin (for signup without invitation).
CREATE OR REPLACE FUNCTION create_tenant_and_join(tenant_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  new_tenant_id UUID;
  result JSONB;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  IF trim(tenant_name) = '' OR tenant_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tenant name is required');
  END IF;

  INSERT INTO tenants (id, name) VALUES (gen_random_uuid(), trim(tenant_name)) RETURNING id INTO new_tenant_id;

  INSERT INTO team_members (tenant_id, user_id, name, email, role, is_active)
  SELECT new_tenant_id, uid, COALESCE(u.raw_user_meta_data->>'full_name', ''), u.email, 'admin', true
  FROM auth.users u WHERE u.id = uid;

  result := jsonb_build_object('ok', true, 'tenant_id', new_tenant_id);
  RETURN result;
END;
$$;

COMMENT ON FUNCTION create_tenant_and_join(TEXT) IS 'Creates a new tenant and adds the current user as admin. Used when registering without an invitation.';

-- Search tickets: restrict by tenant (pass tenant_id so the app filters to current tenant).
CREATE OR REPLACE FUNCTION search_ticket_ids(search_term text, filter_tenant_id uuid DEFAULT NULL)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH term AS (SELECT '%' || trim(coalesce(search_term, '')) || '%' AS q)
  SELECT DISTINCT t.id
  FROM tickets t
  LEFT JOIN customers c ON c.id = t.customer_id
  LEFT JOIN team_members tm ON tm.user_id = t.assigned_to AND tm.is_active = true AND tm.tenant_id = t.tenant_id
  LEFT JOIN messages m ON m.ticket_id = t.id
  CROSS JOIN term
  WHERE trim(coalesce(search_term, '')) <> ''
    AND (filter_tenant_id IS NULL OR t.tenant_id = filter_tenant_id)
    AND (
      t.subject ILIKE term.q
      OR t.ticket_number ILIKE term.q
      OR c.name ILIKE term.q
      OR c.email ILIKE term.q
      OR tm.name ILIKE term.q
      OR tm.email ILIKE term.q
      OR m.content ILIKE term.q
    );
$$;

COMMENT ON FUNCTION search_ticket_ids(text, uuid) IS 'Returns ticket ids matching search term; filter_tenant_id restricts to one tenant (required for multi-tenant).';
