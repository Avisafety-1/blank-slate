-- Stop the temporary DJI sync boost cron jobs
SELECT cron.unschedule('dji-sync-enqueue-boost');
SELECT cron.unschedule('dji-sync-worker-boost');