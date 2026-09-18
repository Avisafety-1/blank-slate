CREATE SCHEMA IF NOT EXISTS archive;

REVOKE ALL ON SCHEMA archive FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA archive TO service_role;

CREATE TABLE IF NOT EXISTS archive.airspace_zones_archive (
  LIKE public.airspace_zones INCLUDING DEFAULTS
);

CREATE TABLE IF NOT EXISTS archive.eurostat_population_1km_archive (
  LIKE public.eurostat_population_1km INCLUDING DEFAULTS
);

REVOKE ALL ON archive.airspace_zones_archive FROM PUBLIC, anon, authenticated;
REVOKE ALL ON archive.eurostat_population_1km_archive FROM PUBLIC, anon, authenticated;
GRANT ALL ON archive.airspace_zones_archive TO service_role;
GRANT ALL ON archive.eurostat_population_1km_archive TO service_role;