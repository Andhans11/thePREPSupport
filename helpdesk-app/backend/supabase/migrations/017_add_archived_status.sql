-- Add archived status for tickets (hidden in main list, shown under Archived section)

INSERT INTO ticket_statuses (code, label, sort_order, color, description, color_hex) VALUES
  ('archived', 'Arkivert', 100, 'neutral', 'Arkiverte saker vises under Arkivert nederst i listen.', '#9ca3af')
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  sort_order = EXCLUDED.sort_order,
  color = EXCLUDED.color,
  description = EXCLUDED.description,
  color_hex = EXCLUDED.color_hex;
