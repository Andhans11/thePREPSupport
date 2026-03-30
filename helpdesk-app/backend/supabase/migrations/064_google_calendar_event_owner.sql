ALTER TABLE public.google_calendar_events
  ADD COLUMN IF NOT EXISTS owner_team_member_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_google_calendar_events_owner_team_member_id
  ON public.google_calendar_events(owner_team_member_id);

DROP POLICY IF EXISTS "Users can update own google_calendar_events" ON public.google_calendar_events;
DROP POLICY IF EXISTS "Tenant members can update google_calendar_events" ON public.google_calendar_events;
CREATE POLICY "Tenant members can update google_calendar_events"
  ON public.google_calendar_events FOR UPDATE TO authenticated
  USING (user_has_tenant_access(tenant_id));
