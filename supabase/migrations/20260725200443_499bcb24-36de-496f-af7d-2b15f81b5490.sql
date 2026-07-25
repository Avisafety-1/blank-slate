UPDATE public.airspace_zones
   SET geom = ST_FlipCoordinates(geom),
       properties = COALESCE(properties, '{}'::jsonb) || jsonb_build_object('axis_order_fix', 'pl_gdos_2026_07_25'),
       updated_at = now()
 WHERE country_code = 'PL'
   AND active = true
   AND layer_id = 'verneomrader'
   AND source LIKE 'pl_gdos_%'
   AND ST_XMin(geom) >= 48
   AND ST_XMax(geom) <= 56
   AND ST_YMin(geom) >= 13
   AND ST_YMax(geom) <= 25;