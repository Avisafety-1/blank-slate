import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Sparkles, Info, ChevronDown, Plus, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRoleCheck } from "@/hooks/useRoleCheck";
import {
  fetchBatteryTypes,
  resolveBatteryConfig,
  computeBatteryHealth,
  createBatteryType,
  updateBatteryType,
  deleteBatteryType,
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

const emptyTypeForm = {
  name: "",
  manufacturer: "",
  droneModels: "",
  designCapacity: "",
  cellCount: "",
  maxCycles: "",
  healthWarn: "80",
  healthCritical: "60",
  devWarn: "0.05",
  devCritical: "0.1",
};

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
  const { companyId } = useAuth();
  const { isAdmin } = useRoleCheck();
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

  // Inline create/edit form for company-owned battery types
  const [typeEditorMode, setTypeEditorMode] = useState<"closed" | "create" | "edit">("closed");
  const [typeForm, setTypeForm] = useState({ ...emptyTypeForm });
  const [typeSaving, setTypeSaving] = useState(false);

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
      // A locked row means the user picked explicitly — respect "no type".
      setTypeId(o.battery_type_id || (o.battery_type_locked ? NONE : suggestion?.type.id || NONE));
      setForm({
        designCapacity: o.battery_design_capacity_mah?.toString() ?? "",
        maxCycles: o.battery_max_cycles?.toString() ?? "",
        healthWarn: o.battery_health_warn_pct?.toString() ?? "",
        healthCritical: o.battery_health_critical_pct?.toString() ?? "",
        devWarn: o.battery_cell_deviation_warn_v?.toString() ?? "",
        devCritical: o.battery_cell_deviation_critical_v?.toString() ?? "",
      });
      setTypeEditorMode("closed");
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

  const globalTypes = useMemo(() => types.filter((x) => !x.company_id), [types]);
  const companyTypes = useMemo(() => types.filter((x) => !!x.company_id), [types]);
  const canEditSelected = !!selectedType?.company_id && isAdmin;

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

  const emptyForm = {
    designCapacity: "",
    maxCycles: "",
    healthWarn: "",
    healthCritical: "",
    devWarn: "",
    devCritical: "",
  };

  const hasOverrides = Object.values(form).some((v) => v.trim() !== "");
  const clearOverrides = () => setForm({ ...emptyForm });

  /** Picking a new type clears per-battery overrides so the type actually applies. */
  const handleTypeChange = (v: string) => {
    setTypeId(v);
    clearOverrides();
  };

  const openCreateType = () => {
    setTypeForm({ ...emptyTypeForm });
    setTypeEditorMode("create");
  };

  const openEditType = () => {
    if (!selectedType) return;
    setTypeForm({
      name: selectedType.name ?? "",
      manufacturer: selectedType.manufacturer ?? "",
      droneModels: (selectedType.drone_models || []).join(", "),
      designCapacity: selectedType.design_capacity_mah?.toString() ?? "",
      cellCount: selectedType.cell_count?.toString() ?? "",
      maxCycles: selectedType.max_cycles?.toString() ?? "",
      healthWarn: selectedType.health_warn_pct?.toString() ?? "80",
      healthCritical: selectedType.health_critical_pct?.toString() ?? "60",
      devWarn: selectedType.cell_deviation_warn_v?.toString() ?? "0.05",
      devCritical: selectedType.cell_deviation_critical_v?.toString() ?? "0.1",
    });
    setTypeEditorMode("edit");
  };

  const handleSaveType = async () => {
    if (!typeForm.name.trim()) {
      toast.error(t("resourceDialogs.batteryHealthSettings.typeNameRequired"));
      return;
    }
    if (typeEditorMode === "create" && !companyId) return;
    setTypeSaving(true);
    try {
      const num = (v: string) => (v.trim() === "" ? null : Number(v));
      const payload = {
        name: typeForm.name.trim(),
        manufacturer: typeForm.manufacturer.trim() || null,
        drone_models: typeForm.droneModels
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        design_capacity_mah: num(typeForm.designCapacity),
        cell_count: num(typeForm.cellCount),
        max_cycles: num(typeForm.maxCycles),
        health_warn_pct: num(typeForm.healthWarn) ?? 80,
        health_critical_pct: num(typeForm.healthCritical) ?? 60,
        cell_deviation_warn_v: num(typeForm.devWarn) ?? 0.05,
        cell_deviation_critical_v: num(typeForm.devCritical) ?? 0.1,
      };

      const saved =
        typeEditorMode === "create"
          ? await createBatteryType(companyId as string, payload)
          : await updateBatteryType(selectedType!.id, payload);

      setTypes((prev) => {
        const rest = prev.filter((x) => x.id !== saved.id);
        return [...rest, saved].sort((a, b) => a.name.localeCompare(b.name));
      });
      setTypeId(saved.id);
      clearOverrides();
      setTypeEditorMode("closed");
      toast.success(t("resourceDialogs.batteryHealthSettings.typeSaved"));
    } catch (e) {
      console.error(e);
      toast.error(t("resourceDialogs.batteryHealthSettings.typeSaveError"));
    } finally {
      setTypeSaving(false);
    }
  };

  const handleDeleteType = async () => {
    if (!selectedType?.company_id) return;
    setTypeSaving(true);
    try {
      await deleteBatteryType(selectedType.id);
      setTypes((prev) => prev.filter((x) => x.id !== selectedType.id));
      setTypeId(NONE);
      setTypeEditorMode("closed");
      toast.success(t("resourceDialogs.batteryHealthSettings.typeDeleted"));
    } catch (e) {
      console.error(e);
      toast.error(t("resourceDialogs.batteryHealthSettings.typeDeleteError"));
    } finally {
      setTypeSaving(false);
    }
  };

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
          .eq("battery_type_id", groupTypeId)
          .eq("company_id", companyId as string);
        if (error) throw error;
      }

      const { error } = await (supabase as any)
        .from("equipment")
        .update({
          ...payload,
          battery_type_id: typeId === NONE ? null : typeId,
          // Always lock: an explicit "no type" must not be overwritten by
          // the automatic drone-model matching on the next load.
          battery_type_locked: true,
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
            <div className="space-y-4 sm:space-y-5 px-2 sm:px-0">
              {/* How it is calculated */}
              <Collapsible className="rounded-lg border bg-muted/30">
                <CollapsibleTrigger className="flex w-full items-center justify-between p-3 text-sm font-medium">
                  <span className="flex items-center gap-1.5">
                    <Info className="w-4 h-4 shrink-0" />
                    {t("resourceDialogs.batteryHealthSettings.howTitle")}
                  </span>
                  <ChevronDown className="w-4 h-4 shrink-0 transition-transform data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="px-3 pb-3 space-y-2">
                  <p className="text-xs text-muted-foreground whitespace-pre-line">
                    {t("resourceDialogs.batteryHealthSettings.howBody")}
                  </p>
                  <div className="text-[11px] bg-background rounded p-2 space-y-0.5 font-mono overflow-x-auto">
                    <p>helse = kapasitet / designkapasitet × 100</p>
                    <p>sykluser: grønn {'<'} 90 % av maks · gul 90–100 % · rød ≥ maks</p>
                    <p>celleavvik: gul {'>'} varsel · rød {'>'} kritisk</p>
                    <p>samlet status = verste av helse / sykluser / celleavvik</p>
                  </div>
                  <p className="text-xs break-words">
                    {t("resourceDialogs.batteryHealthSettings.currentData", {
                      capacity: latest?.capacityMah ?? "—",
                      cycles: latest?.cycles ?? "—",
                    })}
                  </p>
                </CollapsibleContent>
              </Collapsible>

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
                <div className="flex gap-2">
                  <Select value={typeId} onValueChange={handleTypeChange}>
                    <SelectTrigger className="h-10 flex-1 min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>
                        {t("resourceDialogs.batteryHealthSettings.noType")}
                      </SelectItem>
                      {companyTypes.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>
                            {t("resourceDialogs.batteryHealthSettings.groupCompany")}
                          </SelectLabel>
                          {companyTypes.map((bt) => (
                            <SelectItem key={bt.id} value={bt.id}>
                              {bt.name}
                              {bt.design_capacity_mah ? ` · ${bt.design_capacity_mah} mAh` : ""}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {globalTypes.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>
                            {t("resourceDialogs.batteryHealthSettings.groupCatalog")}
                          </SelectLabel>
                          {globalTypes.map((bt) => (
                            <SelectItem key={bt.id} value={bt.id}>
                              {bt.name}
                              {bt.design_capacity_mah ? ` · ${bt.design_capacity_mah} mAh` : ""}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </SelectContent>
                  </Select>
                  {isAdmin && (
                    <>
                      {canEditSelected && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 shrink-0"
                          onClick={openEditType}
                          title={t("resourceDialogs.batteryHealthSettings.editType")}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-10 w-10 shrink-0"
                        onClick={openCreateType}
                        title={t("resourceDialogs.batteryHealthSettings.newType")}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
                {selectedType && typeEditorMode === "closed" && (
                  <p className="text-xs text-muted-foreground break-words">
                    {t("resourceDialogs.batteryHealthSettings.typeInfo", {
                      capacity: selectedType.design_capacity_mah ?? "—",
                      cycles: selectedType.max_cycles ?? "—",
                      models: (selectedType.drone_models || []).join(", ") || "—",
                    })}
                  </p>
                )}
                {selectedType && !selectedType.company_id && typeEditorMode === "closed" && (
                  <p className="text-xs text-muted-foreground break-words">
                    {t("resourceDialogs.batteryHealthSettings.catalogReadOnly")}
                  </p>
                )}


                {/* Inline create/edit type form */}
                {typeEditorMode !== "closed" && (
                  <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
                    <p className="text-sm font-medium">
                      {typeEditorMode === "create"
                        ? t("resourceDialogs.batteryHealthSettings.newType")
                        : t("resourceDialogs.batteryHealthSettings.editType")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("resourceDialogs.batteryHealthSettings.typeScopeHint")}
                    </p>
                    <div className="space-y-1">
                      <Label className="text-xs">
                        {t("resourceDialogs.batteryHealthSettings.typeName")}
                      </Label>
                      <Input
                        value={typeForm.name}
                        onChange={(e) => setTypeForm((f) => ({ ...f, name: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">
                          {t("resourceDialogs.batteryHealthSettings.typeManufacturer")}
                        </Label>
                        <Input
                          value={typeForm.manufacturer}
                          onChange={(e) =>
                            setTypeForm((f) => ({ ...f, manufacturer: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">
                          {t("resourceDialogs.batteryHealthSettings.typeDroneModels")}
                        </Label>
                        <Input
                          placeholder="Mavic 3T, M30T"
                          value={typeForm.droneModels}
                          onChange={(e) =>
                            setTypeForm((f) => ({ ...f, droneModels: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">
                          {t("resourceDialogs.batteryHealthSettings.designCapacity")}
                        </Label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          value={typeForm.designCapacity}
                          onChange={(e) =>
                            setTypeForm((f) => ({ ...f, designCapacity: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">
                          {t("resourceDialogs.batteryHealthSettings.typeCellCount")}
                        </Label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          value={typeForm.cellCount}
                          onChange={(e) => setTypeForm((f) => ({ ...f, cellCount: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">
                          {t("resourceDialogs.batteryHealthSettings.maxCycles")}
                        </Label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          value={typeForm.maxCycles}
                          onChange={(e) => setTypeForm((f) => ({ ...f, maxCycles: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">
                          {t("resourceDialogs.batteryHealthSettings.healthWarn")}
                        </Label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          value={typeForm.healthWarn}
                          onChange={(e) =>
                            setTypeForm((f) => ({ ...f, healthWarn: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">
                          {t("resourceDialogs.batteryHealthSettings.healthCritical")}
                        </Label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          value={typeForm.healthCritical}
                          onChange={(e) =>
                            setTypeForm((f) => ({ ...f, healthCritical: e.target.value }))
                          }
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
                          value={typeForm.devWarn}
                          onChange={(e) => setTypeForm((f) => ({ ...f, devWarn: e.target.value }))}
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
                          value={typeForm.devCritical}
                          onChange={(e) =>
                            setTypeForm((f) => ({ ...f, devCritical: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                      {typeEditorMode === "edit" && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-destructive sm:mr-auto"
                          onClick={handleDeleteType}
                          disabled={typeSaving}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          {t("actions.delete")}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setTypeEditorMode("closed")}
                        disabled={typeSaving}
                      >
                        {t("common.cancel")}
                      </Button>
                      <Button type="button" onClick={handleSaveType} disabled={typeSaving}>
                        {typeSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {t("resourceDialogs.batteryHealthSettings.saveType")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Parameters */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>{t("resourceDialogs.batteryHealthSettings.paramsLabel")}</Label>
                  {hasOverrides && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={clearOverrides}
                    >
                      {t("resourceDialogs.batteryHealthSettings.useTypeValues")}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("resourceDialogs.batteryHealthSettings.paramsHint")}
                </p>
                {hasOverrides && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {t("resourceDialogs.batteryHealthSettings.overrideActive")}
                  </p>
                )}
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
                <div className="rounded-md border bg-muted/30 p-2.5">
                  <p className="text-xs font-medium break-words">
                    {preview.value != null
                      ? t("resourceDialogs.batteryHealthSettings.previewValue", {
                          value: preview.value,
                        })
                      : t("resourceDialogs.batteryHealthSettings.previewUnknown")}
                  </p>
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
