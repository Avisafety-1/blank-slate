CREATE OR REPLACE VIEW public.v_planned_mission_map
WITH (security_invoker = true)
AS
SELECT
  p.id,
  p.mission_id,
  p.company_id,
  p.publish_to_map,
  p.visibility,
  p.anonymous_publish,
  p.share_contact_info,
  p.public_title,
  p.public_description,
  p.public_contact_name,
  p.public_contact_phone,
  p.public_contact_email,
  p.starts_at,
  p.ends_at,
  p.visible_from,
  p.visible_until,
  p.status,
  ST_AsGeoJSON(p.geometry)::jsonb AS geometry_geojson,
  ST_AsGeoJSON(p.center)::jsonb   AS center_geojson
FROM public.mission_map_publications p
WHERE p.publish_to_map = true;

GRANT SELECT ON public.v_planned_mission_map TO authenticated;