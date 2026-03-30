-- Hide individual synced events from dashboard + calendar views (per-tenant app UI only; does not delete from Google).

ALTER TABLE public.google_calendar_events
  ADD COLUMN IF NOT EXISTS hidden_from_app BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.google_calendar_events.hidden_from_app IS
  'When true, this event is not shown on the dashboard calendar card or the week calendar grid (unless user enables show hidden).';

CREATE INDEX IF NOT EXISTS idx_google_calendar_events_tenant_hidden_start
  ON public.google_calendar_events (tenant_id, hidden_from_app, start_at);
