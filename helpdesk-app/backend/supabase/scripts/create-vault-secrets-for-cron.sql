-- Run these in Supabase Dashboard → SQL Editor, ONE AT A TIME.
-- Use copy-paste. Do not retype (to avoid smart quotes).

-- 1) Project URL for cron
SELECT vault.create_secret(
  'https://wbyvazcyyaolkwmjyetr.supabase.co',
  'project_url',
  'Supabase project URL for cron'
);

-- 2) Cron secret (same value must be set as CRON_SECRET in Edge Function sync-gmail-emails)
SELECT vault.create_secret(
  'gmail-sync-cron-5min-secret',
  'gmail_sync_cron_secret',
  'Cron auth for Gmail sync'
);
