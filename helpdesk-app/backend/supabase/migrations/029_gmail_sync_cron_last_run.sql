-- Store last run time of the Gmail sync cron job so the settings page can display it.
-- The cron job (sync-gmail-emails-every-5-min) is updated to set last_run_at on each run.

-- Single-row table for the last cron run timestamp
CREATE TABLE IF NOT EXISTS public.gmail_sync_cron_last_run (
  id int PRIMARY KEY DEFAULT 1,
  last_run_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO public.gmail_sync_cron_last_run (id, last_run_at)
VALUES (1, now())
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.gmail_sync_cron_last_run ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read cron last run" ON public.gmail_sync_cron_last_run;
CREATE POLICY "Authenticated can read cron last run"
  ON public.gmail_sync_cron_last_run FOR SELECT TO authenticated
  USING (true);

-- Reschedule the cron job to update last_run_at before calling the Edge Function
DO $$
BEGIN
  PERFORM cron.unschedule('sync-gmail-emails-every-5-min');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'sync-gmail-emails-every-5-min',
  '*/5 * * * *',
  $$
  UPDATE public.gmail_sync_cron_last_run SET last_run_at = now() WHERE id = 1;
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/sync-gmail-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'gmail_sync_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $$
);
