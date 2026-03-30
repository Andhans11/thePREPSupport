-- User-level opt-in for calendar event notifications.

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS notify_on_calendar_events BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.team_members.notify_on_calendar_events
  IS 'When true, user receives in-app notifications for newly synced/updated calendar events.';
