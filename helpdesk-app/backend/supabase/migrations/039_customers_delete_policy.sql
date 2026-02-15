-- Allow team members to delete customers (tenant-scoped).
CREATE POLICY "Team members can delete customers" ON customers
  FOR DELETE TO authenticated
  USING (user_has_tenant_access(tenant_id));

-- Enforce: customer can only be deleted when they have no tickets.
CREATE OR REPLACE FUNCTION check_customer_has_no_tickets()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM tickets WHERE customer_id = OLD.id LIMIT 1) THEN
    RAISE EXCEPTION 'Kunden kan ikke slettes fordi det finnes saker knyttet til kunden. Fjern eller flytt sakene først.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_customer_delete_with_tickets ON customers;
CREATE TRIGGER prevent_customer_delete_with_tickets
  BEFORE DELETE ON customers
  FOR EACH ROW
  EXECUTE PROCEDURE check_customer_has_no_tickets();
