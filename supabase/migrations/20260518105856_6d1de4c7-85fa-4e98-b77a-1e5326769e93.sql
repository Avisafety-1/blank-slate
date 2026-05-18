-- =========================================================
-- Auto re-propagation of parent company settings to children
-- =========================================================

CREATE OR REPLACE FUNCTION public.propagate_company_settings_to_children()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act when the row being updated is a parent (has children).
  -- We update children whose parent_company_id = NEW.id, per-field, only if the
  -- corresponding propagate_* flag on NEW is true AND either:
  --   (a) the field value changed, OR
  --   (b) the propagate flag just turned on (sync current parent value down)

  -- show_all_airspace_warnings (propagate_airspace_warnings)
  IF COALESCE(NEW.propagate_airspace_warnings, false) AND (
       NEW.show_all_airspace_warnings IS DISTINCT FROM OLD.show_all_airspace_warnings
       OR COALESCE(NEW.propagate_airspace_warnings, false) IS DISTINCT FROM COALESCE(OLD.propagate_airspace_warnings, false)
  ) THEN
    UPDATE public.companies
       SET show_all_airspace_warnings = NEW.show_all_airspace_warnings
     WHERE parent_company_id = NEW.id
       AND show_all_airspace_warnings IS DISTINCT FROM NEW.show_all_airspace_warnings;
  END IF;

  -- hide_reporter_identity (propagate_hide_reporter)
  IF COALESCE(NEW.propagate_hide_reporter, false) AND (
       NEW.hide_reporter_identity IS DISTINCT FROM OLD.hide_reporter_identity
       OR COALESCE(NEW.propagate_hide_reporter, false) IS DISTINCT FROM COALESCE(OLD.propagate_hide_reporter, false)
  ) THEN
    UPDATE public.companies
       SET hide_reporter_identity = NEW.hide_reporter_identity
     WHERE parent_company_id = NEW.id
       AND hide_reporter_identity IS DISTINCT FROM NEW.hide_reporter_identity;
  END IF;

  -- require_mission_approval (propagate_mission_approval)
  IF COALESCE(NEW.propagate_mission_approval, false) AND (
       NEW.require_mission_approval IS DISTINCT FROM OLD.require_mission_approval
       OR COALESCE(NEW.propagate_mission_approval, false) IS DISTINCT FROM COALESCE(OLD.propagate_mission_approval, false)
  ) THEN
    UPDATE public.companies
       SET require_mission_approval = NEW.require_mission_approval
     WHERE parent_company_id = NEW.id
       AND require_mission_approval IS DISTINCT FROM NEW.require_mission_approval;
  END IF;

  -- prevent_self_approval (propagate_prevent_self_approval)
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

  -- require_sora_on_missions + require_sora_steps (propagate_sora_required)
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

  -- deviation_report_enabled (propagate_deviation_report)
  IF COALESCE(NEW.propagate_deviation_report, false) AND (
       NEW.deviation_report_enabled IS DISTINCT FROM OLD.deviation_report_enabled
       OR COALESCE(NEW.propagate_deviation_report, false) IS DISTINCT FROM COALESCE(OLD.propagate_deviation_report, false)
  ) THEN
    UPDATE public.companies
       SET deviation_report_enabled = NEW.deviation_report_enabled
     WHERE parent_company_id = NEW.id
       AND deviation_report_enabled IS DISTINCT FROM NEW.deviation_report_enabled;
  END IF;

  -- SafeSky callsign prefix + variable (safesky_callsign_propagate)
  IF COALESCE(NEW.safesky_callsign_propagate, false) AND (
       NEW.safesky_callsign_prefix IS DISTINCT FROM OLD.safesky_callsign_prefix
       OR NEW.safesky_callsign_variable IS DISTINCT FROM OLD.safesky_callsign_variable
       OR COALESCE(NEW.safesky_callsign_propagate, false) IS DISTINCT FROM COALESCE(OLD.safesky_callsign_propagate, false)
  ) THEN
    UPDATE public.companies
       SET safesky_callsign_prefix = NEW.safesky_callsign_prefix,
           safesky_callsign_variable = NEW.safesky_callsign_variable
     WHERE parent_company_id = NEW.id
       AND (safesky_callsign_prefix IS DISTINCT FROM NEW.safesky_callsign_prefix
            OR safesky_callsign_variable IS DISTINCT FROM NEW.safesky_callsign_variable);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_company_settings_to_children ON public.companies;
CREATE TRIGGER trg_propagate_company_settings_to_children
AFTER UPDATE ON public.companies
FOR EACH ROW
WHEN (
  NEW.parent_company_id IS NULL -- only fire for parent companies
)
EXECUTE FUNCTION public.propagate_company_settings_to_children();

-- =========================================================
-- One-time backfill: sync existing children to current parent
-- values wherever the propagate flag is currently on.
-- =========================================================

-- show_all_airspace_warnings
UPDATE public.companies c
   SET show_all_airspace_warnings = p.show_all_airspace_warnings
  FROM public.companies p
 WHERE c.parent_company_id = p.id
   AND COALESCE(p.propagate_airspace_warnings, false) = true
   AND c.show_all_airspace_warnings IS DISTINCT FROM p.show_all_airspace_warnings;

-- hide_reporter_identity
UPDATE public.companies c
   SET hide_reporter_identity = p.hide_reporter_identity
  FROM public.companies p
 WHERE c.parent_company_id = p.id
   AND COALESCE(p.propagate_hide_reporter, false) = true
   AND c.hide_reporter_identity IS DISTINCT FROM p.hide_reporter_identity;

-- require_mission_approval
UPDATE public.companies c
   SET require_mission_approval = p.require_mission_approval
  FROM public.companies p
 WHERE c.parent_company_id = p.id
   AND COALESCE(p.propagate_mission_approval, false) = true
   AND c.require_mission_approval IS DISTINCT FROM p.require_mission_approval;

-- prevent_self_approval
UPDATE public.companies c
   SET prevent_self_approval = p.prevent_self_approval
  FROM public.companies p
 WHERE c.parent_company_id = p.id
   AND COALESCE(p.propagate_prevent_self_approval, false) = true
   AND c.prevent_self_approval IS DISTINCT FROM p.prevent_self_approval;

-- all_users_can_acknowledge_maintenance
UPDATE public.companies c
   SET all_users_can_acknowledge_maintenance = p.all_users_can_acknowledge_maintenance
  FROM public.companies p
 WHERE c.parent_company_id = p.id
   AND COALESCE(p.propagate_all_users_can_acknowledge_maintenance, false) = true
   AND c.all_users_can_acknowledge_maintenance IS DISTINCT FROM p.all_users_can_acknowledge_maintenance;

-- require_sora_on_missions + require_sora_steps
UPDATE public.companies c
   SET require_sora_on_missions = p.require_sora_on_missions,
       require_sora_steps = p.require_sora_steps
  FROM public.companies p
 WHERE c.parent_company_id = p.id
   AND COALESCE(p.propagate_sora_required, false) = true
   AND (c.require_sora_on_missions IS DISTINCT FROM p.require_sora_on_missions
        OR c.require_sora_steps IS DISTINCT FROM p.require_sora_steps);

-- deviation_report_enabled
UPDATE public.companies c
   SET deviation_report_enabled = p.deviation_report_enabled
  FROM public.companies p
 WHERE c.parent_company_id = p.id
   AND COALESCE(p.propagate_deviation_report, false) = true
   AND c.deviation_report_enabled IS DISTINCT FROM p.deviation_report_enabled;

-- SafeSky callsign prefix + variable
UPDATE public.companies c
   SET safesky_callsign_prefix = p.safesky_callsign_prefix,
       safesky_callsign_variable = p.safesky_callsign_variable
  FROM public.companies p
 WHERE c.parent_company_id = p.id
   AND COALESCE(p.safesky_callsign_propagate, false) = true
   AND (c.safesky_callsign_prefix IS DISTINCT FROM p.safesky_callsign_prefix
        OR c.safesky_callsign_variable IS DISTINCT FROM p.safesky_callsign_variable);
