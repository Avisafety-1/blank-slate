UPDATE public.airspace_zones
SET layer_id = 'restriksjonsomrader',
    display_class = 'BLUE',
    restriction_type = 'CAUTION'
WHERE country_code = 'PL'
  AND theme IN ('DRA-P','DRA-R','DRA-I')
  AND zone_type IN ('DRONE_NO_FLY','R','DRONE_DANGER');