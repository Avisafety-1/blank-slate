import { isBatteryType } from "@/config/equipmentCategories";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { createUniqueChannel } from "@/lib/realtimeChannel";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";


import { useAuth } from "@/contexts/AuthContext";
import { useChecklists } from "@/hooks/useChecklists";
import { useDepartmentVisibility } from "@/hooks/useDepartmentVisibility";
import { DepartmentChecklist } from "@/components/admin/DepartmentChecklist";
import { Gauge, Calendar, AlertTriangle, Trash2, Wrench, Book, ClipboardList, ShieldCheck, ChevronDown, Battery, Heart, Zap, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EquipmentLogbookDialog } from "./EquipmentLogbookDialog";
import { ChecklistExecutionDialog } from "./ChecklistExecutionDialog";
import { MaintenanceSchedulesSection } from "./MaintenanceSchedulesSection";
import { ResourceVisibilityWarningDialog } from "./ResourceVisibilityWarningDialog";
import { checkEquipmentResourceVisibility, type MissingVisibility } from "@/lib/droneVisibilityCheck";
import { useEquipmentTypes } from "@/hooks/useEquipmentTypes";
import { getStatusColorClasses, calculateUsageStatus, calculateEquipmentMaintenanceStatus, STATUS_PRIORITY, getEquipmentStatusReasons } from "@/lib/maintenanceStatus";
import { StatusReasonList } from "@/components/resources/StatusReasonList";
import { translateResourceStatus } from "@/lib/i18nHelpers";
import { Status } from "@/types";
import { useBatteryHealth } from "@/hooks/useBatteryHealth";
import { batteryHealthLevel, cycleLevel, levelColorClass } from "@/lib/batteryHealth";
import { pickLatestRelevantWarning } from "@/lib/resourceWarnings";

interface Equipment {
  id: string;
  navn: string;
  type: string;
  serienummer: string;
  internal_serial: string | null;
  status: string;
  merknader: string | null;
  sist_vedlikeholdt: string | null;
  neste_vedlikehold: string | null;
  tilgjengelig: boolean;
  aktiv: boolean;
  flyvetimer?: number;
  varsel_dager?: number | null;
  vekt?: number | null;
  vedlikeholdsintervall_dager?: number | null;
  sjekkliste_id?: string | null;
  inspection_interval_hours?: number | null;
  inspection_interval_missions?: number | null;
  hours_at_last_maintenance?: number;
  missions_at_last_maintenance?: number;
  varsel_timer?: number | null;
  varsel_oppdrag?: number | null;
  battery_cycles?: number | null;
  battery_health_pct?: number | null;
  battery_full_capacity_mah?: number | null;
  battery_max_cell_deviation_v?: number | null;
  company_id?: string | null;
  companies?: { navn?: string | null } | null;
}


interface EquipmentDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment: Equipment | null;
  onEquipmentUpdated: () => void;
}

export const EquipmentDetailDialog = ({ open, onOpenChange, equipment: initialEquipment, onEquipmentUpdated }: EquipmentDetailDialogProps) => {
  const { user, companyId, isAdmin } = useAuth();
  const { t } = useTranslation();

  const queryClient = useQueryClient();
  const { checklists } = useChecklists();
  const deptVis = useDepartmentVisibility("equipment", initialEquipment?.id, companyId || undefined, open);
  const [equipment, setEquipment] = useState<Equipment | null>(initialEquipment);
  // Same battery-health source as the logbook, so both surfaces agree.
  const batteryHealth = useBatteryHealth(
    equipment?.id,
    equipment?.serienummer || equipment?.internal_serial,
    equipment?.company_id ?? companyId,
    open && !!equipment && isBatteryType(equipment.type),
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ackComment, setAckComment] = useState("");
  const [showLogbook, setShowLogbook] = useState(false);
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [confirmMaintenanceOpen, setConfirmMaintenanceOpen] = useState(false);
  const [customType, setCustomType] = useState("");
  const [latestWarning, setLatestWarning] = useState<{ title: string; entry_date: string } | null>(null);
  const [missionsSinceMaintenance, setMissionsSinceMaintenance] = useState(0);
  const [totalMissions, setTotalMissions] = useState(0);

  const equipmentTypes = useEquipmentTypes(companyId || "", open);
  const [visibilityWarning, setVisibilityWarning] = useState<{
    missing: MissingVisibility[];
    onContinue: () => void | Promise<void>;
    onCancel: () => void;
  } | null>(null);
  const [formData, setFormData] = useState({
    navn: "",
    type: "",
    serienummer: "",
    internal_serial: "",
    merknader: "",
    sist_vedlikeholdt: "",
    neste_vedlikehold: "",
    flyvetimer: 0,
    varsel_dager: "14",
    vekt: "",
    vedlikeholdsintervall_dager: "",
    sjekkliste_id: "",
    inspection_interval_hours: "",
    inspection_interval_missions: "",
    varsel_timer: "",
    varsel_oppdrag: "",
  });

  // Update local equipment state when prop changes
  useEffect(() => {
    setEquipment(initialEquipment);
  }, [initialEquipment]);

  // Real-time subscription for equipment updates
  useEffect(() => {
    if (!equipment?.id || !open) return;

    const channel = createUniqueChannel(`equipment-detail-${equipment.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'equipment',
          filter: `id=eq.${equipment.id}`,
        },
        (payload) => {
          console.log('Equipment updated via realtime:', payload.new);
          setEquipment(payload.new as Equipment);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [equipment?.id, open]);

  useEffect(() => {
    if (equipment) {
      setFormData({
        navn: equipment.navn,
        type: equipment.type,
        serienummer: equipment.serienummer,
        internal_serial: equipment.internal_serial || "",
        merknader: equipment.merknader || "",
        sist_vedlikeholdt: equipment.sist_vedlikeholdt ? new Date(equipment.sist_vedlikeholdt).toISOString().split('T')[0] : "",
        neste_vedlikehold: equipment.neste_vedlikehold ? new Date(equipment.neste_vedlikehold).toISOString().split('T')[0] : "",
        flyvetimer: equipment.flyvetimer || 0,
        varsel_dager: equipment.varsel_dager !== null && equipment.varsel_dager !== undefined ? String(equipment.varsel_dager) : "14",
        vekt: equipment.vekt !== null && equipment.vekt !== undefined ? String(equipment.vekt) : "",
        vedlikeholdsintervall_dager: equipment.vedlikeholdsintervall_dager !== null && equipment.vedlikeholdsintervall_dager !== undefined ? String(equipment.vedlikeholdsintervall_dager) : "",
        sjekkliste_id: equipment.sjekkliste_id || "",
        inspection_interval_hours: equipment.inspection_interval_hours != null ? String(equipment.inspection_interval_hours) : "",
        inspection_interval_missions: equipment.inspection_interval_missions != null ? String(equipment.inspection_interval_missions) : "",
        varsel_timer: equipment.varsel_timer != null ? String(equipment.varsel_timer) : "",
        varsel_oppdrag: equipment.varsel_oppdrag != null ? String(equipment.varsel_oppdrag) : "",
      });
      setIsEditing(false);
      fetchLatestWarning();
      fetchMissionsSinceMaintenance();
    }
  }, [equipment]);

  const fetchLatestWarning = async () => {
    if (!equipment) { setLatestWarning(null); return; }
    const { data } = await supabase
      .from("equipment_log_entries")
      .select("title, entry_date, entry_type, description, created_at")
      .eq("equipment_id", equipment.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setLatestWarning(pickLatestRelevantWarning(data as any));
  };

  const fetchMissionsSinceMaintenance = async () => {
    if (!equipment) return;
    const { data } = await supabase
      .from("mission_equipment")
      .select("mission_id")
      .eq("equipment_id", equipment.id);
    if (!data) { setMissionsSinceMaintenance(0); return; }
    const totalMissions = new Set(data.map((r: any) => r.mission_id)).size;
    setMissionsSinceMaintenance(totalMissions - (equipment.missions_at_last_maintenance || 0));
  };

  // Calculate next maintenance when last maintenance or interval changes
  useEffect(() => {
    if (isEditing && formData.sist_vedlikeholdt && formData.vedlikeholdsintervall_dager) {
      const days = parseInt(formData.vedlikeholdsintervall_dager);
      if (!isNaN(days) && days > 0) {
        const nextDate = new Date(formData.sist_vedlikeholdt);
        nextDate.setDate(nextDate.getDate() + days);
        const calculatedDate = nextDate.toISOString().split('T')[0];
        if (calculatedDate !== formData.neste_vedlikehold) {
          setFormData(prev => ({ ...prev, neste_vedlikehold: calculatedDate }));
        }
      }
    }
  }, [isEditing, formData.sist_vedlikeholdt, formData.vedlikeholdsintervall_dager]);

  /** Count unique missions for this equipment via mission_equipment */
  const countEquipmentMissions = async (): Promise<number> => {
    const { data } = await supabase
      .from("mission_equipment")
      .select("mission_id")
      .eq("equipment_id", equipment!.id);
    if (!data) return 0;
    return new Set(data.map((r: any) => r.mission_id)).size;
  };

  const performMaintenanceUpdate = async () => {
    if (!equipment || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      let neste_vedlikehold: string | null = null;
      
      if (equipment.vedlikeholdsintervall_dager) {
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + equipment.vedlikeholdsintervall_dager);
        neste_vedlikehold = nextDate.toISOString().split('T')[0];
      }

      // Count actual total missions for this equipment
      const totalMissions = await countEquipmentMissions();

      const { error } = await (supabase as any)
        .from("equipment")
        .update({
          sist_vedlikeholdt: today,
          neste_vedlikehold,
          hours_at_last_maintenance: equipment.flyvetimer || 0,
          missions_at_last_maintenance: totalMissions,
          // Reset the battery charge-cycle baseline so cycle-based maintenance starts over
          ...((equipment as any).battery_cycles != null
            ? { cycles_at_last_inspection: (equipment as any).battery_cycles }
            : {}),
        })
        .eq("id", equipment.id);

      if (error) throw error;

      // Log maintenance to equipment_log_entries
      if (user && companyId) {
        await supabase.from("equipment_log_entries").insert({
          equipment_id: equipment.id,
          company_id: companyId,
          user_id: user.id,
          entry_date: today,
          entry_type: "vedlikehold",
          title: t('resourceDialogs.equipmentDetail.maintenance.logTitle'),
          description: t('resourceDialogs.equipmentDetail.maintenance.logDescription'),
        });
      }

      toast.success(t('resourceDialogs.equipmentDetail.toasts.maintenanceSuccess', { name: equipment.navn }));
      onEquipmentUpdated();
    } catch (error: any) {
      console.error("Error performing maintenance:", error);
      toast.error(t('resourceDialogs.equipmentDetail.toasts.maintenanceError', { message: error.message }));
    } finally {

      setIsSubmitting(false);
    }
  };

  const handlePerformMaintenance = async () => {
    if (!equipment || isSubmitting) return;
    
    // If equipment has a checklist, open checklist dialog first
    if (equipment.sjekkliste_id) {
      setChecklistDialogOpen(true);
      return;
    }
    
    // Otherwise show confirmation dialog
    setConfirmMaintenanceOpen(true);
  };

  const handleChecklistComplete = async () => {
    setChecklistDialogOpen(false);
    await performMaintenanceUpdate();
  };

  const handleSave = async () => {
    if (!equipment || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("equipment")
        .update({
          navn: formData.navn,
          type: formData.type === "__other__" ? customType : formData.type,
          serienummer: formData.serienummer,
          internal_serial: formData.internal_serial || null,
          merknader: formData.merknader || null,
          flyvetimer: formData.flyvetimer,
          vekt: formData.vekt ? parseFloat(formData.vekt) : null,
          // Standard maintenance fields (intervals, warnings, checklist, dates)
          // are owned by the unified maintenance section and saved from its dialog.

        })
        .eq("id", equipment.id);

      if (error) throw error;

      // Resolve target departments and check checklist-document visibility
      const targetDeptIds = deptVis.hasDepartments
        ? (deptVis.allSelected
            ? deptVis.childDepartments.map((d) => d.id)
            : deptVis.selectedDeptIds)
        : [];

      if (targetDeptIds.length > 0) {
        const missing = await checkEquipmentResourceVisibility(equipment.id, targetDeptIds);
        if (missing.length > 0) {
          await new Promise<void>((resolve) => {
            setVisibilityWarning({
              missing,
              onContinue: async () => {
                await deptVis.saveVisibility();
                resolve();
              },
              onCancel: () => {
                // Skip visibility save, keep equipment update
                resolve();
              },
            });
          });
        } else {
          await deptVis.saveVisibility();
        }
      } else {
        await deptVis.saveVisibility();
      }

      toast.success(t('resourceDialogs.equipmentDetail.toasts.updated'));
      setIsEditing(false);
      onEquipmentUpdated();
    } catch (error: any) {
      console.error("Error updating equipment:", error);
      toast.error(t('resourceDialogs.equipmentDetail.toasts.updateError', { message: error.message }));

    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!equipment || !isAdmin) return;

    try {
      const { error } = await supabase
        .from("equipment")
        .delete()
        .eq("id", equipment.id);

      if (error) throw error;

      toast.success(t('resourceDialogs.equipmentDetail.toasts.deleted'));
      onOpenChange(false);
      onEquipmentUpdated();
    } catch (error: any) {
      console.error("Error deleting equipment:", error);
      toast.error(t('resourceDialogs.equipmentDetail.toasts.deleteError', { message: error.message }));

    }
  };

  // Get linked checklist name for display
  const linkedChecklist = equipment?.sjekkliste_id 
    ? checklists.find(c => c.id === equipment.sjekkliste_id) 
    : null;

  if (!equipment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`w-[95vw] ${isEditing ? "max-w-5xl" : "max-w-2xl"} max-h-[90vh] overflow-y-auto p-4 sm:p-6`}>
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Gauge className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            <span className="truncate">{isEditing ? t('resourceDialogs.equipmentDetail.editTitle') : equipment.navn}</span>
          </DialogTitle>
          <DialogDescription className="sr-only">{t('resourceDialogs.equipmentDetail.dialogDescription')}</DialogDescription>
          {(() => {
            const isSharedFromParent = !!equipment.company_id && !!companyId && equipment.company_id !== companyId;
            return (
              <>
                {isSharedFromParent && (
                  <p className="text-xs text-muted-foreground mt-1 rounded-md bg-muted px-2 py-1.5">
                    {t('resourceDialogs.equipmentDetail.sharedFromParent', { company: equipment.companies?.navn || t('resourceDialogs.equipmentDetail.sharedFromParentFallback') })}
                  </p>
                )}
                {!isEditing && (
                  <Button
                    variant="outline"
                    size="sm"
                    data-tour="equipment-detail-logbok"
                    onClick={() => setShowLogbook(true)}
                    className="w-full mt-2"
                  >
                    <Book className="w-4 h-4 mr-2" />
                    {t('resourceDialogs.equipmentDetail.logbook')}
                  </Button>
                )}
              </>
            );

          })()}
        </DialogHeader>


        <div className="space-y-3 sm:space-y-4">
          {!isEditing ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="flex justify-between sm:block">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">{t('resourceDialogs.equipmentDetail.labels.name')}</p>
                  <p className="text-sm sm:text-base">{equipment.navn}</p>
                </div>
                <div className="flex justify-between sm:block">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">{t('resourceDialogs.equipmentDetail.labels.type')}</p>
                  <p className="text-sm sm:text-base">{equipment.type}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="flex justify-between sm:block">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">{t('resourceDialogs.equipmentDetail.labels.serial')}</p>
                  <p className="text-sm sm:text-base">{equipment.serienummer}</p>
                </div>
                <div className="flex justify-between sm:block">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">{t('resourceDialogs.equipmentDetail.labels.internalSerial')}</p>
                  <p className="text-sm sm:text-base">{equipment.internal_serial || "-"}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="flex justify-between sm:block">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">{t('resourceDialogs.equipmentDetail.labels.weight')}</p>
                  <p className="text-sm sm:text-base">{equipment.vekt ? `${equipment.vekt} ${t('resourceDialogs.equipmentDetail.labels.kgSuffix')}` : t('resourceDialogs.equipmentDetail.labels.notSet')}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="flex justify-between sm:block">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">{t('resourceDialogs.equipmentDetail.labels.flightHours')}</p>
                  <p className="text-sm sm:text-base">{Number(equipment.flyvetimer || 0).toFixed(2)} {t('resourceDialogs.equipmentDetail.labels.hoursSuffix')}</p>
                </div>

                {(() => {
                  const maintenanceOnlyStatus = calculateEquipmentMaintenanceStatus({
                    neste_vedlikehold: equipment.neste_vedlikehold,
                    varsel_dager: equipment.varsel_dager,
                    flyvetimer: equipment.flyvetimer || 0,
                    hours_at_last_maintenance: equipment.hours_at_last_maintenance || 0,
                    inspection_interval_hours: equipment.inspection_interval_hours,
                    varsel_timer: equipment.varsel_timer,
                    missions_since_maintenance: missionsSinceMaintenance,
                    inspection_interval_missions: equipment.inspection_interval_missions,
                    varsel_oppdrag: equipment.varsel_oppdrag,
                  });
                  const dbStatus = (equipment.status as Status) || "Grønn";
                  const aggregatedStatus = STATUS_PRIORITY[dbStatus] >= STATUS_PRIORITY[maintenanceOnlyStatus] ? dbStatus : maintenanceOnlyStatus;
                  const dbDriving = dbStatus !== "Grønn" && STATUS_PRIORITY[dbStatus] > STATUS_PRIORITY[maintenanceOnlyStatus];
                  const { reasons: statusReasons } = getEquipmentStatusReasons({
                    neste_vedlikehold: equipment.neste_vedlikehold,
                    varsel_dager: equipment.varsel_dager,
                    flyvetimer: equipment.flyvetimer || 0,
                    hours_at_last_maintenance: equipment.hours_at_last_maintenance || 0,
                    inspection_interval_hours: equipment.inspection_interval_hours,
                    varsel_timer: equipment.varsel_timer,
                    missions_since_maintenance: missionsSinceMaintenance,
                    inspection_interval_missions: equipment.inspection_interval_missions,
                    varsel_oppdrag: equipment.varsel_oppdrag,
                    dbStatus,
                    latestWarningTitle: latestWarning?.title ?? null,
                  });

                  return (
                    <div className="flex justify-between sm:block">
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground">{t('resourceDialogs.equipmentDetail.labels.status')}</p>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={`${getStatusColorClasses(aggregatedStatus)} border`}>
                            {translateResourceStatus(aggregatedStatus)}
                          </Badge>
                        </div>
                        {aggregatedStatus !== "Grønn" && <StatusReasonList reasons={statusReasons} />}
                        {dbStatus !== "Grønn" && (
                          <AlertDialog onOpenChange={(o) => { if (o) setAckComment(""); }}>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm" className="text-xs h-6 px-2 mt-2">
                                {t('resourceDialogs.equipmentDetail.statusHints.clearWarning')}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t('resourceDialogs.equipmentDetail.statusHints.clearWarningTitle')}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {latestWarning
                                    ? t('resourceDialogs.equipmentDetail.statusHints.clearWarningWithDetail', { title: latestWarning.title, date: new Date(latestWarning.entry_date).toLocaleDateString() })
                                    : t('resourceDialogs.equipmentDetail.statusHints.clearWarningDefault')
                                  }
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <div className="space-y-1.5">
                                <Label htmlFor="equipment-ack-comment" className="text-sm">{t('resourceDialogs.equipmentDetail.statusHints.clearWarningCommentLabel')}</Label>
                                <Textarea
                                  id="equipment-ack-comment"
                                  value={ackComment}
                                  onChange={(e) => setAckComment(e.target.value)}
                                  placeholder={t('resourceDialogs.equipmentDetail.statusHints.clearWarningCommentPlaceholder')}
                                  rows={3}
                                />
                              </div>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t('resourceDialogs.equipmentDetail.cancel')}</AlertDialogCancel>
                                <AlertDialogAction onClick={async () => {
                                  if (!user) return;
                                  const baseNote = latestWarning
                                    ? t('resourceDialogs.equipmentDetail.toasts.clearWarningLogDescriptionWithTitle', { from: equipment.status, title: latestWarning.title })
                                    : t('resourceDialogs.equipmentDetail.toasts.clearWarningLogDescription', { from: equipment.status });
                                  const comment = ackComment.trim();
                                  const note = comment
                                    ? `${baseNote} ${t('resourceDialogs.equipmentDetail.statusHints.clearWarningCommentNote', { comment })}`
                                    : baseNote;
                                  const { error } = await (supabase as any).rpc('acknowledge_resource_warning', {
                                    _resource_type: 'equipment',
                                    _resource_id: equipment.id,
                                    _note: note,
                                  });
                                  if (error) {
                                    const msg = /not_authorized/.test(error.message)
                                      ? t('resourceDialogs.equipmentDetail.toasts.clearWarningNotAuthorized')
                                      : error.message;
                                    toast.error(t('resourceDialogs.equipmentDetail.toasts.clearWarningError', { message: msg }));
                                    return;
                                  }
                                  queryClient.invalidateQueries({ queryKey: ['equipment'] });
                                  onEquipmentUpdated();
                                  toast.success(t('resourceDialogs.equipmentDetail.toasts.clearWarningSuccess'));
                                }}>
                                  {t('resourceDialogs.equipmentDetail.statusHints.clearWarningConfirm')}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        {dbStatus !== "Grønn" && maintenanceOnlyStatus !== "Grønn" && (
                          <p className="text-xs text-muted-foreground mt-1.5 italic">
                            {t('resourceDialogs.equipmentDetail.statusHints.maintenanceStillActive')}
                          </p>
                        )}


                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Battery info section — only for batteries with data */}
              {isBatteryType(equipment.type) && (equipment.battery_cycles != null || equipment.battery_health_pct != null || equipment.battery_full_capacity_mah != null || equipment.battery_max_cell_deviation_v != null) && (
                <div className="border border-border rounded-lg p-3 space-y-3">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Battery className="w-4 h-4 text-primary" />
                    {t('resourceDialogs.equipmentDetail.battery.sectionTitle')}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {equipment.battery_cycles != null && (
                      <div>
                        <p className="text-xs text-muted-foreground">{t('resourceDialogs.equipmentDetail.battery.cycles')}</p>
                        <p className={`text-sm font-medium ${levelColorClass(cycleLevel(equipment.battery_cycles, batteryHealth.config))}`}>
                          {equipment.battery_cycles}
                          {batteryHealth.config.maxCycles ? ` / ${batteryHealth.config.maxCycles}` : ''}
                        </p>
                      </div>
                    )}
                    {(equipment.battery_health_pct != null || batteryHealth.latestHealth != null) && (() => {
                      const healthValue = batteryHealth.latestHealth ?? equipment.battery_health_pct ?? null;
                      const level = batteryHealthLevel(healthValue, batteryHealth.config);
                      const barColor = level === 'critical' ? 'bg-destructive' : level === 'warn' ? 'bg-yellow-500' : 'bg-emerald-500';
                      return (
                        <div>
                          <p className="text-xs text-muted-foreground flex items-center gap-1"><Heart className="w-3 h-3" /> {t('resourceDialogs.equipmentDetail.battery.health')}</p>
                          <div className="flex items-center gap-2">
                            <p className={`text-sm font-medium ${levelColorClass(level)}`}>
                              {healthValue != null ? `${healthValue}%` : '—'}
                            </p>
                            {healthValue != null && (
                              <div className="flex-1 h-2 rounded-full bg-muted">
                                <div
                                  className={`h-full rounded-full transition-all ${barColor}`}
                                  style={{ width: `${Math.min(100, healthValue)}%` }}
                                />
                              </div>
                            )}
                          </div>
                          {batteryHealth.config.typeName && (
                            <p className="text-[10px] text-muted-foreground">{batteryHealth.config.typeName}</p>
                          )}
                        </div>
                      );
                    })()}
                    {equipment.battery_full_capacity_mah != null && (
                      <div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1"><Zap className="w-3 h-3" /> {t('resourceDialogs.equipmentDetail.battery.capacity')}</p>
                        <p className="text-sm">{equipment.battery_full_capacity_mah} mAh</p>
                      </div>
                    )}
                    {equipment.battery_max_cell_deviation_v != null && (
                      <div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1"><Activity className="w-3 h-3" /> {t('resourceDialogs.equipmentDetail.battery.maxCellDeviation')}</p>
                        <p className={`text-sm font-medium ${equipment.battery_max_cell_deviation_v > 0.1 ? 'text-destructive' : ''}`}>
                          {equipment.battery_max_cell_deviation_v.toFixed(3)} V
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Hours progress */}
              {equipment.inspection_interval_hours != null && equipment.inspection_interval_hours > 0 && (() => {
                const hoursSince = (equipment.flyvetimer || 0) - (equipment.hours_at_last_maintenance || 0);
                const pct = Math.min(100, (hoursSince / equipment.inspection_interval_hours) * 100);
                const status = calculateUsageStatus(hoursSince, equipment.inspection_interval_hours, equipment.varsel_timer);
                const barColor = status === "Rød" ? "bg-destructive" : status === "Gul" ? "bg-yellow-500" : "bg-primary";
                return (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">{t('resourceDialogs.equipmentDetail.usage.hoursSinceMaintenance', { current: hoursSince.toFixed(1), limit: equipment.inspection_interval_hours })}</p>
                    <div className="w-full h-2 rounded-full bg-muted">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })()}

              {/* Missions progress */}
              {equipment.inspection_interval_missions != null && equipment.inspection_interval_missions > 0 && (() => {
                const missionsSince = (equipment as any)._missionsSinceMaintenance || 0;
                const pct = Math.min(100, (missionsSince / equipment.inspection_interval_missions) * 100);
                const status = calculateUsageStatus(missionsSince, equipment.inspection_interval_missions, equipment.varsel_oppdrag);
                const barColor = status === "Rød" ? "bg-destructive" : status === "Gul" ? "bg-yellow-500" : "bg-primary";
                return (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">{t('resourceDialogs.equipmentDetail.usage.missionsSinceMaintenance', { current: missionsSince, limit: equipment.inspection_interval_missions })}</p>
                    <div className="w-full h-2 rounded-full bg-muted">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })()}

              {/* Maintenance details in collapsible */}
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full">
                  <ChevronDown className="w-4 h-4 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                  {t('resourceDialogs.equipmentDetail.maintenance.detailsTitle')}
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="flex justify-between sm:block">
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground">{t('resourceDialogs.equipmentDetail.maintenance.intervalDays')}</p>
                      <p className="text-sm sm:text-base">{equipment.vedlikeholdsintervall_dager ? t('resourceDialogs.equipmentDetail.maintenance.intervalDaysValue', { days: equipment.vedlikeholdsintervall_dager }) : t('resourceDialogs.equipmentDetail.labels.notSet')}</p>
                    </div>
                    <div className="flex justify-between sm:block">
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground">{t('resourceDialogs.equipmentDetail.maintenance.intervalHours')}</p>
                      <p className="text-sm sm:text-base">{equipment.inspection_interval_hours ? t('resourceDialogs.equipmentDetail.maintenance.intervalHoursValue', { hours: equipment.inspection_interval_hours }) : t('resourceDialogs.equipmentDetail.labels.notSet')}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="flex justify-between sm:block">
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground">{t('resourceDialogs.equipmentDetail.maintenance.intervalMissions')}</p>
                      <p className="text-sm sm:text-base">{equipment.inspection_interval_missions ? t('resourceDialogs.equipmentDetail.maintenance.intervalMissionsValue', { missions: equipment.inspection_interval_missions }) : t('resourceDialogs.equipmentDetail.labels.notSet')}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="flex justify-between sm:block">
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground">{t('resourceDialogs.equipmentDetail.maintenance.warningDays')}</p>
                      <p className="text-sm sm:text-base">{t('resourceDialogs.equipmentDetail.maintenance.warningDaysValue', { days: equipment.varsel_dager ?? 14 })}</p>
                    </div>
                    <div className="flex justify-between sm:block">
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground">{t('resourceDialogs.equipmentDetail.maintenance.checklist')}</p>
                      <p className="text-sm sm:text-base flex items-center gap-1">
                        {linkedChecklist ? (
                          <>
                            <ClipboardList className="w-3 h-3 text-primary" />
                            {linkedChecklist.tittel}
                          </>
                        ) : (
                          t('resourceDialogs.equipmentDetail.maintenance.none')
                        )}
                      </p>
                    </div>
                  </div>

                </CollapsibleContent>
              </Collapsible>

              <div className="border-t border-border pt-3 sm:pt-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                  <p className="text-sm font-medium">{t('resourceDialogs.equipmentDetail.maintenance.sectionTitle')}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePerformMaintenance}
                    disabled={isSubmitting}
                    className="text-xs gap-1 w-full sm:w-auto"
                  >
                    <Wrench className="w-3 h-3" />
                    {t('resourceDialogs.equipmentDetail.maintenance.perform')}
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="flex items-center justify-between sm:justify-start gap-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground">{t('resourceDialogs.equipmentDetail.maintenance.lastMaintenance')}</p>
                    </div>
                    <p className="text-sm sm:text-base">{equipment.sist_vedlikeholdt ? new Date(equipment.sist_vedlikeholdt).toLocaleDateString() : t('resourceDialogs.equipmentDetail.labels.notPerformed')}</p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-start gap-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <p className="text-xs sm:text-sm font-medium text-muted-foreground">{t('resourceDialogs.equipmentDetail.maintenance.nextMaintenance')}</p>
                    </div>
                    <p className="text-sm sm:text-base">{equipment.neste_vedlikehold ? new Date(equipment.neste_vedlikehold).toLocaleDateString() : t('resourceDialogs.equipmentDetail.labels.notSetDate')}</p>
                  </div>

                </div>
              </div>

              {(equipment.company_id || companyId) && (
                <MaintenanceSchedulesSection
                  kind="utstyr"
                  resourceId={equipment.id}
                  companyId={(equipment.company_id || companyId) as string}
                  isBattery={isBatteryType(equipment.type)}
                  onChanged={() => onEquipmentUpdated()}
                />
              )}

              {equipment.merknader && (
                <div className="border border-amber-500/30 bg-amber-500/10 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-amber-700 dark:text-amber-300">{t('resourceDialogs.equipmentDetail.notes')}</p>
                      <p className="text-xs sm:text-sm mt-1 text-amber-900 dark:text-amber-100 whitespace-pre-wrap break-words">{equipment.merknader}</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-6 items-start">
              {/* Left column: core data */}
              <div className="space-y-4 min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("resourceEditLayout.general")}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">

                <div>
                  <Label htmlFor="navn" className="text-xs sm:text-sm">{t('resourceDialogs.equipmentDetail.labels.name')}</Label>
                  <Input
                    id="navn"
                    value={formData.navn}
                    onChange={(e) => setFormData({ ...formData, navn: e.target.value })}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="type" className="text-xs sm:text-sm">{t('resourceDialogs.equipmentDetail.labels.type')}</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(val) => {
                      setFormData({ ...formData, type: val });
                      if (val !== "__other__") setCustomType("");
                    }}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder={t('resourceDialogs.equipmentDetail.labels.chooseType')} />
                    </SelectTrigger>
                    <SelectContent>
                      {equipmentTypes.map((et) => (
                        <SelectItem key={et} value={et}>{t(`resources.equipmentTypes.${et}`, et)}</SelectItem>
                      ))}
                      <SelectItem value="__other__">{t('resourceDialogs.equipmentDetail.labels.otherType')}</SelectItem>
                    </SelectContent>
                  </Select>
                  {formData.type === "__other__" && (
                    <Input
                      className="mt-2 text-sm"
                      placeholder={t('resourceDialogs.equipmentDetail.labels.otherTypePlaceholder')}
                      value={customType}
                      onChange={(e) => setCustomType(e.target.value)}
                      required
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label htmlFor="serienummer" className="text-xs sm:text-sm">{t('resourceDialogs.equipmentDetail.labels.serial')}</Label>
                  <Input
                    id="serienummer"
                    value={formData.serienummer}
                    onChange={(e) => setFormData({ ...formData, serienummer: e.target.value })}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="internal_serial" className="text-xs sm:text-sm">{t('resourceDialogs.equipmentDetail.labels.internalSerialLong')}</Label>
                  <Input
                    id="internal_serial"
                    value={formData.internal_serial}
                    onChange={(e) => setFormData({ ...formData, internal_serial: e.target.value })}
                    className="text-sm"
                    placeholder={t('resourceDialogs.equipmentDetail.labels.optional')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label htmlFor="vekt" className="text-xs sm:text-sm">{t('resourceDialogs.equipmentDetail.labels.weightKg')}</Label>
                  <Input
                    id="vekt"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.vekt}
                    onChange={(e) => setFormData({ ...formData, vekt: e.target.value })}
                    className="text-sm"
                  />
                </div>
              </div>


              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label htmlFor="flyvetimer" className="text-xs sm:text-sm">{t('resourceDialogs.equipmentDetail.labels.flightHours')}</Label>
                  <Input
                    id="flyvetimer"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.flyvetimer === 0 ? '' : formData.flyvetimer}
                    onChange={(e) => setFormData({ ...formData, flyvetimer: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                    className="text-sm"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="merknader" className="text-xs sm:text-sm">{t('resourceDialogs.equipmentDetail.notes')}</Label>
                <Textarea
                  id="merknader"
                  value={formData.merknader}
                  onChange={(e) => setFormData({ ...formData, merknader: e.target.value })}
                  rows={3}
                  className="text-sm"
                />
              </div>
              </div>

              {/* Right column: maintenance and admin */}
              <div className="space-y-5 rounded-xl border bg-muted/30 p-4 min-w-0">
              {/* Standard maintenance is edited from the unified maintenance section below */}


                  {equipment.id && equipment.company_id && (
                    <MaintenanceSchedulesSection
                      kind="utstyr"
                      resourceId={equipment.id}
                      companyId={equipment.company_id}
                      isBattery={isBatteryType(equipment.type)}
                      onChanged={() => onEquipmentUpdated()}
                    />
                  )}



              {isAdmin && deptVis.hasDepartments && (
                <div className="border-t border-border pt-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{t("resourceEditLayout.administration")}</p>
                  <Label className="text-sm font-medium mb-2 block">{t('resourceDialogs.equipmentDetail.visibleTo')}</Label>
                  <DepartmentChecklist
                    departments={deptVis.childDepartments}
                    selectedIds={deptVis.selectedDeptIds}
                    onToggle={deptVis.handleToggle}
                    allSelected={deptVis.allSelected}
                    onToggleAll={deptVis.handleToggleAll}
                    allLabel={t('resourceDialogs.equipmentDetail.allDepartments')}
                  />
                </div>
              )}
              </div>
              </div>
            </>
          )}
        </div>


        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          {(() => {
            const isSharedFromParent = !!equipment.company_id && !!companyId && equipment.company_id !== companyId;
            return (
              <>
                {isAdmin && !isEditing && !isSharedFromParent && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" className="gap-2">
                        <Trash2 className="w-4 h-4" />
                        {t('resourceDialogs.equipmentDetail.delete')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('resourceDialogs.equipmentDetail.deleteConfirmTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('resourceDialogs.equipmentDetail.deleteConfirmDescription', { name: equipment.navn })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('resourceDialogs.equipmentDetail.cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          {t('resourceDialogs.equipmentDetail.delete')}
                        </AlertDialogAction>

                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                <div className="flex gap-2 ml-auto">
                  {!isEditing ? (
                    <Button onClick={() => setIsEditing(true)} disabled={isSharedFromParent}>{t('resourceDialogs.equipmentDetail.edit')}</Button>
                  ) : (
                    <>
                      <Button variant="outline" onClick={() => setIsEditing(false)} disabled={isSubmitting}>
                        {t('resourceDialogs.equipmentDetail.cancel')}
                      </Button>
                      <Button onClick={handleSave} disabled={isSubmitting}>
                        {isSubmitting ? t('resourceDialogs.equipmentDetail.saving') : t('resourceDialogs.equipmentDetail.save')}
                      </Button>

                    </>
                  )}
                </div>
              </>
            );
          })()}
        </DialogFooter>

      </DialogContent>

      <EquipmentLogbookDialog
        open={showLogbook}
        onOpenChange={setShowLogbook}
        equipmentId={equipment.id}
        equipmentNavn={equipment.navn}
        flyvetimer={equipment.flyvetimer || 0}
        equipmentType={equipment.type}
        equipmentSerienummer={equipment.serienummer}
      />

      {equipment.sjekkliste_id && (
        <ChecklistExecutionDialog
          open={checklistDialogOpen}
          onOpenChange={setChecklistDialogOpen}
          checklistId={equipment.sjekkliste_id}
          itemName={`${equipment.navn} (${equipment.serienummer})`}
          onComplete={handleChecklistComplete}
        />
      )}
      <AlertDialog open={confirmMaintenanceOpen} onOpenChange={setConfirmMaintenanceOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('resourceDialogs.equipmentDetail.maintenance.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('resourceDialogs.equipmentDetail.maintenance.confirmDescription', { name: equipment.navn })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('resourceDialogs.equipmentDetail.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await performMaintenanceUpdate();
              }}
            >
              {t('resourceDialogs.equipmentDetail.maintenance.confirm')}

            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {visibilityWarning && (
        <ResourceVisibilityWarningDialog
          open={!!visibilityWarning}
          onOpenChange={(o) => { if (!o) setVisibilityWarning(null); }}
          missing={visibilityWarning.missing}
          departments={deptVis.childDepartments}
          resourceLabel={t('resourceDialogs.equipmentDetail.resourceLabel')}
          onContinue={async () => {
            await visibilityWarning.onContinue();
            setVisibilityWarning(null);
          }}
          onCancel={() => {
            visibilityWarning.onCancel();
            setVisibilityWarning(null);
          }}
        />
      )}
    </Dialog>
  );
};
