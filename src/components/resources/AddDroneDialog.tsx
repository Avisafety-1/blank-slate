import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTerminology } from "@/hooks/useTerminology";
import { useChecklists } from "@/hooks/useChecklists";
import { usePlanGating } from "@/hooks/usePlanGating";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDepartmentVisibility } from "@/hooks/useDepartmentVisibility";
import { useAuth } from "@/contexts/AuthContext";
import { DepartmentChecklist } from "@/components/admin/DepartmentChecklist";
import { SearchablePersonSelect } from "@/components/SearchablePersonSelect";
import { DroneFormFields, DroneFormValues, emptyDroneFormValues } from "./DroneFormFields";
import { MaintenanceSchedulesSection, StandardEntry } from "./MaintenanceSchedulesSection";
import { MaintenanceSchedule, nextDueFromInterval } from "@/lib/maintenanceSchedules";

interface DroneModel {
  id: string;
  name: string;
  eu_class: string;
  weight_kg: number;
  payload_kg: number;
  weight_without_payload_kg: number | null;
  standard_takeoff_weight_kg: number | null;
  category: string | null;
  endurance_min: number | null;
  max_wind_mps: number | null;
  sensor_type: string | null;
  comment: string | null;
}

export interface DroneDefaultValues {
  modell?: string;
  serienummer?: string;
  internal_serial?: string;
  merknader?: string;
  dji_aircraft_name?: string;
}

interface AddDroneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDroneAdded: () => void;
  userId: string;
  defaultValues?: DroneDefaultValues;
  onDroneCreated?: (drone: { id: string; modell: string; serienummer: string }) => void;
}

export const AddDroneDialog = ({ open, onOpenChange, onDroneAdded, userId, defaultValues, onDroneCreated }: AddDroneDialogProps) => {
  const { t } = useTranslation();
  const tt = (k: string, opts?: any) => t(`resourceDialogs.droneDetail.${k}`, opts) as string;
  const [companyId, setCompanyId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [droneCount, setDroneCount] = useState(0);
  const [droneModels, setDroneModels] = useState<DroneModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [values, setValues] = useState<DroneFormValues>(emptyDroneFormValues);
  const [technicalResponsibleId, setTechnicalResponsibleId] = useState<string | null>(null);
  const [technicalResponsiblePersons, setTechnicalResponsiblePersons] = useState<{ id: string; full_name: string | null }[]>([]);
  const [draftSchedules, setDraftSchedules] = useState<MaintenanceSchedule[]>([]);

  const terminology = useTerminology();
  const { checklists } = useChecklists();
  const { maxDrones, currentPlan, seatCount } = usePlanGating();
  const isMobile = useIsMobile();
  const { isAdmin } = useAuth();
  const deptVis = useDepartmentVisibility("drone", undefined, companyId || undefined, open);

  const onChange = (patch: Partial<DroneFormValues>) => setValues((prev) => ({ ...prev, ...patch }));

  useEffect(() => {
    const fetchCompanyId = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .single();

      if (data) {
        setCompanyId(data.company_id);
        const { count } = await supabase
          .from("drones")
          .select("id", { count: 'exact', head: true })
          .eq("company_id", data.company_id);
        setDroneCount(count ?? 0);
      }
    };

    if (userId) {
      fetchCompanyId();
    }
  }, [userId]);

  // Fetch drone models catalog
  useEffect(() => {
    const fetchDroneModels = async () => {
      const { data, error } = await supabase
        .from("drone_models")
        .select("*")
        .order("name");

      if (data && !error) {
        setDroneModels(data as DroneModel[]);
      }
    };

    if (open) {
      fetchDroneModels();
    }
  }, [open]);

  // Fetch technical responsible candidates
  useEffect(() => {
    if (!companyId || !open) return;
    const fetchTechPersons = async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("id, full_name")
        .eq("company_id", companyId)
        .eq("is_technical_responsible", true)
        .eq("approved", true);
      setTechnicalResponsiblePersons(data || []);
    };
    fetchTechPersons();
  }, [companyId, open]);

  // Reset form when dialog closes, pre-populate from defaultValues when opening
  useEffect(() => {
    if (!open) {
      setSelectedModelId("");
      setValues(emptyDroneFormValues);
      setTechnicalResponsibleId(null);
      setDraftSchedules([]);
    } else {
      setValues({
        ...emptyDroneFormValues,
        modell: defaultValues?.modell || "",
        serienummer: defaultValues?.serienummer || "",
        internal_serial: defaultValues?.internal_serial || "",
        merknader: defaultValues?.merknader || "",
        dji_aircraft_name: defaultValues?.dji_aircraft_name || "",
      });
    }
  }, [open, defaultValues]);

  // Auto-calculated next inspection from start date + interval
  const calculatedNextInspection = (() => {
    if (values.inspection_start_date && values.inspection_interval_days) {
      const days = parseInt(values.inspection_interval_days);
      if (!isNaN(days) && days > 0) {
        const nextDate = new Date(values.inspection_start_date);
        nextDate.setDate(nextDate.getDate() + days);
        return nextDate.toISOString().split('T')[0];
      }
    }
    return "";
  })();

  // Draft-mode standard maintenance: mirror of DroneFormValues for the shared maintenance section
  const numOrNull = (v: string) => (v !== "" && !isNaN(Number(v)) ? Number(v) : null);
  const standardEntry: StandardEntry = {
    sjekkliste_id: values.sjekkliste_id !== "none" ? values.sjekkliste_id : null,
    start_date: values.inspection_start_date || null,
    last_at: values.sist_inspeksjon || null,
    next_at: calculatedNextInspection || values.neste_inspeksjon || null,
    interval_days: numOrNull(values.inspection_interval_days),
    interval_hours: numOrNull(values.inspection_interval_hours),
    interval_missions: numOrNull(values.inspection_interval_missions),
    interval_cycles: null,
    warn_days: numOrNull(values.varsel_dager),
    warn_hours: numOrNull(values.varsel_timer),
    warn_missions: numOrNull(values.varsel_oppdrag),
    warn_cycles: null,
  };
  const handleDraftStandardChange = (entry: StandardEntry) => {
    onChange({
      sjekkliste_id: entry.sjekkliste_id ?? "none",
      inspection_start_date: entry.start_date ?? "",
      sist_inspeksjon: entry.last_at ?? "",
      neste_inspeksjon: entry.next_at ?? "",
      inspection_interval_days: entry.interval_days != null ? String(entry.interval_days) : "",
      inspection_interval_hours: entry.interval_hours != null ? String(entry.interval_hours) : "",
      inspection_interval_missions: entry.interval_missions != null ? String(entry.interval_missions) : "",
      varsel_dager: entry.warn_days != null ? String(entry.warn_days) : "",
      varsel_timer: entry.warn_hours != null ? String(entry.warn_hours) : "",
      varsel_oppdrag: entry.warn_missions != null ? String(entry.warn_missions) : "",
    });
  };

  const handleModelSelect = (modelId: string) => {
    setSelectedModelId(modelId);
    if (modelId && modelId !== "manual") {
      const model = droneModels.find(m => m.id === modelId);
      if (model) {
        onChange({
          modell: model.name,
          klasse: model.eu_class,
          vekt: model.weight_kg?.toString() ?? "",
          payload: model.payload_kg?.toString() ?? "",
          merknader: model.comment || "",
        });
      }
    } else {
      onChange({ modell: "", klasse: "", vekt: "", payload: "", merknader: "" });
    }
  };

  const handleAddDrone = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (isSubmitting) return;

    if (droneCount >= maxDrones) {
      toast.error(t('resourceDialogs.addDrone.naddMaks', { max: maxDrones, plan: currentPlan.name, perUser: currentPlan.maxDrones, seats: seatCount }));
      return;
    }

    if (!companyId) {
      toast.error(t('resourceDialogs.addDrone.kunneIkkeHenteBruker'));
      return;
    }

    setIsSubmitting(true);

    const num = (v: string) => (v !== "" && !isNaN(Number(v)) ? Number(v) : null);

    try {
      const { data: droneData, error } = await (supabase as any).from("drones").insert([{
        user_id: userId,
        company_id: companyId,
        modell: values.modell,
        serienummer: values.serienummer || '',
        internal_serial: values.internal_serial || null,
        dji_aircraft_name: values.dji_aircraft_name || null,
        registration_number: values.registration_number || null,
        status: values.status || "Grønn",
        flyvetimer: num(String(values.flyvetimer)) ?? 0,
        merknader: values.merknader || null,
        sist_inspeksjon: values.sist_inspeksjon || null,
        neste_inspeksjon: calculatedNextInspection || values.neste_inspeksjon || null,
        kjøpsdato: values.kjøpsdato || null,
        klasse: values.klasse || null,
        vekt: num(values.vekt),
        payload: num(values.payload),
        inspection_start_date: values.inspection_start_date || null,
        inspection_interval_days: num(values.inspection_interval_days),
        inspection_interval_hours: num(values.inspection_interval_hours),
        inspection_interval_missions: num(values.inspection_interval_missions),
        varsel_dager: num(values.varsel_dager),
        varsel_timer: num(values.varsel_timer),
        varsel_oppdrag: num(values.varsel_oppdrag),
        technical_responsible_id: technicalResponsibleId || null,
        sjekkliste_id: values.sjekkliste_id && values.sjekkliste_id !== "none" ? values.sjekkliste_id : null,
        operations_checklist_ids: values.operations_checklist_ids.length > 0 ? values.operations_checklist_ids : null,
        post_flight_checklist_id: values.post_flight_checklist_id && values.post_flight_checklist_id !== "none" ? values.post_flight_checklist_id : null,
      }]).select().single();

      if (error) {
        console.error("Error adding drone:", error);
        if (error.code === "42501" || error.message?.includes("policy")) {
          toast.error(t('resourceDialogs.addDrone.ikkeTillatelse', { vehicle: terminology.vehicleLower }));
        } else {
          toast.error(t('resourceDialogs.addDrone.kunneIkkeLeggeTil', { vehicle: terminology.vehicleLower, message: error.message || t('resourceDialogs.addDrone.ukjentFeil') }));
        }
        return;
      }

      // Persist department visibility for the new drone
      if (droneData?.id && deptVis.hasDepartments) {
        const idsToInsert = deptVis.allSelected
          ? deptVis.childDepartments.map(d => d.id)
          : deptVis.selectedDeptIds;
        if (idsToInsert.length > 0) {
          await (supabase as any).from("drone_department_visibility").insert(
            idsToInsert.map(cid => ({ drone_id: droneData.id, company_id: cid }))
          );
        }
      }

      // Persist draft custom maintenance schedules now that the drone exists
      if (droneData?.id && draftSchedules.length > 0) {
        const rows = draftSchedules.map((s) => ({
          company_id: companyId,
          drone_id: droneData.id,
          navn: s.navn,
          sjekkliste_id: s.sjekkliste_id,
          interval_days: s.interval_days,
          interval_hours: s.interval_hours,
          interval_missions: s.interval_missions,
          warn_days: s.warn_days,
          warn_hours: s.warn_hours,
          warn_missions: s.warn_missions,
          email_alerts_enabled: s.email_alerts_enabled,
          created_by: userId,
          start_date: new Date().toISOString(),
          next_due_date: nextDueFromInterval(s.interval_days),
        }));
        const { error: schedError } = await (supabase as any).from("maintenance_schedules").insert(rows);
        if (schedError) {
          console.error("Failed to save draft maintenance schedules:", schedError);
          toast.error(t("maintenance.actionError"));
        }
      }

      toast.success(t('resourceDialogs.addDrone.lagtTil', { vehicle: terminology.vehicle }));
      setValues(emptyDroneFormValues);
      setSelectedModelId("");
      setTechnicalResponsibleId(null);
      if (onDroneCreated && droneData) {
        onDroneCreated({ id: droneData.id, modell: droneData.modell, serienummer: droneData.serienummer });
      }
      onDroneAdded();
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-5xl max-h-[90vh] overflow-y-auto">
        <span data-tour="add-drone-marker" className="hidden" />
        <DialogHeader>
          <DialogTitle>{terminology.addVehicle}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleAddDrone} className="space-y-4">
          <DroneFormFields
            values={values}
            onChange={onChange}
            mode="create"
            droneModels={droneModels}
            selectedModelId={selectedModelId}
            onModelSelect={handleModelSelect}
            checklists={checklists}
            isMobile={isMobile}
            schedulesSlot={
              <MaintenanceSchedulesSection
                kind="droner"
                companyId={companyId}
                draftStandard={standardEntry}
                onDraftStandardChange={handleDraftStandardChange}
                draftSchedules={draftSchedules}
                onDraftSchedulesChange={setDraftSchedules}
              />
            }
            technicalResponsibleSlot={
              <div className="border-t pt-4">
                <Label>{tt("techResponsible.label")}</Label>
                <SearchablePersonSelect
                  persons={technicalResponsiblePersons}
                  value={technicalResponsibleId}
                  onValueChange={setTechnicalResponsibleId}
                  placeholder={tt("techResponsible.placeholder")}
                  searchPlaceholder={tt("techResponsible.searchPlaceholder")}
                  emptyText={tt("techResponsible.emptyText")}
                  allowNone
                  noneLabel={tt("techResponsible.noneLabel")}
                />
                <p className="text-xs text-muted-foreground mt-1">{tt("techResponsible.hint")}</p>
              </div>
            }
            adminSlot={
              isAdmin && deptVis.hasDepartments ? (
                <div className="border-t pt-4 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("resourceEditLayout.administration")}</p>
                  <div>
                    <Label className="text-sm font-medium mb-2 block">{tt("deptVisibility.label")}</Label>
                    <DepartmentChecklist
                      departments={deptVis.childDepartments}
                      selectedIds={deptVis.selectedDeptIds}
                      onToggle={deptVis.handleToggle}
                      allSelected={deptVis.allSelected}
                      onToggleAll={deptVis.handleToggleAll}
                      allLabel={tt("deptVisibility.allLabel")}
                    />
                  </div>
                </div>
              ) : null
            }
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {terminology.addVehicle}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
