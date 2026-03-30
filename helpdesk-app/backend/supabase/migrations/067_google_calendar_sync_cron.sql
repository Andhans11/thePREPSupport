-- Background Google Calendar sync every 15 minutes (same schedule as Gmail sync).
-- Reuses vault secrets: project_url, gmail_sync_cron_secret (must match Edge Function CRON_SECRET).

DO $$
BEGIN
  PERFORM cron.unschedule('sync-google-calendar-events-every-15-min');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'sync-google-calendar-events-every-15-min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/sync-google-calendar-events',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'gmail_sync_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) AS request_id;
  $$
);
