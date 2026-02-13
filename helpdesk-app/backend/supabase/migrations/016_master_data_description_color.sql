-- Add description and custom color (hex) to master data for pills and color picker

ALTER TABLE ticket_statuses
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS color_hex VARCHAR(7);

ALTER TABLE ticket_categories
  ADD COLUMN IF NOT EXISTS color_hex VARCHAR(7);

-- Optional: set default hex for existing status presets (so pills show color)
UPDATE ticket_statuses SET color_hex = '#8b6b8e' WHERE code = 'open' AND color_hex IS NULL;
UPDATE ticket_statuses SET color_hex = '#c4a574' WHERE code = 'pending' AND color_hex IS NULL;
UPDATE ticket_statuses SET color_hex = '#5a7a65' WHERE code = 'resolved' AND color_hex IS NULL;
UPDATE ticket_statuses SET color_hex = '#6b6b6b' WHERE code = 'closed' AND color_hex IS NULL;
