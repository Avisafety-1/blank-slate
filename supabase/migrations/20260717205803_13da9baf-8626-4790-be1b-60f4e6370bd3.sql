CREATE OR REPLACE VIEW public.airspace_zones_with_precedence AS
SELECT id, created_at, updated_at, country_code, source, external_id, zone_type,
       restriction_type, display_class, theme, name, short_name, authority,
       lower_limit_m, upper_limit_m, lower_limit_raw, upper_limit_raw,
       altitude_reference, valid_from, valid_to, active, properties, geom,
       layer_id, authority_rank, dedupe_key,
       CASE
         WHEN active
              AND (valid_from IS NULL OR valid_from <= now())
              AND (valid_to   IS NULL OR valid_to   >  now())
              AND dedupe_key IS NOT NULL
         THEN row_number() OVER (
           PARTITION BY country_code, layer_id, dedupe_key
           ORDER BY
             (NOT active),                                          -- active first
             (valid_from IS NOT NULL AND valid_from > now()),        -- currently-valid first
             (valid_to   IS NOT NULL AND valid_to  <= now()),        -- not-expired first
             authority_rank,                                         -- lower rank = higher authority
             updated_at DESC
         )
         ELSE NULL::bigint
       END AS precedence_rank
  FROM public.airspace_zones z;