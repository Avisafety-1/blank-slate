SELECT net.http_post(
  url := 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/dji-sync-worker',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_anon_key' LIMIT 1),
    'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret' LIMIT 1)
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 120000
);