ALTER TABLE public.airspace_zones
  DROP CONSTRAINT IF EXISTS airspace_zones_zone_type_chk;

ALTER TABLE public.airspace_zones
  ADD CONSTRAINT airspace_zones_zone_type_chk CHECK (
    zone_type = ANY (ARRAY[
      'CTR'::text,
      'MCTR'::text,
      'TIZ'::text,
      'TMZ'::text,
      'RMZ'::text,
      'ATZ'::text,
      'TMA'::text,
      'FIR'::text,
      'P'::text,
      'R'::text,
      'D'::text,
      'DRONE_NO_FLY'::text,
      'DRONE_DANGER'::text,
      'DRONE_PROTECTED_OBJECT'::text,
      'DRONE_RED'::text,
      'DRONE_ORANGE'::text,
      'DRONE_BLUE'::text,
      'RPAS_5KM'::text,
      'ATZ_5KM'::text,
      'NSM'::text,
      'NATURE'::text,
      'NOTAM'::text,
      'OBSTACLE'::text,
      'POWERLINE'::text,
      'OTHER'::text
    ])
  );