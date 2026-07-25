ALTER TABLE public.notam_rss_feeds DROP CONSTRAINT IF EXISTS notam_rss_feeds_source_type_check;

ALTER TABLE public.notam_rss_feeds
  ADD CONSTRAINT notam_rss_feeds_source_type_check
  CHECK (source_type IN ('rss','country_briefing','pansa_dronemap'));

UPDATE public.notam_rss_feeds
SET enabled = false,
    last_error = 'Disabled: notaminfo does not support Poland and falls back to UK briefing data.'
WHERE source_type = 'country_briefing'
  AND country = 'Poland';

INSERT INTO public.notam_rss_feeds (name, feed_url, enabled, source_type, country, last_error)
VALUES ('PANSA DroneMap: Poland', 'https://api.dronemap.pansa.pl/v1/notams', true, 'pansa_dronemap', 'Poland', NULL)
ON CONFLICT DO NOTHING;

DELETE FROM public.notams
WHERE country_code = 'POL'
  AND (
    location LIKE 'EG%'
    OR properties->>'source' = 'notaminfo-briefing'
    OR properties->>'country' = 'Poland'
  );