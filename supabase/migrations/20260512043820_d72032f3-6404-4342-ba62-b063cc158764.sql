-- Stop the boost cron job (runs every minute with 5 parallel workers)
SELECT cron.unschedule('dji-sync-worker-boost');