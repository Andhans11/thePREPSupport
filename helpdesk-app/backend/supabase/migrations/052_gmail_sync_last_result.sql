-- Store per-tenant "created tickets" count from the last Gmail sync (cron or manual)
-- so the frontend can show "X nye saker" even when sync was triggered by cron.
CREATE TABLE IF NOT EXISTS public.gmail_sync_last_result (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  last_run_at timestamptz NOT NULL DEFAULT now(),
  created_count int NOT NULL DEFAULT 0
);

ALTER TABLE public.gmail_sync_last_result ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can read gmail_sync_last_result" ON public.gmail_sync_last_result;
CREATE POLICY "Tenant members can read gmail_sync_last_result"
  ON public.gmail_sync_last_result FOR SELECT TO authenticated
  USING (user_has_tenant_access(tenant_id));

-- Edge Function (service role) will INSERT/UPDATE; no policy needed for that.

COMMENT ON TABLE public.gmail_sync_last_result IS 'Per-tenant last Gmail sync result: when it ran and how many new tickets were created.';
