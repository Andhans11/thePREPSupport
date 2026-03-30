-- Google Calendar connection and synced events per tenant/user.

CREATE TABLE IF NOT EXISTS public.google_calendar_sync (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_address TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  token_expiry TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_google_calendar_sync_tenant ON public.google_calendar_sync(tenant_id);
CREATE INDEX IF NOT EXISTS idx_google_calendar_sync_user ON public.google_calendar_sync(user_id);

CREATE TABLE IF NOT EXISTS public.google_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  calendar_sync_id UUID NOT NULL REFERENCES public.google_calendar_sync(id) ON DELETE CASCADE,
  google_event_id TEXT NOT NULL,
  summary TEXT,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  is_all_day BOOLEAN NOT NULL DEFAULT false,
  status TEXT,
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, google_event_id)
);

CREATE INDEX IF NOT EXISTS idx_google_calendar_events_tenant_start ON public.google_calendar_events(tenant_id, start_at);
CREATE INDEX IF NOT EXISTS idx_google_calendar_events_calendar_sync ON public.google_calendar_events(calendar_sync_id);

ALTER TABLE public.google_calendar_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own google_calendar_sync" ON public.google_calendar_sync;
DROP POLICY IF EXISTS "Users can insert own google_calendar_sync" ON public.google_calendar_sync;
DROP POLICY IF EXISTS "Users can update own google_calendar_sync" ON public.google_calendar_sync;
DROP POLICY IF EXISTS "Users can delete own google_calendar_sync" ON public.google_calendar_sync;

CREATE POLICY "Users can read own google_calendar_sync"
  ON public.google_calendar_sync FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND user_has_tenant_access(tenant_id));

CREATE POLICY "Users can insert own google_calendar_sync"
  ON public.google_calendar_sync FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND user_has_tenant_access(tenant_id));

CREATE POLICY "Users can update own google_calendar_sync"
  ON public.google_calendar_sync FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND user_has_tenant_access(tenant_id));

CREATE POLICY "Users can delete own google_calendar_sync"
  ON public.google_calendar_sync FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "Tenant members can read google_calendar_events" ON public.google_calendar_events;
CREATE POLICY "Tenant members can read google_calendar_events"
  ON public.google_calendar_events FOR SELECT TO authenticated
  USING (user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "Users can insert own google_calendar_events" ON public.google_calendar_events;
DROP POLICY IF EXISTS "Users can update own google_calendar_events" ON public.google_calendar_events;
DROP POLICY IF EXISTS "Users can delete own google_calendar_events" ON public.google_calendar_events;

CREATE POLICY "Users can insert own google_calendar_events"
  ON public.google_calendar_events FOR INSERT TO authenticated
  WITH CHECK (
    user_has_tenant_access(tenant_id)
    AND EXISTS (
      SELECT 1
      FROM public.google_calendar_sync gcs
      WHERE gcs.id = google_calendar_events.calendar_sync_id
        AND gcs.user_id = auth.uid()
        AND gcs.tenant_id = google_calendar_events.tenant_id
    )
  );

CREATE POLICY "Users can update own google_calendar_events"
  ON public.google_calendar_events FOR UPDATE TO authenticated
  USING (
    user_has_tenant_access(tenant_id)
    AND EXISTS (
      SELECT 1
      FROM public.google_calendar_sync gcs
      WHERE gcs.id = google_calendar_events.calendar_sync_id
        AND gcs.user_id = auth.uid()
        AND gcs.tenant_id = google_calendar_events.tenant_id
    )
  );

CREATE POLICY "Users can delete own google_calendar_events"
  ON public.google_calendar_events FOR DELETE TO authenticated
  USING (
    user_has_tenant_access(tenant_id)
    AND EXISTS (
      SELECT 1
      FROM public.google_calendar_sync gcs
      WHERE gcs.id = google_calendar_events.calendar_sync_id
        AND gcs.user_id = auth.uid()
        AND gcs.tenant_id = google_calendar_events.tenant_id
    )
  );
