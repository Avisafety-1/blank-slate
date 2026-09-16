-- Extend MQTT broker credential serial list to also include internal_serial
CREATE OR REPLACE FUNCTION public.get_all_mqtt_broker_credentials(p_key text)
 RETURNS TABLE(username text, password text, owner_company_id uuid, company_ids uuid[], serial_numbers text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE r RECORD; v_group UUID[];
BEGIN
  FOR r IN SELECT cr.username, cr.password_encrypted, cr.owner_company_id
           FROM public.company_mqtt_credentials cr WHERE cr.enabled = true
  LOOP
    BEGIN
      v_group := ARRAY(
        SELECT c.id FROM public.companies c
        WHERE c.id = r.owner_company_id OR c.parent_company_id = r.owner_company_id
      );

      username := r.username;
      password := pgp_sym_decrypt(r.password_encrypted, p_key);
      owner_company_id := r.owner_company_id;
      company_ids := v_group;
      serial_numbers := ARRAY(
        SELECT DISTINCT trim(s) FROM (
          -- (a) serials owned by the group
          SELECT d.serienummer AS s
          FROM public.drones d
          WHERE d.company_id = ANY(v_group)
            AND d.serienummer IS NOT NULL AND length(trim(d.serienummer)) > 0
          UNION
          SELECT d.internal_serial AS s
          FROM public.drones d
          WHERE d.company_id = ANY(v_group)
            AND d.internal_serial IS NOT NULL AND length(trim(d.internal_serial)) > 0
          UNION
          -- (b) serials the group's personnel are authorised to fly (cross-company)
          SELECT d.serienummer AS s
          FROM public.drone_personnel dp
          JOIN public.drones d ON d.id = dp.drone_id
          JOIN public.profiles p ON p.id = dp.profile_id
          WHERE p.company_id = ANY(v_group)
            AND d.serienummer IS NOT NULL AND length(trim(d.serienummer)) > 0
          UNION
          SELECT d.internal_serial AS s
          FROM public.drone_personnel dp
          JOIN public.drones d ON d.id = dp.drone_id
          JOIN public.profiles p ON p.id = dp.profile_id
          WHERE p.company_id = ANY(v_group)
            AND d.internal_serial IS NOT NULL AND length(trim(d.internal_serial)) > 0
        ) q
      );
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;
  RETURN;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_all_mqtt_broker_credentials(text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_all_mqtt_broker_credentials(text) TO service_role;