import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CalendarClock, ChevronDown, ClipboardCheck, Pencil, Plus, Save, Trash2, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useChecklists } from "@/hooks/useChecklists";
import {
  MaintenanceSchedule,
  MaintenanceSchedulePreset,
  ScheduleKind,
  fetchSchedulePresets,
  fetchSchedulesForResources,
  nextDueFromInterval,
} from "@/lib/maintenanceSchedules";
import { cn } from "@/lib/utils";

interface Props {
  kind: ScheduleKind;
  /** Omit to enable draft mode (resource not created yet): edits stay local and are exposed via the draft callbacks */
  resourceId?: string;
  companyId: string;
  disabled?: boolean;
  /** View-only mode: hides add/edit/delete so the section is informational only */
  readOnly?: boolean;
  /** Show the resource's standard maintenance as the first entry (default true) */
  includeStandard?: boolean;
  /** Battery equipment: enables charge-cycle based intervals */
  isBattery?: boolean;
  onChanged?: () => void;
  /** Draft mode: controlled standard entry */
  draftStandard?: StandardEntry | null;
  onDraftStandardChange?: (entry: StandardEntry) => void;
  /** Draft mode: controlled custom schedules */
  draftSchedules?: MaintenanceSchedule[];
  onDraftSchedulesChange?: (schedules: MaintenanceSchedule[]) => void;
  /** Hide the collapsible list and only provide the dialogs (used for quick "new inspection" access) */
  hideList?: boolean;
  /** Controlled "new schedule" dialog open state (parent owns it) */
  externalNewOpen?: boolean;
  onExternalNewOpenChange?: (open: boolean) => void;
  /** Controlled "edit all maintenance" dialog open state (parent owns it): shows tabs for standard + each schedule */
  externalEditOpen?: boolean;
  onExternalEditOpenChange?: (open: boolean) => void;
}

const emptyForm = {
  navn: "",
  sjekkliste_id: "none",
  interval_days: "",
  interval_hours: "",
  interval_missions: "",
  interval_cycles: "",
  warn_days: "",
  warn_hours: "",
  warn_missions: "",
  warn_cycles: "",
  email_alerts_enabled: true,
  /** Standard maintenance only */
  start_date: "",
  last_at: "",
  next_at: "",
};

type FormState = typeof emptyForm;

/** Standard maintenance rendered with the same shape as a custom schedule. */
export interface StandardEntry {
  sjekkliste_id: string | null;
  start_date: string | null;
  last_at: string | null;
  next_at: string | null;
  interval_days: number | null;
  interval_hours: number | null;
  interval_missions: number | null;
  interval_cycles: number | null;
  warn_days: number | null;
  warn_hours: number | null;
  warn_missions: number | null;
  warn_cycles: number | null;
}

const num = (v: string) => (v.trim() === "" ? null : Number(v));
const toDateInput = (v: string | null | undefined) => (v ? new Date(v).toISOString().split("T")[0] : "");

/** Mirrors the previous inline form: next = max(startDate, lastAt) + intervalDays */
const calcStandardNext = (startDate: string, lastAt: string, intervalDays: number | null, manualNext: string) => {
  if (intervalDays && (startDate || lastAt)) {
    let base = startDate ? new Date(startDate) : new Date(lastAt);
    if (lastAt) {
      const last = new Date(lastAt);
      if (!startDate || last > base) base = last;
    }
    base.setDate(base.getDate() + intervalDays);
    return base.toISOString().split("T")[0];
  }
  return manualNext || null;
};

export const MaintenanceSchedulesSection = ({ kind, resourceId, companyId, disabled, readOnly, includeStandard = true, isBattery = false, onChanged, draftStandard, onDraftStandardChange, draftSchedules, onDraftSchedulesChange, hideList = false, externalNewOpen, onExternalNewOpenChange, externalEditOpen, onExternalEditOpenChange }: Props) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { checklists } = useChecklists();
  const isDraft = !resourceId;
  const [schedulesState, setSchedulesState] = useState<MaintenanceSchedule[]>([]);
  const [standardState, setStandardState] = useState<StandardEntry | null>(null);
  const schedules = isDraft ? (draftSchedules ?? []) : schedulesState;
  const standard = isDraft ? (includeStandard ? (draftStandard ?? null) : null) : standardState;
  const [presets, setPresets] = useState<MaintenanceSchedulePreset[]>([]);
  const [openState, setOpenState] = useState(false);
  const openControlled = externalNewOpen !== undefined;
  const open = openControlled ? !!externalNewOpen : openState;
  const setOpen = (v: boolean) => {
    if (openControlled) onExternalNewOpenChange?.(v);
    else setOpenState(v);
  };
  const [editAllState, setEditAllState] = useState(false);
  const editAllControlled = externalEditOpen !== undefined;
  const editAllOpen = editAllControlled ? !!externalEditOpen : editAllState;
  const setEditAllOpen = (v: boolean) => {
    if (editAllControlled) onExternalEditOpenChange?.(v);
    else setEditAllState(v);
  };
  const [activeTab, setActiveTab] = useState("");
  const [editing, setEditing] = useState<MaintenanceSchedule | null>(null);
  const [editingStandard, setEditingStandard] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const ownPresets = presets.filter((p) => !p.is_global);
  const catalogPresets = presets.filter((p) => p.is_global);
  const selectedPreset = presets.find((p) => p.id === selectedPresetId) || null;
  const [presetNameOpen, setPresetNameOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);


  const isDrone = kind === "droner";

  const loadStandard = async () => {
    if (!includeStandard || !resourceId) {
      setStandardState(null);
      return;
    }
    try {
      if (isDrone) {
        const { data, error } = await (supabase as any)
          .from("drones")
          .select(
            "sjekkliste_id, inspection_start_date, sist_inspeksjon, neste_inspeksjon, inspection_interval_days, inspection_interval_hours, inspection_interval_missions, varsel_dager, varsel_timer, varsel_oppdrag"
          )
          .eq("id", resourceId)
          .maybeSingle();
        if (error) throw error;
        if (!data) return setStandardState(null);
        setStandardState({
          sjekkliste_id: data.sjekkliste_id ?? null,
          start_date: data.inspection_start_date ?? null,
          last_at: data.sist_inspeksjon ?? null,
          next_at: data.neste_inspeksjon ?? null,
          interval_days: data.inspection_interval_days ?? null,
          interval_hours: data.inspection_interval_hours ?? null,
          interval_missions: data.inspection_interval_missions ?? null,
          interval_cycles: null,
          warn_days: data.varsel_dager ?? null,
          warn_hours: data.varsel_timer ?? null,
          warn_missions: data.varsel_oppdrag ?? null,
          warn_cycles: null,
        });
      } else {
        const { data, error } = await (supabase as any)
          .from("equipment")
          .select(
            "sjekkliste_id, sist_vedlikeholdt, neste_vedlikehold, vedlikeholdsintervall_dager, inspection_interval_hours, inspection_interval_missions, inspection_interval_cycles, varsel_dager, varsel_timer, varsel_oppdrag, varsel_sykluser"
          )
          .eq("id", resourceId)
          .maybeSingle();
        if (error) throw error;
        if (!data) return setStandardState(null);
        setStandardState({
          sjekkliste_id: data.sjekkliste_id ?? null,
          start_date: null,
          last_at: data.sist_vedlikeholdt ?? null,
          next_at: data.neste_vedlikehold ?? null,
          interval_days: data.vedlikeholdsintervall_dager ?? null,
          interval_hours: data.inspection_interval_hours ?? null,
          interval_missions: data.inspection_interval_missions ?? null,
          interval_cycles: data.inspection_interval_cycles ?? null,
          warn_days: data.varsel_dager ?? null,
          warn_hours: data.varsel_timer ?? null,
          warn_missions: data.varsel_oppdrag ?? null,
          warn_cycles: data.varsel_sykluser ?? null,
        });
      }
    } catch (err) {
      console.error("Failed to load standard maintenance:", err);
    }
  };

  const load = async () => {
    try {
      if (!isDraft && resourceId) {
        const map = await fetchSchedulesForResources(kind, [resourceId]);
        setSchedulesState(map[resourceId] || []);
        await loadStandard();
      }
      if (companyId) setPresets(await fetchSchedulePresets(companyId));
    } catch (err: any) {
      console.error("Failed to load maintenance schedules:", err);
    }
  };

  useEffect(() => {
    if (resourceId || companyId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId, companyId, kind]);

  const openNew = () => {
    setEditing(null);
    setEditingStandard(false);
    setForm({ ...emptyForm, start_date: toDateInput(new Date().toISOString()) });
    setOpen(true);
  };

  const fillFormSchedule = (s: MaintenanceSchedule) => {
    setEditing(s);
    setEditingStandard(false);
    setForm({
      ...emptyForm,
      navn: s.navn,
      sjekkliste_id: s.sjekkliste_id || "none",
      interval_days: s.interval_days != null ? String(s.interval_days) : "",
      interval_hours: s.interval_hours != null ? String(s.interval_hours) : "",
      interval_missions: s.interval_missions != null ? String(s.interval_missions) : "",
      interval_cycles: s.interval_cycles != null ? String(s.interval_cycles) : "",
      warn_days: s.warn_days != null ? String(s.warn_days) : "",
      warn_hours: s.warn_hours != null ? String(s.warn_hours) : "",
      warn_missions: s.warn_missions != null ? String(s.warn_missions) : "",
      warn_cycles: s.warn_cycles != null ? String(s.warn_cycles) : "",
      email_alerts_enabled: s.email_alerts_enabled,
      start_date: toDateInput(s.start_date),
      last_at: toDateInput(s.last_performed_at),
    });
  };

  const openEdit = (s: MaintenanceSchedule) => {
    fillFormSchedule(s);
    setOpen(true);
  };

  const fillFormStandard = () => {
    if (!standard) return;
    setEditing(null);
    setEditingStandard(true);
    setForm({
      ...emptyForm,
      navn: t("maintenance.schedules.standardTab"),
      sjekkliste_id: standard.sjekkliste_id || "none",
      interval_days: standard.interval_days != null ? String(standard.interval_days) : "",
      interval_hours: standard.interval_hours != null ? String(standard.interval_hours) : "",
      interval_missions: standard.interval_missions != null ? String(standard.interval_missions) : "",
      interval_cycles: standard.interval_cycles != null ? String(standard.interval_cycles) : "",
      warn_days: standard.warn_days != null ? String(standard.warn_days) : "",
      warn_hours: standard.warn_hours != null ? String(standard.warn_hours) : "",
      warn_missions: standard.warn_missions != null ? String(standard.warn_missions) : "",
      warn_cycles: standard.warn_cycles != null ? String(standard.warn_cycles) : "",
      email_alerts_enabled: true,
      start_date: toDateInput(standard.start_date),
      last_at: toDateInput(standard.last_at),
      next_at: toDateInput(standard.next_at),
    });
  };

  const openEditStandard = () => {
    fillFormStandard();
    setOpen(true);
  };

  // Edit-all mode: tabs for standard + each custom schedule; switching tabs fills the form
  const editTabIds = editAllOpen
    ? [...(standard ? ["standard"] : []), ...schedules.map((s) => s.id)]
    : [];
  useEffect(() => {
    if (!editAllOpen || editTabIds.length === 0) return;
    const id = editTabIds.includes(activeTab) ? activeTab : editTabIds[0];
    if (id !== activeTab) setActiveTab(id);
    if (id === "standard") fillFormStandard();
    else {
      const s = schedules.find((x) => x.id === id);
      if (s) fillFormSchedule(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editAllOpen, activeTab, standard, schedules]);

  const applyPreset = (presetId: string) => {
    const p = presets.find((x) => x.id === presetId);
    if (!p) return;
    setSelectedPresetId(presetId);
    setForm((prev) => ({
      ...prev,
      navn: editingStandard ? prev.navn : prev.navn || p.navn,
      interval_days: p.interval_days != null ? String(p.interval_days) : "",
      interval_hours: p.interval_hours != null ? String(p.interval_hours) : "",
      interval_missions: p.interval_missions != null ? String(p.interval_missions) : "",
      interval_cycles: isBattery && p.interval_cycles != null ? String(p.interval_cycles) : "",
      warn_days: p.warn_days != null ? String(p.warn_days) : "",
      warn_hours: p.warn_hours != null ? String(p.warn_hours) : "",
      warn_missions: p.warn_missions != null ? String(p.warn_missions) : "",
      warn_cycles: isBattery && p.warn_cycles != null ? String(p.warn_cycles) : "",
      email_alerts_enabled: p.email_alerts_enabled,
    }));
  };

  const saveStandard = async () => {
    const intervalDays = num(form.interval_days);
    const nextDate = calcStandardNext(form.start_date, form.last_at, intervalDays, form.next_at);
    const checklist = form.sjekkliste_id !== "none" ? form.sjekkliste_id : null;

    if (isDraft) {
      onDraftStandardChange?.({
        sjekkliste_id: checklist,
        start_date: form.start_date || null,
        last_at: form.last_at || null,
        next_at: nextDate,
        interval_days: intervalDays,
        interval_hours: num(form.interval_hours),
        interval_missions: num(form.interval_missions),
        interval_cycles: isBattery ? num(form.interval_cycles) : null,
        warn_days: num(form.warn_days),
        warn_hours: num(form.warn_hours),
        warn_missions: num(form.warn_missions),
        warn_cycles: isBattery ? num(form.warn_cycles) : null,
      });
      return;
    }

    const payload: Record<string, any> = isDrone
      ? {
          sjekkliste_id: checklist,
          inspection_start_date: form.start_date || null,
          sist_inspeksjon: form.last_at || null,
          neste_inspeksjon: nextDate,
          inspection_interval_days: intervalDays,
          inspection_interval_hours: num(form.interval_hours),
          inspection_interval_missions: num(form.interval_missions),
          varsel_dager: num(form.warn_days) ?? 14,
          varsel_timer: num(form.warn_hours),
          varsel_oppdrag: num(form.warn_missions),
        }
      : {
          sjekkliste_id: checklist,
          sist_vedlikeholdt: form.last_at || null,
          neste_vedlikehold: nextDate,
          vedlikeholdsintervall_dager: intervalDays,
          inspection_interval_hours: num(form.interval_hours),
          inspection_interval_missions: num(form.interval_missions),
          varsel_dager: num(form.warn_days) ?? 14,
          varsel_timer: num(form.warn_hours),
          varsel_oppdrag: num(form.warn_missions),
          ...(isBattery
            ? {
                inspection_interval_cycles: num(form.interval_cycles),
                varsel_sykluser: num(form.warn_cycles),
              }
            : {}),
        };

    const { error } = await (supabase as any)
      .from(isDrone ? "drones" : "equipment")
      .update(payload)
      .eq("id", resourceId);
    if (error) throw error;
  };

  const save = async () => {
    if (!editingStandard && !form.navn.trim()) {
      toast.error(t("maintenance.schedules.nameRequired"));
      return;
    }
    setSaving(true);
    try {
      if (editingStandard) {
        await saveStandard();
      } else if (isDraft) {
        const draft: MaintenanceSchedule = {
          id: editing?.id ?? `draft-${Date.now()}`,
          company_id: companyId,
          drone_id: kind === "droner" ? "" : null,
          equipment_id: kind === "utstyr" ? "" : null,
          navn: form.navn.trim(),
          sjekkliste_id: form.sjekkliste_id !== "none" ? form.sjekkliste_id : null,
          start_date: editing?.start_date ?? new Date().toISOString(),
          interval_days: num(form.interval_days),
          interval_hours: num(form.interval_hours),
          interval_missions: num(form.interval_missions),
          warn_days: num(form.warn_days),
          warn_hours: num(form.warn_hours),
          warn_missions: num(form.warn_missions),
          last_performed_at: editing?.last_performed_at ?? null,
          next_due_date: nextDueFromInterval(num(form.interval_days)),
          hours_at_last: editing?.hours_at_last ?? null,
          missions_at_last: editing?.missions_at_last ?? null,
          email_alerts_enabled: form.email_alerts_enabled,
          ...(isBattery
            ? { interval_cycles: num(form.interval_cycles), warn_cycles: num(form.warn_cycles), cycles_at_last: editing?.cycles_at_last ?? null }
            : {}),
        };
        onDraftSchedulesChange?.(
          editing ? schedules.map((s) => (s.id === editing.id ? draft : s)) : [...schedules, draft]
        );
      } else {
        const payload: Record<string, any> = {
          company_id: companyId,
          navn: form.navn.trim(),
          sjekkliste_id: form.sjekkliste_id !== "none" ? form.sjekkliste_id : null,
          interval_days: num(form.interval_days),
          interval_hours: num(form.interval_hours),
          interval_missions: num(form.interval_missions),
          warn_days: num(form.warn_days),
          warn_hours: num(form.warn_hours),
          warn_missions: num(form.warn_missions),
          email_alerts_enabled: form.email_alerts_enabled,
          ...(isBattery
            ? {
                interval_cycles: num(form.interval_cycles),
                warn_cycles: num(form.warn_cycles),
              }
            : {}),
        };
        if (editing) {
          const { error } = await (supabase as any)
            .from("maintenance_schedules")
            .update(payload)
            .eq("id", editing.id);
          if (error) throw error;
        } else {
          payload[kind === "droner" ? "drone_id" : "equipment_id"] = resourceId;
          payload.created_by = user?.id ?? null;
          payload.start_date = new Date().toISOString();
          payload.next_due_date = nextDueFromInterval(payload.interval_days);
          const { error } = await (supabase as any).from("maintenance_schedules").insert(payload);
          if (error) throw error;
        }
      }
      toast.success(t("maintenance.schedules.saved"));
      setOpen(false);
      if (editAllOpen) setEditAllOpen(false);
      await load();
      onChanged?.();
    } catch (err: any) {
      console.error("Failed to save maintenance schedule:", err);
      toast.error(err.message || t("maintenance.actionError"));
    } finally {
      setSaving(false);
    }
  };

  const openPresetName = () => {
    setPresetName(form.navn.trim() || t("maintenance.schedules.standardTab"));
    setPresetNameOpen(true);
  };

  const saveAsPreset = async () => {
    const navn = presetName.trim();
    if (!navn || !companyId) {
      toast.error(t("maintenance.schedules.presetNameRequired"));
      return;
    }
    if (ownPresets.some((p) => p.navn.trim().toLowerCase() === navn.toLowerCase())) {
      toast.error(t("maintenance.schedules.presetNameDuplicate"));
      return;
    }
    try {
      setSavingPreset(true);
      const { error } = await (supabase as any).from("maintenance_schedule_presets").insert({
        company_id: companyId,
        navn,
        interval_days: num(form.interval_days),
        interval_hours: num(form.interval_hours),
        interval_missions: num(form.interval_missions),
        warn_days: num(form.warn_days),
        warn_hours: num(form.warn_hours),
        warn_missions: num(form.warn_missions),
        email_alerts_enabled: form.email_alerts_enabled,
        ...(isBattery
          ? { interval_cycles: num(form.interval_cycles), warn_cycles: num(form.warn_cycles) }
          : {}),
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      toast.success(t("maintenance.schedules.presetSaved"));
      setPresetNameOpen(false);
      setPresets(await fetchSchedulePresets(companyId));
    } catch (err: any) {
      console.error("Failed to save preset:", err);
      toast.error(err.message || t("maintenance.actionError"));
    } finally {
      setSavingPreset(false);
    }
  };


  const remove = async (s: MaintenanceSchedule) => {
    if (isDraft) {
      onDraftSchedulesChange?.(schedules.filter((x) => x.id !== s.id));
      toast.success(t("maintenance.schedules.deleted"));
      return;
    }
    try {
      const { error } = await (supabase as any).from("maintenance_schedules").delete().eq("id", s.id);
      if (error) throw error;
      toast.success(t("maintenance.schedules.deleted"));
      await load();
      onChanged?.();
    } catch (err: any) {
      console.error("Failed to delete schedule:", err);
      toast.error(err.message || t("maintenance.actionError"));
    }
  };

  const checklistTitle = (id: string | null) => (id ? checklists.find((c) => c.id === id)?.tittel ?? null : null);

  const renderCard = (opts: {
    key: string;
    navn: string;
    intervalDays: number | null;
    intervalHours: number | null;
    intervalMissions: number | null;
    intervalCycles?: number | null;
    checklistId: string | null;
    nextDate: string | null;
    onEdit: () => void;
    onDelete?: () => void;
  }) => (
    <div
      key={opts.key}
      className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate">{opts.navn}</p>
        <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {opts.intervalDays ? <span>{t("maintenance.schedules.everyDays", { days: opts.intervalDays })}</span> : null}
          {opts.intervalHours ? <span>{t("maintenance.schedules.everyHours", { hours: opts.intervalHours })}</span> : null}
          {opts.intervalMissions ? <span>{t("maintenance.schedules.everyMissions", { count: opts.intervalMissions })}</span> : null}
          {opts.intervalCycles ? <span>{t("maintenance.schedules.everyCycles", { count: opts.intervalCycles })}</span> : null}
        </p>
        <p className="text-xs flex items-center gap-1.5 mt-0.5">
          <ClipboardCheck className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{checklistTitle(opts.checklistId) ?? t("maintenance.noChecklist")}</span>
        </p>
        {opts.nextDate && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
            <CalendarClock className="w-3.5 h-3.5" />
            {t("maintenance.schedules.nextDue", { date: new Date(opts.nextDate).toLocaleDateString() })}
          </p>
        )}
      </div>
      {!readOnly && (
        <div className="flex items-center justify-end sm:justify-start gap-1 shrink-0">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={opts.onEdit} disabled={disabled} aria-label={t("actions.edit")}>
            <Pencil className="w-4 h-4" />
          </Button>
          {opts.onDelete && (
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={opts.onDelete} disabled={disabled} aria-label={t("actions.delete")}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          )}
        </div>
      )}
    </div>
  );

  const hasEntries = schedules.length > 0 || !!standard;

  return (
    <>
    {!hideList && (
    <Collapsible defaultOpen className="rounded-lg border bg-background/60 p-3 group">
      <div className="flex items-center justify-between gap-2">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-foreground">
          <Wrench className="w-4 h-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-left">
            {standard ? t("maintenance.schedules.allSectionTitle") : t("maintenance.schedules.sectionTitle")}
          </span>
          <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        {!readOnly && (
          <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={openNew} disabled={disabled}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t("maintenance.schedules.add")}</span>
          </Button>
        )}
      </div>

      <CollapsibleContent className="pt-3">
      {!hasEntries ? (
        <p className="text-sm text-muted-foreground">{t("maintenance.schedules.empty")}</p>
      ) : (
        <div className="space-y-2">
          {standard &&
            renderCard({
              key: "standard",
              navn: t("maintenance.schedules.standardTab"),
              intervalDays: standard.interval_days,
              intervalHours: standard.interval_hours,
              intervalMissions: standard.interval_missions,
              intervalCycles: isBattery ? standard.interval_cycles : null,
              checklistId: standard.sjekkliste_id,
              nextDate: standard.next_at,
              onEdit: openEditStandard,
            })}
          {schedules.map((s) =>
            renderCard({
              key: s.id,
              navn: s.navn,
              intervalDays: s.interval_days,
              intervalHours: s.interval_hours,
              intervalMissions: s.interval_missions,
              intervalCycles: isBattery ? s.interval_cycles ?? null : null,
              checklistId: s.sjekkliste_id,
              nextDate: s.next_due_date,
              onEdit: () => openEdit(s),
              onDelete: () => remove(s),
            })
          )}
        </div>
      )}
      </CollapsibleContent>
    </Collapsible>
    )}

      <Dialog
        open={open || editAllOpen}
        onOpenChange={(o) => {
          if (editAllOpen) {
            setEditAllOpen(o);
            if (!o) setActiveTab("");
          } else {
            setOpen(o);
            if (!o) setSelectedPresetId("");
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editAllOpen
                ? t("maintenance.schedules.editAllTitle")
                : editingStandard
                  ? t("maintenance.schedules.editStandardTitle")
                  : editing
                    ? t("maintenance.schedules.editTitle")
                    : t("maintenance.schedules.addTitle")}
            </DialogTitle>
            <DialogDescription>
              {editAllOpen
                ? t("maintenance.schedules.editAllDescription")
                : editingStandard
                  ? t("maintenance.schedules.standardDialogDescription")
                  : t("maintenance.schedules.dialogDescription")}
            </DialogDescription>
          </DialogHeader>

          {editAllOpen && editTabIds.length > 1 && (
            <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted p-1">
              {editTabIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    id === activeTab
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted/60 text-muted-foreground hover:bg-background hover:text-foreground"
                  )}
                >
                  {id === "standard"
                    ? t("maintenance.schedules.standardTab")
                    : schedules.find((s) => s.id === id)?.navn ?? id}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-3">
            {presets.length > 0 && (
              <div className="space-y-1">
                <Label>{t("maintenance.schedules.usePreset")}</Label>
                <Select value={selectedPresetId} onValueChange={applyPreset}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("maintenance.schedules.usePresetPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {ownPresets.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>{t("maintenance.schedules.ownPresets")}</SelectLabel>
                        {ownPresets.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.navn}</SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {catalogPresets.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>{t("maintenance.schedules.catalogPresets")}</SelectLabel>
                        {catalogPresets.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.navn}</SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
                {selectedPreset?.is_global && (
                  <div className="rounded-md border border-border/60 bg-muted/40 p-2 text-xs text-muted-foreground space-y-1">
                    {selectedPreset.modellfamilie && (
                      <p className="font-medium text-foreground">{selectedPreset.modellfamilie}</p>
                    )}
                    {selectedPreset.merknad && <p>{selectedPreset.merknad}</p>}
                    {selectedPreset.kilde_url && (
                      <a
                        href={selectedPreset.kilde_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline underline-offset-2"
                      >
                        {t("maintenance.schedules.presetSource")}
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="schedule-name">{t("maintenance.schedules.nameLabel")}</Label>
              <Input
                id="schedule-name"
                value={form.navn}
                onChange={(e) => setForm({ ...form, navn: e.target.value })}
                placeholder={t("maintenance.schedules.namePlaceholder")}
                readOnly={editingStandard}
                className={editingStandard ? "bg-muted/60 cursor-not-allowed" : undefined}
              />
            </div>

            <div className="space-y-1">
              <Label>{t("maintenance.schedules.checklistLabel")}</Label>
              <Select value={form.sjekkliste_id} onValueChange={(v) => setForm({ ...form, sjekkliste_id: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("maintenance.noChecklist")}</SelectItem>
                  {checklists.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.tittel}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {editingStandard && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {isDrone && (
                  <div className="space-y-1">
                    <Label className="text-xs">{t("maintenance.schedules.startDate")}</Label>
                    <Input
                      type="date"
                      value={form.start_date}
                      onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">{t("maintenance.schedules.lastPerformed")}</Label>
                  <Input
                    type="date"
                    value={form.last_at}
                    onChange={(e) => setForm({ ...form, last_at: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("maintenance.schedules.nextDueLabel")}</Label>
                  <Input
                    type="date"
                    value={
                      calcStandardNext(form.start_date, form.last_at, num(form.interval_days), form.next_at) || ""
                    }
                    onChange={(e) => setForm({ ...form, next_at: e.target.value })}
                    disabled={!!num(form.interval_days)}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("maintenance.schedules.intervalDays")}</Label>
                <Input type="number" min="0" value={form.interval_days} onChange={(e) => setForm({ ...form, interval_days: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("maintenance.schedules.intervalHours")}</Label>
                <Input type="number" min="0" step="0.1" value={form.interval_hours} onChange={(e) => setForm({ ...form, interval_hours: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("maintenance.schedules.intervalMissions")}</Label>
                <Input type="number" min="0" value={form.interval_missions} onChange={(e) => setForm({ ...form, interval_missions: e.target.value })} />
              </div>
              {isBattery && (
                <div className="space-y-1">
                  <Label className="text-xs">{t("maintenance.schedules.intervalCycles")}</Label>
                  <Input type="number" min="0" value={form.interval_cycles} onChange={(e) => setForm({ ...form, interval_cycles: e.target.value })} />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("maintenance.schedules.warnDays")}</Label>
                <Input type="number" min="0" value={form.warn_days} onChange={(e) => setForm({ ...form, warn_days: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("maintenance.schedules.warnHours")}</Label>
                <Input type="number" min="0" step="0.1" value={form.warn_hours} onChange={(e) => setForm({ ...form, warn_hours: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("maintenance.schedules.warnMissions")}</Label>
                <Input type="number" min="0" value={form.warn_missions} onChange={(e) => setForm({ ...form, warn_missions: e.target.value })} />
              </div>
              {isBattery && (
                <div className="space-y-1">
                  <Label className="text-xs">{t("maintenance.schedules.warnCycles")}</Label>
                  <Input type="number" min="0" value={form.warn_cycles} onChange={(e) => setForm({ ...form, warn_cycles: e.target.value })} />
                </div>
              )}
            </div>

            {isBattery && (
              <p className="text-xs text-muted-foreground">{t("maintenance.schedules.cyclesHint")}</p>
            )}

            {!editingStandard && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                <div>
                  <Label htmlFor="schedule-email">{t("maintenance.schedules.emailAlerts")}</Label>
                  <p className="text-xs text-muted-foreground">{t("maintenance.schedules.emailAlertsHelp")}</p>
                </div>
                <Switch
                  id="schedule-email"
                  checked={form.email_alerts_enabled}
                  onCheckedChange={(v) => setForm({ ...form, email_alerts_enabled: v })}
                />
              </div>
            )}

            <p className="text-xs text-muted-foreground">{t("maintenance.schedules.statusTriggerHint")}</p>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
            <Button variant="ghost" className="gap-1.5 w-full sm:w-auto" onClick={openPresetName} disabled={saving}>
              <Save className="w-4 h-4" />
              {t("maintenance.schedules.saveAsPreset")}
            </Button>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => (editAllOpen ? setEditAllOpen(false) : setOpen(false))} disabled={saving}>
                {t("actions.cancel")}
              </Button>
              <Button className="flex-1 sm:flex-none" onClick={save} disabled={saving}>
                {t("actions.save")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={presetNameOpen} onOpenChange={setPresetNameOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("maintenance.schedules.presetNameTitle")}</DialogTitle>
            <DialogDescription>{t("maintenance.schedules.presetNameDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="preset-name">{t("maintenance.schedules.presetNameLabel")}</Label>
            <Input
              id="preset-name"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder={t("maintenance.schedules.presetNamePlaceholder")}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPresetNameOpen(false)} disabled={savingPreset}>
              {t("actions.cancel")}
            </Button>
            <Button onClick={saveAsPreset} disabled={savingPreset || !presetName.trim()}>
              {t("actions.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
};
