-- Expose Gmail sync cron last_run to Realtime so the app can refetch tickets when automatic sync runs
ALTER PUBLICATION supabase_realtime ADD TABLE gmail_sync_cron_last_run;
