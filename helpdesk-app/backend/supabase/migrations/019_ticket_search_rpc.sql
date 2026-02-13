-- Full-text search for tickets: subject, ticket_number, customer name/email, assignee name/email, message content.
-- Returns ticket ids that match the term so the app can filter the main ticket list.

CREATE OR REPLACE FUNCTION search_ticket_ids(search_term text)
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
  LEFT JOIN team_members tm ON tm.user_id = t.assigned_to AND tm.is_active = true
  LEFT JOIN messages m ON m.ticket_id = t.id
  CROSS JOIN term
  WHERE trim(coalesce(search_term, '')) <> ''
    AND (
      t.subject ILIKE term.q
      OR t.ticket_number ILIKE term.q
      OR t.id::text ILIKE term.q
      OR c.name ILIKE term.q
      OR c.email ILIKE term.q
      OR tm.name ILIKE term.q
      OR tm.email ILIKE term.q
      OR m.content ILIKE term.q
    );
$$;

COMMENT ON FUNCTION search_ticket_ids(text) IS 'Returns ticket ids matching search term in subject, ticket_number, ticket id (uuid), customer name/email, assignee name/email, or message content.';
