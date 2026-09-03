import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CalendarClock, ChevronDown, ClipboardCheck, Pencil, Plus, Save, Trash2, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

interface Props {
  kind: ScheduleKind;
  resourceId: string;
  companyId: string;
  disabled?: boolean;
  onChanged?: () => void;
}

const emptyForm = {
  navn: "",
  sjekkliste_id: "none",
  interval_days: "",
  interval_hours: "",
  interval_missions: "",
  warn_days: "",
  warn_hours: "",
  warn_missions: "",
  email_alerts_enabled: true,
};

type FormState = typeof emptyForm;

const num = (v: string) => (v.trim() === "" ? null : Number(v));

export const MaintenanceSchedulesSection = ({ kind, resourceId, companyId, disabled, onChanged }: Props) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { checklists } = useChecklists();
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [presets, setPresets] = useState<MaintenanceSchedulePreset[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenanceSchedule | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const map = await fetchSchedulesForResources(kind, [resourceId]);
      setSchedules(map[resourceId] || []);
      if (companyId) setPresets(await fetchSchedulePresets(companyId));
    } catch (err: any) {
      console.error("Failed to load maintenance schedules:", err);
    }
  };

  useEffect(() => {
    if (resourceId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId, companyId, kind]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (s: MaintenanceSchedule) => {
    setEditing(s);
    setForm({
      navn: s.navn,
      sjekkliste_id: s.sjekkliste_id || "none",
      interval_days: s.interval_days != null ? String(s.interval_days) : "",
      interval_hours: s.interval_hours != null ? String(s.interval_hours) : "",
      interval_missions: s.interval_missions != null ? String(s.interval_missions) : "",
      warn_days: s.warn_days != null ? String(s.warn_days) : "",
      warn_hours: s.warn_hours != null ? String(s.warn_hours) : "",
      warn_missions: s.warn_missions != null ? String(s.warn_missions) : "",
      email_alerts_enabled: s.email_alerts_enabled,
    });
    setOpen(true);
  };

  const applyPreset = (presetId: string) => {
    const p = presets.find((x) => x.id === presetId);
    if (!p) return;
    setForm((prev) => ({
      ...prev,
      navn: prev.navn || p.navn,
      interval_days: p.interval_days != null ? String(p.interval_days) : "",
      interval_hours: p.interval_hours != null ? String(p.interval_hours) : "",
      interval_missions: p.interval_missions != null ? String(p.interval_missions) : "",
      warn_days: p.warn_days != null ? String(p.warn_days) : "",
      warn_hours: p.warn_hours != null ? String(p.warn_hours) : "",
      warn_missions: p.warn_missions != null ? String(p.warn_missions) : "",
      email_alerts_enabled: p.email_alerts_enabled,
    }));
  };

  const save = async () => {
    if (!form.navn.trim()) {
      toast.error(t("maintenance.schedules.nameRequired"));
      return;
    }
    setSaving(true);
    try {
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
      toast.success(t("maintenance.schedules.saved"));
      setOpen(false);
      await load();
      onChanged?.();
    } catch (err: any) {
      console.error("Failed to save maintenance schedule:", err);
      toast.error(err.message || t("maintenance.actionError"));
    } finally {
      setSaving(false);
    }
  };

  const saveAsPreset = async () => {
    if (!form.navn.trim() || !companyId) {
      toast.error(t("maintenance.schedules.nameRequired"));
      return;
    }
    try {
      const { error } = await (supabase as any).from("maintenance_schedule_presets").insert({
        company_id: companyId,
        navn: form.navn.trim(),
        interval_days: num(form.interval_days),
        interval_hours: num(form.interval_hours),
        interval_missions: num(form.interval_missions),
        warn_days: num(form.warn_days),
        warn_hours: num(form.warn_hours),
        warn_missions: num(form.warn_missions),
        email_alerts_enabled: form.email_alerts_enabled,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      toast.success(t("maintenance.schedules.presetSaved"));
      setPresets(await fetchSchedulePresets(companyId));
    } catch (err: any) {
      console.error("Failed to save preset:", err);
      toast.error(err.message || t("maintenance.actionError"));
    }
  };

  const remove = async (s: MaintenanceSchedule) => {
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

  return (
    <Collapsible defaultOpen className="rounded-lg border bg-background/60 p-3 group">
      <div className="flex items-center justify-between gap-2">
        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Wrench className="w-4 h-4 text-primary" />
          {t("maintenance.schedules.sectionTitle")}
          <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={openNew} disabled={disabled}>
          <Plus className="w-4 h-4" />
          {t("maintenance.schedules.add")}
        </Button>
      </div>

      <CollapsibleContent className="pt-3">
      {schedules.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("maintenance.schedules.empty")}</p>
      ) : (
        <div className="space-y-2">
          {schedules.map((s) => (
            <div key={s.id} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{s.navn}</p>
                <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  {s.interval_days ? <span>{t("maintenance.schedules.everyDays", { days: s.interval_days })}</span> : null}
                  {s.interval_hours ? <span>{t("maintenance.schedules.everyHours", { hours: s.interval_hours })}</span> : null}
                  {s.interval_missions ? <span>{t("maintenance.schedules.everyMissions", { count: s.interval_missions })}</span> : null}
                </p>
                <p className="text-xs flex items-center gap-1.5 mt-0.5">
                  <ClipboardCheck className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{checklistTitle(s.sjekkliste_id) ?? t("maintenance.noChecklist")}</span>
                </p>
                {s.next_due_date && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <CalendarClock className="w-3.5 h-3.5" />
                    {t("maintenance.schedules.nextDue", { date: new Date(s.next_due_date).toLocaleDateString() })}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="icon" variant="ghost" onClick={() => openEdit(s)} disabled={disabled} aria-label={t("actions.edit")}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => remove(s)} disabled={disabled} aria-label={t("actions.delete")}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      </CollapsibleContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? t("maintenance.schedules.editTitle") : t("maintenance.schedules.addTitle")}
            </DialogTitle>
            <DialogDescription>{t("maintenance.schedules.dialogDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {presets.length > 0 && (
              <div className="space-y-1">
                <Label>{t("maintenance.schedules.usePreset")}</Label>
                <Select onValueChange={applyPreset}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("maintenance.schedules.usePresetPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {presets.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.navn}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="schedule-name">{t("maintenance.schedules.nameLabel")}</Label>
              <Input
                id="schedule-name"
                value={form.navn}
                onChange={(e) => setForm({ ...form, navn: e.target.value })}
                placeholder={t("maintenance.schedules.namePlaceholder")}
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

            <div className="grid grid-cols-3 gap-2">
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
            </div>

            <div className="grid grid-cols-3 gap-2">
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
            </div>

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
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" className="gap-1.5" onClick={saveAsPreset} disabled={saving}>
              <Save className="w-4 h-4" />
              {t("maintenance.schedules.saveAsPreset")}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                {t("actions.cancel")}
              </Button>
              <Button onClick={save} disabled={saving}>
                {t("actions.save")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Collapsible>
  );
};
