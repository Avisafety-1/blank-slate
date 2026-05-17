CREATE OR REPLACE FUNCTION public.admin_trigger_edge_function(p_name text, p_body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  secret text;
  req_id bigint;
BEGIN
  IF p_name NOT IN ('sync-caa-drone-zones','fetch-notams') THEN
    RAISE EXCEPTION 'Function % is not whitelisted', p_name;
  END IF;
  SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name = 'CRON_SHARED_SECRET' LIMIT 1;
  SELECT net.http_post(
    url := 'https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/' || p_name,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdWNzdnJ5cG9ndHR0cmFqcXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMjcyMDEsImV4cCI6MjA3OTgwMzIwMX0.DMr5OjalAbZKedx0zqcTBWe5eMTrjlXIw384ycvX8dE',
      'x-cron-secret', secret
    ),
    body := p_body
  ) INTO req_id;
  RETURN req_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_trigger_edge_function(text, jsonb) TO anon, authenticated;