-- Schedule auto-assign of unassigned tickets to team leader after 1 working day.
-- Run this in Supabase Dashboard → SQL Editor after deploying the auto-assign-unassigned-tickets Edge Function.
--
-- Requires: pg_net extension and vault secret for cron auth (reuse or create as below).
-- Edge Function must have CRON_SECRET set to the same value as in vault.

-- =============================================================================
-- 1) Optional: create vault secret for auto-assign cron (if not reusing gmail sync secret)
-- =============================================================================

-- DO $$
-- BEGIN
--   PERFORM vault.create_secret(
--     'your-auto-assign-cron-secret',
--     'auto_assign_cron_secret',
--     'Cron auth for auto-assign'
--   );
-- EXCEPTION
--   WHEN unique_violation THEN NULL;
-- END $$;

-- =============================================================================
-- 2) Schedule cron job (daily at 08:00 UTC = 09:00/10:00 Oslo)
-- =============================================================================

DO $$
BEGIN
  PERFORM cron.unschedule('auto-assign-unassigned-tickets-daily');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Use same project_url and a dedicated secret for this job (create in Vault and set in Edge Function)
SELECT cron.schedule(
  'auto-assign-unassigned-tickets-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/auto-assign-unassigned-tickets',
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
-- Edge Function secret (reuse your existing one)
--   Dashboard → Edge Functions → auto-assign-unassigned-tickets → Secrets
--   Add CRON_SECRET and set it to the SAME value you already use for the Gmail
--   sync cron (the value stored in vault for "gmail_sync_cron_secret").
--   No new secret needed – just point this function at your existing CRON_SECRET.
-- =============================================================================
