-- Reduce Gmail sync cron from every 5 min to every 15 min to cut Edge Function invocations
-- (from 288/day to 96/day) while still seeing all new mail on each run.
-- Job name kept as sync-gmail-emails-every-5-min for compatibility.

DO $$
BEGIN
  PERFORM cron.unschedule('sync-gmail-emails-every-5-min');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'sync-gmail-emails-every-5-min',
  '*/15 * * * *',
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
