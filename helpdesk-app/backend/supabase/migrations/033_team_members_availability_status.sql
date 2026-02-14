-- User availability status for dashboard and header: active, away, busy, offline.
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS availability_status TEXT NOT NULL DEFAULT 'active'
  CHECK (availability_status IN ('active', 'away', 'busy', 'offline'));

-- Backfill: not available for email -> away
UPDATE team_members
SET availability_status = 'away'
WHERE available_for_email = false AND (availability_status IS NULL OR availability_status = 'active');

COMMENT ON COLUMN team_members.availability_status IS 'User status: active, away, busy, offline (for team list and header)';
