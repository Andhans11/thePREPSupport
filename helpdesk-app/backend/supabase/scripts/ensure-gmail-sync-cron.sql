-- Ensure scheduled Gmail sync is set up so all new emails get synced every 15 minutes.
-- Run this in Supabase Dashboard → SQL Editor.
--
-- First time: run the whole file. If vault steps error with "already exists", that's OK.
-- Later: you can run only the "Schedule cron job" block (from DO $$ to the end of cron.schedule) to re-apply the schedule.

-- =============================================================================
-- 1) Vault secrets (create only if missing; safe to run multiple times)
-- =============================================================================

DO $$
BEGIN
  PERFORM vault.create_secret(
    'https://wbyvazcyyaolkwmjyetr.supabase.co',
    'project_url',
    'Supabase project URL for cron'
  );
EXCEPTION
  WHEN unique_violation THEN NULL;  -- already exists
END $$;

DO $$
BEGIN
  PERFORM vault.create_secret(
    'gmail-sync-cron-5min-secret',
    'gmail_sync_cron_secret',
    'Cron auth for Gmail sync'
  );
EXCEPTION
  WHEN unique_violation THEN NULL;  -- already exists
END $$;

-- =============================================================================
-- 2) Schedule cron job (safe to run every time; ensures job is active)
-- =============================================================================

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

-- =============================================================================
-- After running this: set Edge Function secret so cron is accepted (no 401)
-- Dashboard → Edge Functions → sync-gmail-emails → Secrets
--   Name:  CRON_SECRET
--   Value: gmail-sync-cron-5min-secret
-- =============================================================================
