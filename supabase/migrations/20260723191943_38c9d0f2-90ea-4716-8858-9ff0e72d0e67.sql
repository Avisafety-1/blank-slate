
-- Extend notam_rss_feeds to support notaminfo per-country briefings alongside RSS.
ALTER TABLE public.notam_rss_feeds
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'rss',
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_upserted_count integer,
  ADD COLUMN IF NOT EXISTS last_error text;

ALTER TABLE public.notam_rss_feeds DROP CONSTRAINT IF EXISTS notam_rss_feeds_source_type_check;
ALTER TABLE public.notam_rss_feeds
  ADD CONSTRAINT notam_rss_feeds_source_type_check
  CHECK (source_type IN ('rss','country_briefing'));

-- feed_url is required for RSS but computed for country_briefing. Keep NOT NULL and store the URL for both.
-- Seed country briefings (all disabled by default; admin enables per country).
INSERT INTO public.notam_rss_feeds (name, feed_url, enabled, source_type, country)
SELECT
  'notaminfo: ' || c AS name,
  'https://notaminfo.com/latest?country=' || replace(c, ' ', '+') AS feed_url,
  false AS enabled,
  'country_briefing' AS source_type,
  c AS country
FROM (VALUES
  ('Austria'),('Belgium'),('Denmark'),('France'),('Germany'),
  ('Iceland'),('Ireland'),('Italy'),('Netherlands'),('Norway'),
  ('Portugal'),('Spain'),('Sweden'),('Switzerland'),('UK')
) AS t(c)
ON CONFLICT DO NOTHING;
