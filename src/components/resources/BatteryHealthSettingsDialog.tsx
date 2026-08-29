import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Sparkles, Info, ChevronDown } from "lucide-react";
import {
  fetchBatteryTypes,
  resolveBatteryConfig,
  computeBatteryHealth,
  type BatteryType,
  type BatteryMatch,
  type BatteryEquipmentOverrides,
} from "@/lib/batteryHealth";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipmentId: string;
  equipmentNavn: string;
  /** Latest values from the flight logs for this battery. */
  latest?: { capacityMah?: number | null; cycles?: number | null };
  /** Auto-detected type from the drone the battery flew with. */
  suggestion?: BatteryMatch | null;
  onSaved?: () => void;
}

const NONE = "__none__";

export const BatteryHealthSettingsDialog = ({
  open,
  onOpenChange,
  equipmentId,
  equipmentNavn,
  latest,
  suggestion,
  onSaved,
}: Props) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [types, setTypes] = useState<BatteryType[]>([]);
  const [overrides, setOverrides] = useState<BatteryEquipmentOverrides>({});
  const [typeId, setTypeId] = useState<string>(NONE);
  const [scope, setScope] = useState<"single" | "group">("single");
  const [form, setForm] = useState({
    designCapacity: "",
    maxCycles: "",
    healthWarn: "",
    healthCritical: "",
    devWarn: "",
    devCritical: "",
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [list, { data }] = await Promise.all([
        fetchBatteryTypes(),
        (supabase as any)
          .from("equipment")
          .select(
            "battery_type_id, battery_type_locked, battery_design_capacity_mah, battery_max_cycles, battery_health_warn_pct, battery_health_critical_pct, battery_cell_deviation_warn_v, battery_cell_deviation_critical_v",
          )
          .eq("id", equipmentId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setTypes(list);
      const o = (data || {}) as BatteryEquipmentOverrides;
      setOverrides(o);
      setTypeId(o.battery_type_id || suggestion?.type.id || NONE);
      setForm({
        designCapacity: o.battery_design_capacity_mah?.toString() ?? "",
        maxCycles: o.battery_max_cycles?.toString() ?? "",
        healthWarn: o.battery_health_warn_pct?.toString() ?? "",
        healthCritical: o.battery_health_critical_pct?.toString() ?? "",
        devWarn: o.battery_cell_deviation_warn_v?.toString() ?? "",
        devCritical: o.battery_cell_deviation_critical_v?.toString() ?? "",
      });
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, equipmentId, suggestion?.type.id]);

  const selectedType = useMemo(
    () => types.find((x) => x.id === typeId) || null,
    [types, typeId],
  );

  const previewConfig = useMemo(() => {
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    return resolveBatteryConfig(selectedType, {
      battery_design_capacity_mah: num(form.designCapacity),
      battery_max_cycles: num(form.maxCycles),
      battery_health_warn_pct: num(form.healthWarn),
      battery_health_critical_pct: num(form.healthCritical),
      battery_cell_deviation_warn_v: num(form.devWarn),
      battery_cell_deviation_critical_v: num(form.devCritical),
    });
  }, [selectedType, form]);

  const preview = useMemo(
    () =>
      computeBatteryHealth(
        { capacityMah: latest?.capacityMah ?? null, cycles: latest?.cycles ?? null },
        previewConfig,
      ),
    [latest, previewConfig],
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const num = (v: string) => (v.trim() === "" ? null : Number(v));
      const payload: Record<string, unknown> = {
        battery_design_capacity_mah: num(form.designCapacity),
        battery_max_cycles: num(form.maxCycles),
        battery_health_warn_pct: num(form.healthWarn),
        battery_health_critical_pct: num(form.healthCritical),
        battery_cell_deviation_warn_v: num(form.devWarn),
        battery_cell_deviation_critical_v: num(form.devCritical),
      };

      if (scope === "group" && (overrides.battery_type_id || typeId !== NONE)) {
        const groupTypeId = typeId !== NONE ? typeId : overrides.battery_type_id;
        const { error } = await (supabase as any)
          .from("equipment")
          .update(payload)
          .eq("battery_type_id", groupTypeId);
        if (error) throw error;
      }

      const { error } = await (supabase as any)
        .from("equipment")
        .update({
          ...payload,
          battery_type_id: typeId === NONE ? null : typeId,
          battery_type_locked: typeId !== NONE,
        })
        .eq("id", equipmentId);
      if (error) throw error;

      toast.success(t("resourceDialogs.batteryHealthSettings.saved"));
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error(t("resourceDialogs.batteryHealthSettings.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-[100dvh] max-w-none rounded-none sm:h-auto sm:max-h-[90dvh] sm:max-w-lg sm:rounded-lg flex flex-col p-4 sm:p-6 gap-3">
        <DialogHeader>
          <DialogTitle>{t("resourceDialogs.batteryHealthSettings.title")}</DialogTitle>
          <DialogDescription className="break-words">{equipmentNavn}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0 sm:pr-3">
            <div className="space-y-4 sm:space-y-5">
              {/* How it is calculated */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Info className="w-4 h-4 shrink-0" />
                  {t("resourceDialogs.batteryHealthSettings.howTitle")}
                </p>
                <p className="text-xs text-muted-foreground whitespace-pre-line">
                  {t("resourceDialogs.batteryHealthSettings.howBody")}
                </p>
                <div className="text-[11px] bg-background rounded p-2 space-y-0.5 font-mono overflow-x-auto">
                  <p>kapasitetshelse = kapasitet / design × 100</p>
                  <p>sykluslevetid = (1 − sykluser / maks) × 100</p>
                  <p>helse = min(kapasitetshelse, sykluslevetid)</p>
                </div>
                <p className="text-xs break-words">
                  {t("resourceDialogs.batteryHealthSettings.currentData", {
                    capacity: latest?.capacityMah ?? "—",
                    cycles: latest?.cycles ?? "—",
                  })}
                </p>
                <p className="text-xs font-medium">
                  {preview.value != null
                    ? t("resourceDialogs.batteryHealthSettings.previewValue", { value: preview.value })
                    : t("resourceDialogs.batteryHealthSettings.previewUnknown")}
                </p>
              </div>

              {/* Battery type */}
              <div className="space-y-2">
                <Label>{t("resourceDialogs.batteryHealthSettings.typeLabel")}</Label>
                {suggestion && (
                  <Badge variant="secondary" className="gap-1 font-normal max-w-full whitespace-normal text-left">
                    <Sparkles className="w-3 h-3 shrink-0" />
                    <span className="break-words">
                      {t("resourceDialogs.batteryHealthSettings.suggested", {
                        name: suggestion.type.name,
                      })}
                    </span>
                  </Badge>
                )}
                <Select value={typeId} onValueChange={setTypeId}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>
                      {t("resourceDialogs.batteryHealthSettings.noType")}
                    </SelectItem>
                    {types.map((bt) => (
                      <SelectItem key={bt.id} value={bt.id}>
                        {bt.name}
                        {bt.design_capacity_mah ? ` · ${bt.design_capacity_mah} mAh` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedType && (
                  <p className="text-xs text-muted-foreground break-words">
                    {t("resourceDialogs.batteryHealthSettings.typeInfo", {
                      capacity: selectedType.design_capacity_mah ?? "—",
                      cycles: selectedType.max_cycles ?? "—",
                      models: (selectedType.drone_models || []).join(", ") || "—",
                    })}
                  </p>
                )}
              </div>

              {/* Parameters */}
              <div className="space-y-2">
                <Label>{t("resourceDialogs.batteryHealthSettings.paramsLabel")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("resourceDialogs.batteryHealthSettings.paramsHint")}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {t("resourceDialogs.batteryHealthSettings.designCapacity")}
                    </Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder={selectedType?.design_capacity_mah?.toString() ?? "—"}
                      value={form.designCapacity}
                      onChange={(e) => setForm((f) => ({ ...f, designCapacity: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {t("resourceDialogs.batteryHealthSettings.maxCycles")}
                    </Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder={selectedType?.max_cycles?.toString() ?? "—"}
                      value={form.maxCycles}
                      onChange={(e) => setForm((f) => ({ ...f, maxCycles: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {t("resourceDialogs.batteryHealthSettings.healthWarn")}
                    </Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder={selectedType?.health_warn_pct?.toString() ?? "80"}
                      value={form.healthWarn}
                      onChange={(e) => setForm((f) => ({ ...f, healthWarn: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {t("resourceDialogs.batteryHealthSettings.healthCritical")}
                    </Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder={selectedType?.health_critical_pct?.toString() ?? "60"}
                      value={form.healthCritical}
                      onChange={(e) => setForm((f) => ({ ...f, healthCritical: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {t("resourceDialogs.batteryHealthSettings.devWarn")}
                    </Label>
                    <Input
                      type="number"
                      step="0.001"
                      inputMode="decimal"
                      placeholder={selectedType?.cell_deviation_warn_v?.toString() ?? "0.05"}
                      value={form.devWarn}
                      onChange={(e) => setForm((f) => ({ ...f, devWarn: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {t("resourceDialogs.batteryHealthSettings.devCritical")}
                    </Label>
                    <Input
                      type="number"
                      step="0.001"
                      inputMode="decimal"
                      placeholder={selectedType?.cell_deviation_critical_v?.toString() ?? "0.1"}
                      value={form.devCritical}
                      onChange={(e) => setForm((f) => ({ ...f, devCritical: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Scope */}
              <div className="space-y-2">
                <Label>{t("resourceDialogs.batteryHealthSettings.scopeLabel")}</Label>
                <Select value={scope} onValueChange={(v) => setScope(v as "single" | "group")}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">
                      {t("resourceDialogs.batteryHealthSettings.scopeSingle")}
                    </SelectItem>
                    <SelectItem value="group" disabled={typeId === NONE}>
                      {t("resourceDialogs.batteryHealthSettings.scopeGroup")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </ScrollArea>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t">
          <Button
            variant="ghost"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t("common.cancel")}
          </Button>
          <Button className="w-full sm:w-auto" onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t("common.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
