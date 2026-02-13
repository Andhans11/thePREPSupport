-- Gmail sync every 5 minutes via pg_cron + pg_net.
--
-- Setup (one-time): Create these in Supabase Dashboard → SQL Editor or Vault:
--   1. project_url:  select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url', 'Supabase project URL for cron');
--   2. gmail_sync_cron_secret:  select vault.create_secret('gmail-sync-cron-5min-secret', 'gmail_sync_cron_secret', 'Cron auth for Gmail sync');
--   3. Edge Function secret: set CRON_SECRET to the same value as gmail_sync_cron_secret (e.g. gmail-sync-cron-5min-secret).
--
-- Then the scheduled job below will call sync-gmail-emails every 5 minutes for all connected Gmail tenants.

-- Extensions (may already be enabled on hosted Supabase)
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Unschedule if already present so re-run is idempotent
do $$
begin
  perform cron.unschedule('sync-gmail-emails-every-5-min');
exception
  when others then null;
end $$;

-- Schedule: every 5 minutes
select cron.schedule(
  'sync-gmail-emails-every-5-min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-gmail-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'gmail_sync_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);
