-- Ensure every ticket has a unique ticket number (trigger already assigns TKT-xxxx when null).
-- Backfill any existing nulls then enforce NOT NULL.
DO $$
DECLARE
  r RECORD;
  n INTEGER := 0;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM 5) AS INTEGER)), 0) INTO n
  FROM tickets
  WHERE ticket_number ~ '^TKT-[0-9]+$';
  FOR r IN SELECT id FROM tickets WHERE ticket_number IS NULL OR ticket_number = ''
  LOOP
    n := n + 1;
    UPDATE tickets SET ticket_number = 'TKT-' || LPAD(n::TEXT, 4, '0') WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE tickets ALTER COLUMN ticket_number SET NOT NULL;

COMMENT ON COLUMN tickets.ticket_number IS 'Unique human-readable id e.g. TKT-0001; auto-set by trigger if not provided.';
