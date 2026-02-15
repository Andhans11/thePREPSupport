-- Optional start time for time entries so week calendar can show blocks at a specific time.
ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS start_time TIME;

COMMENT ON COLUMN time_entries.start_time IS 'Optional start time for the entry; used in week calendar view. If null, UI may default to 08:00.';
