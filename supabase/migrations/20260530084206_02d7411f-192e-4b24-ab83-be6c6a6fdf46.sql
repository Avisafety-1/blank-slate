CREATE OR REPLACE FUNCTION public.propagate_company_settings_to_children()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- show_all_airspace_warnings
  IF COALESCE(NEW.propagate_airspace_warnings, false) AND (
       NEW.show_all_airspace_warnings IS DISTINCT FROM OLD.show_all_airspace_warnings
       OR COALESCE(NEW.propagate_airspace_warnings, false) IS DISTINCT FROM COALESCE(OLD.propagate_airspace_warnings, false)
  ) THEN
    UPDATE public.companies
       SET show_all_airspace_warnings = NEW.show_all_airspace_warnings
     WHERE parent_company_id = NEW.id
       AND show_all_airspace_warnings IS DISTINCT FROM NEW.show_all_airspace_warnings;
  END IF;

  -- hide_reporter_identity
  IF COALESCE(NEW.propagate_hide_reporter, false) AND (
       NEW.hide_reporter_identity IS DISTINCT FROM OLD.hide_reporter_identity
       OR COALESCE(NEW.propagate_hide_reporter, false) IS DISTINCT FROM COALESCE(OLD.propagate_hide_reporter, false)
  ) THEN
    UPDATE public.companies
       SET hide_reporter_identity = NEW.hide_reporter_identity
     WHERE parent_company_id = NEW.id
       AND hide_reporter_identity IS DISTINCT FROM NEW.hide_reporter_identity;
  END IF;

  -- require_mission_approval
  IF COALESCE(NEW.propagate_mission_approval, false) AND (
       NEW.require_mission_approval IS DISTINCT FROM OLD.require_mission_approval
       OR COALESCE(NEW.propagate_mission_approval, false) IS DISTINCT FROM COALESCE(OLD.propagate_mission_approval, false)
  ) THEN
    UPDATE public.companies
       SET require_mission_approval = NEW.require_mission_approval
     WHERE parent_company_id = NEW.id
       AND require_mission_approval IS DISTINCT FROM NEW.require_mission_approval;
  END IF;

  -- prevent_self_approval
  IF COALESCE(NEW.propagate_prevent_self_approval, false) AND (
       NEW.prevent_self_approval IS DISTINCT FROM OLD.prevent_self_approval
       OR COALESCE(NEW.propagate_prevent_self_approval, false) IS DISTINCT FROM COALESCE(OLD.propagate_prevent_self_approval, false)
  ) THEN
    UPDATE public.companies
       SET prevent_self_approval = NEW.prevent_self_approval
     WHERE parent_company_id = NEW.id
       AND prevent_self_approval IS DISTINCT FROM NEW.prevent_self_approval;
  END IF;

  -- all_users_can_acknowledge_maintenance
  IF COALESCE(NEW.propagate_all_users_can_acknowledge_maintenance, false) AND (
       NEW.all_users_can_acknowledge_maintenance IS DISTINCT FROM OLD.all_users_can_acknowledge_maintenance
       OR COALESCE(NEW.propagate_all_users_can_acknowledge_maintenance, false) IS DISTINCT FROM COALESCE(OLD.propagate_all_users_can_acknowledge_maintenance, false)
  ) THEN
    UPDATE public.companies
       SET all_users_can_acknowledge_maintenance = NEW.all_users_can_acknowledge_maintenance
     WHERE parent_company_id = NEW.id
       AND all_users_can_acknowledge_maintenance IS DISTINCT FROM NEW.all_users_can_acknowledge_maintenance;
  END IF;

  -- require_sora_on_missions + require_sora_steps
  IF COALESCE(NEW.propagate_sora_required, false) AND (
       NEW.require_sora_on_missions IS DISTINCT FROM OLD.require_sora_on_missions
       OR NEW.require_sora_steps IS DISTINCT FROM OLD.require_sora_steps
       OR COALESCE(NEW.propagate_sora_required, false) IS DISTINCT FROM COALESCE(OLD.propagate_sora_required, false)
  ) THEN
    UPDATE public.companies
       SET require_sora_on_missions = NEW.require_sora_on_missions,
           require_sora_steps = NEW.require_sora_steps
     WHERE parent_company_id = NEW.id
       AND (require_sora_on_missions IS DISTINCT FROM NEW.require_sora_on_missions
            OR require_sora_steps IS DISTINCT FROM NEW.require_sora_steps);
  END IF;

  -- deviation_report_enabled
  IF COALESCE(NEW.propagate_deviation_report, false) AND (
       NEW.deviation_report_enabled IS DISTINCT FROM OLD.deviation_report_enabled
       OR COALESCE(NEW.propagate_deviation_report, false) IS DISTINCT FROM COALESCE(OLD.propagate_deviation_report, false)
  ) THEN
    UPDATE public.companies
       SET deviation_report_enabled = NEW.deviation_report_enabled
     WHERE parent_company_id = NEW.id
       AND deviation_report_enabled IS DISTINCT FROM NEW.deviation_report_enabled;
  END IF;

  -- SafeSky callsign prefix + variable + test_mode
  IF COALESCE(NEW.safesky_callsign_propagate, false) AND (
       NEW.safesky_callsign_prefix IS DISTINCT FROM OLD.safesky_callsign_prefix
       OR NEW.safesky_callsign_variable IS DISTINCT FROM OLD.safesky_callsign_variable
       OR COALESCE(NEW.safesky_callsign_test_mode, false) IS DISTINCT FROM COALESCE(OLD.safesky_callsign_test_mode, false)
       OR COALESCE(NEW.safesky_callsign_propagate, false) IS DISTINCT FROM COALESCE(OLD.safesky_callsign_propagate, false)
  ) THEN
    UPDATE public.companies
       SET safesky_callsign_prefix = NEW.safesky_callsign_prefix,
           safesky_callsign_variable = NEW.safesky_callsign_variable,
           safesky_callsign_test_mode = COALESCE(NEW.safesky_callsign_test_mode, false)
     WHERE parent_company_id = NEW.id
       AND (safesky_callsign_prefix IS DISTINCT FROM NEW.safesky_callsign_prefix
            OR safesky_callsign_variable IS DISTINCT FROM NEW.safesky_callsign_variable
            OR COALESCE(safesky_callsign_test_mode, false) IS DISTINCT FROM COALESCE(NEW.safesky_callsign_test_mode, false));
  END IF;

  RETURN NEW;
END;
$$;