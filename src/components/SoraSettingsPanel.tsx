import { SoraSettings } from "@/types/map";
import type { SoraPopulationDensityResult } from "@/lib/adjacentAreaCalculator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

import { ChevronDown, AlertTriangle, Zap, Plane } from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { pickBestDroneCatalogMatch } from "@/lib/droneCatalog";
import {
  calculateSoraBuffer,
  categoryToAircraftType,
  type ContingencyMethod,
  type DroneProfile,
  type GroundRiskBufferMethod,
  type MissionParams,
  type SoraBufferSuggestion,
} from "@/lib/soraBufferCalculator";

interface SoraSettingsPanelProps {
  settings: SoraSettings;
  onChange: (settings: SoraSettings) => void;
  onDroneSelected?: (droneId: string | null) => void;
  initialDroneId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showPopulationDensity?: boolean;
  onShowPopulationDensityChange?: (show: boolean) => void;
  populationDensityResult?: SoraPopulationDensityResult | null;
  populationDensityLoading?: boolean;
}

interface CompanyDrone {
  id: string;
  modell: string;
  serienummer: string;
  registration_number: string | null;
  vekt: number | null;
  klasse: string | null;
}

const droneLabel = (d: Pick<CompanyDrone, "modell" | "serienummer" | "registration_number">): string => {
  const id = d.registration_number?.trim() || d.serienummer?.trim();
  return id ? `${d.modell} — ${id}` : d.modell;
};

interface CatalogSpecs {
  name: string;
  weight_kg: number;
  max_wind_mps: number | null;
  max_speed_mps?: number | null;
  characteristic_dimension_m?: number | null;
  category: string | null;
  endurance_min: number | null;
  standard_takeoff_weight_kg: number | null;
}

// Help strings are now driven by t() — see useSoraHelp() inside component.

const FieldHint = ({ children }: { children: string }) => (
  <p className="text-[10px] leading-snug text-muted-foreground">{children}</p>
);

export function SoraSettingsPanel({ settings, onChange, onDroneSelected, initialDroneId, open: controlledOpen, onOpenChange, showPopulationDensity = true, onShowPopulationDensityChange, populationDensityResult, populationDensityLoading = false }: SoraSettingsPanelProps) {
  const { t } = useTranslation();
  const SORA_HELP = {
    cd: t("soraPanel.helpCd"),
    v0: t("soraPanel.helpV0"),
    tr: t("soraPanel.helpTr"),
    ham: t("soraPanel.helpHam"),
    sgnss: t("soraPanel.helpSgnss"),
    spos: t("soraPanel.helpSpos"),
    smap: t("soraPanel.helpSmap"),
    grb: t("soraPanel.helpGrb"),
    tp: t("soraPanel.helpTp"),
  };
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const { companyId } = useAuth();

  // Drone selector state
  const [drones, setDrones] = useState<CompanyDrone[]>([]);
  const [selectedDroneId, setSelectedDroneId] = useState<string>(initialDroneId ?? "");
  const initialDroneNotified = useRef(false);
  const [catalogSpecs, setCatalogSpecs] = useState<CatalogSpecs | null>(null);

  // Mission params state
  const [windOverride, setWindOverride] = useState<string>("");
  const [characteristicDimension, setCharacteristicDimension] = useState("1.0");
  const [groundSpeed, setGroundSpeed] = useState("15");
  const [reactionTime, setReactionTime] = useState("1.5");
  const [pitchBankAngle, setPitchBankAngle] = useState("30");
  const [altimetryError, setAltimetryError] = useState("1");
  const [gnssError, setGnssError] = useState("5");
  const [positionHoldError, setPositionHoldError] = useState("2");
  const [mapError, setMapError] = useState("0");
  const [contingencyMethod, setContingencyMethod] = useState<ContingencyMethod>("standard");
  const [deploymentTime, setDeploymentTime] = useState("3");
  const [grbMethod, setGrbMethod] = useState<GroundRiskBufferMethod>("1to1");
  const [glideRatio, setGlideRatio] = useState("15");
  const [descentSpeed, setDescentSpeed] = useState("3.5");

  // UI state
  const [manualOverride, setManualOverride] = useState(false);
  const [manualCdOverride, setManualCdOverride] = useState(false);
  const [manualSpeedOverride, setManualSpeedOverride] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const update = (partial: Partial<SoraSettings>) => {
    onChange({ ...settings, ...partial });
  };

  useEffect(() => {
    if (initialDroneId && initialDroneId !== selectedDroneId) setSelectedDroneId(initialDroneId);
  }, [initialDroneId, selectedDroneId]);

  useEffect(() => {
    if (settings.characteristicDimensionM != null) setCharacteristicDimension(String(settings.characteristicDimensionM));
    if (settings.groundSpeedMps != null) setGroundSpeed(String(settings.groundSpeedMps));
  }, [settings.characteristicDimensionM, settings.groundSpeedMps]);

  // Fetch company drones
  useEffect(() => {
    if (!companyId) return;
    const fetchDrones = async () => {
      const { data } = await supabase
        .from("drones")
        .select("id, modell, serienummer, registration_number, vekt, klasse")
        .eq("company_id", companyId)
        .eq("aktiv", true)
        .order("modell");
      setDrones(data ?? []);
      // Notify parent of initial drone selection after drones load
      if (initialDroneId && !initialDroneNotified.current) {
        initialDroneNotified.current = true;
        onDroneSelected?.(initialDroneId);
      }
    };
    fetchDrones();
  }, [companyId]);

  // Fetch catalog specs when drone selected
  const selectedDrone = drones.find((d) => d.id === selectedDroneId);

  useEffect(() => {
    if (!selectedDrone) {
      setCatalogSpecs(null);
      return;
    }
    const fetchSpecs = async () => {
      const { data } = await (supabase as any)
        .from("drone_models")
        .select("name, weight_kg, max_wind_mps, max_speed_mps, characteristic_dimension_m, category, endurance_min, standard_takeoff_weight_kg")
        .or(`name.ilike.%${selectedDrone.modell}%,name.ilike.%${selectedDrone.modell.replace(/^DJI\s+/i, "")}%`)
        .limit(20);
      setCatalogSpecs(pickBestDroneCatalogMatch((data ?? []) as CatalogSpecs[], selectedDrone.modell));
    };
    fetchSpecs();
  }, [selectedDrone?.modell]);

  useEffect(() => {
    if (!selectedDrone || !catalogSpecs) return;
    const catalogCd = catalogSpecs.characteristic_dimension_m;
    const catalogSpeed = catalogSpecs.max_speed_mps ?? (catalogSpecs.max_wind_mps != null ? catalogSpecs.max_wind_mps * 2 : null);

    if (catalogCd != null && !manualCdOverride) {
      setCharacteristicDimension(String(catalogCd));
    }
    if (catalogSpeed != null && !manualSpeedOverride) {
      setGroundSpeed(String(catalogSpeed));
    }
  }, [catalogSpecs, selectedDrone, manualCdOverride, manualSpeedOverride]);

  // Build drone profile
  const droneProfile: DroneProfile | null = useMemo(() => {
    if (!selectedDrone) return null;
    const mtow = catalogSpecs?.standard_takeoff_weight_kg ?? catalogSpecs?.weight_kg ?? selectedDrone.vekt ?? 0;
    return {
      aircraft_type: categoryToAircraftType(catalogSpecs?.category ?? null, selectedDrone.modell),
      mtow_kg: mtow,
      max_speed_mps: catalogSpecs?.max_speed_mps ?? undefined,
      max_wind_mps: catalogSpecs?.max_wind_mps ?? undefined,
      has_parachute_support: true,
      has_fts_support: true,
    };
  }, [selectedDrone, catalogSpecs]);

  // Calculate suggestion
  const suggestion: SoraBufferSuggestion | null = useMemo(() => {
    if (!droneProfile) return null;
    const missionParams: MissionParams = {
      planned_altitude_m_agl: settings.flightAltitude,
      operation_profile: "vlos",
      containment_level: "medium",
      parachute_enabled: contingencyMethod === "parachute",
      fts_enabled: contingencyMethod === "parachute",
      wind_override_mps: windOverride ? Number(windOverride) : undefined,
      characteristic_dimension_m: Number(characteristicDimension) || undefined,
      ground_speed_mps: Number(groundSpeed) || undefined,
      reaction_time_s: Number(reactionTime) || undefined,
      pitch_bank_angle_deg: Number(pitchBankAngle) || undefined,
      altimetry_error_m: Number(altimetryError) || undefined,
      gnss_error_m: Number(gnssError) || undefined,
      position_hold_error_m: Number(positionHoldError) || undefined,
      map_error_m: Number(mapError) || undefined,
      contingency_method: contingencyMethod,
      deployment_time_s: Number(deploymentTime) || undefined,
      ground_risk_buffer_method: grbMethod,
      glide_ratio: Number(glideRatio) || undefined,
      descent_speed_mps: Number(descentSpeed) || undefined,
    };
    return calculateSoraBuffer(droneProfile, missionParams);
  }, [droneProfile, settings.flightAltitude, windOverride, characteristicDimension, groundSpeed, reactionTime, pitchBankAngle, altimetryError, gnssError, positionHoldError, mapError, contingencyMethod, deploymentTime, grbMethod, glideRatio, descentSpeed]);

  // Auto-apply suggestion whenever it changes (unless user manually overrode)
  useEffect(() => {
    if (!suggestion || manualOverride) return;
    const cdNum = Number(characteristicDimension) || undefined;
    const gsNum = Number(groundSpeed) || undefined;
    const next = {
      droneId: selectedDroneId || undefined,
      droneName: selectedDrone ? droneLabel(selectedDrone) : undefined,
      characteristicDimensionM: cdNum,
      groundSpeedMps: gsNum,
      contingencyDistance: suggestion.suggested_contingency_buffer_m,
      contingencyHeight: suggestion.suggested_contingency_height_m,
      groundRiskDistance: suggestion.suggested_ground_risk_buffer_m,
    };
    const changed =
      settings.droneId !== next.droneId ||
      settings.droneName !== next.droneName ||
      settings.characteristicDimensionM !== next.characteristicDimensionM ||
      settings.groundSpeedMps !== next.groundSpeedMps ||
      settings.contingencyDistance !== next.contingencyDistance ||
      settings.contingencyHeight !== next.contingencyHeight ||
      settings.groundRiskDistance !== next.groundRiskDistance;
    if (changed) onChange({ ...settings, ...next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion, manualOverride, selectedDroneId]);

  const contentJsx = (
    <div className="px-3 pb-3 sm:px-4 sm:pb-4 space-y-4">

      {/* ── Buffermetode (top) ── */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{t("soraPanel.bufferMode")}</Label>
        <RadioGroup
          value={settings.bufferMode ?? "corridor"}
          onValueChange={(v) => update({ bufferMode: v as "corridor" | "convexHull" })}
          className="flex gap-4"
        >
          <div className="flex items-center gap-1.5">
            <RadioGroupItem value="corridor" id="mode-corridor" />
            <Label htmlFor="mode-corridor" className="text-xs cursor-pointer">{t("soraPanel.modeCorridor")}</Label>
          </div>
          <div className="flex items-center gap-1.5">
            <RadioGroupItem value="convexHull" id="mode-hull" />
            <Label htmlFor="mode-hull" className="text-xs cursor-pointer">{t("soraPanel.modeConvex")}</Label>
          </div>
        </RadioGroup>
      </div>

      {/* ── Drone selector ── */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground flex items-center gap-1">
          <Plane className="h-3 w-3" /> {t("soraPanel.selectDrone")}
        </Label>
        <Select value={selectedDroneId} onValueChange={(v) => { const drone = drones.find((d) => d.id === v); setSelectedDroneId(v); setManualOverride(false); setManualCdOverride(false); setManualSpeedOverride(false); update({ droneId: v || undefined, droneName: drone ? droneLabel(drone) : undefined }); onDroneSelected?.(v || null); }}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder={t("soraPanel.selectDronePlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {drones.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {droneLabel(d)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedDrone && catalogSpecs && (
          <p className="text-[11px] text-muted-foreground">
            {catalogSpecs.category ?? droneProfile?.aircraft_type} · {droneProfile?.mtow_kg} kg {t("soraPanel.mtow")}
            {catalogSpecs.characteristic_dimension_m != null && ` · CD ${catalogSpecs.characteristic_dimension_m} m`}
            {catalogSpecs.max_speed_mps != null && ` · V0 ${catalogSpecs.max_speed_mps} m/s`}
            {catalogSpecs.max_wind_mps != null && ` · ${t("soraPanel.maxWind")} ${catalogSpecs.max_wind_mps} m/s`}
          </p>
        )}
        {selectedDrone && !catalogSpecs?.characteristic_dimension_m && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            {t("soraPanel.cdMissing")}
          </p>
        )}
      </div>

      {/* ── Flyhøyde + Contingency volum høyde ── */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("soraPanel.flightAltitude")}</Label>
          <Input
            type="number"
            min={0}
            max={500}
            value={settings.flightAltitude === 0 ? "" : settings.flightAltitude}
            onChange={(e) => { update({ flightAltitude: e.target.value === "" ? 0 : Number(e.target.value) }); }}
            onBlur={(e) => { if (e.target.value === "") update({ flightAltitude: 0 }); }}
            placeholder="0"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("soraPanel.contingencyHeight")}</Label>
          <Input
            type="number"
            min={0}
            max={200}
            value={settings.contingencyHeight === 0 ? "" : settings.contingencyHeight}
            onChange={(e) => { update({ contingencyHeight: e.target.value === "" ? 0 : Number(e.target.value) }); }}
            onBlur={(e) => { if (e.target.value === "") update({ contingencyHeight: 0 }); }}
            placeholder="0"
            className="h-8 text-sm"
          />
        </div>
      </div>

      {/* ── Avanserte oppdragsparametere (collapsed) ── */}
      {selectedDrone && (
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="rounded-md border border-border bg-secondary shadow-sm">
          <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2.5 hover:bg-secondary/80 transition-colors">
            <span className="text-sm font-semibold text-secondary-foreground">{t("soraPanel.advancedParams")}</span>
            <ChevronDown className={cn("h-4 w-4 text-secondary-foreground transition-transform", advancedOpen && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-3 p-3 pt-0">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("soraPanel.cd")}</Label>
                  <FieldHint>{SORA_HELP.cd}</FieldHint>
                  <Input type="number" min={0.1} step={0.1} value={characteristicDimension} onChange={(e) => { setManualCdOverride(true); setCharacteristicDimension(e.target.value); update({ characteristicDimensionM: e.target.value === "" ? undefined : Number(e.target.value) }); }} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("soraPanel.v0")}</Label>
                  <FieldHint>{SORA_HELP.v0}</FieldHint>
                  <Input type="number" min={0} step={0.1} value={groundSpeed} onChange={(e) => { setManualSpeedOverride(true); setGroundSpeed(e.target.value); update({ groundSpeedMps: e.target.value === "" ? undefined : Number(e.target.value) }); }} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("soraPanel.reactionTime")}</Label>
                  <FieldHint>{SORA_HELP.tr}</FieldHint>
                  <Input type="number" min={0} step={0.1} value={reactionTime} onChange={(e) => setReactionTime(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("soraPanel.pitchBank")}</Label>
                  <Input type="number" min={1} max={89} step={1} value={pitchBankAngle} onChange={(e) => setPitchBankAngle(e.target.value)} className="h-8 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("soraPanel.ham")}</Label>
                  <FieldHint>{SORA_HELP.ham}</FieldHint>
                  <Input type="number" min={0} step={0.1} value={altimetryError} onChange={(e) => setAltimetryError(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("soraPanel.sgnss")}</Label>
                  <FieldHint>{SORA_HELP.sgnss}</FieldHint>
                  <Input type="number" min={0} step={0.1} value={gnssError} onChange={(e) => setGnssError(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("soraPanel.spos")}</Label>
                  <FieldHint>{SORA_HELP.spos}</FieldHint>
                  <Input type="number" min={0} step={0.1} value={positionHoldError} onChange={(e) => setPositionHoldError(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("soraPanel.smap")}</Label>
                  <FieldHint>{SORA_HELP.smap}</FieldHint>
                  <Input type="number" min={0} step={0.1} value={mapError} onChange={(e) => setMapError(e.target.value)} className="h-8 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("soraPanel.contingencyMethod")}</Label>
                  <Select value={contingencyMethod} onValueChange={(v) => setContingencyMethod(v as ContingencyMethod)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">{t("soraPanel.standard")}</SelectItem>
                      <SelectItem value="parachute">{t("soraPanel.parachute")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {contingencyMethod === "parachute" && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("soraPanel.deployment")}</Label>
                    <FieldHint>{SORA_HELP.tp}</FieldHint>
                    <Input type="number" min={0} step={0.1} value={deploymentTime} onChange={(e) => setDeploymentTime(e.target.value)} className="h-8 text-sm" />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("soraPanel.grbMethod")}</Label>
                  <FieldHint>{SORA_HELP.grb}</FieldHint>
                  <Select value={grbMethod} onValueChange={(v) => setGrbMethod(v as GroundRiskBufferMethod)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off">{t("soraPanel.off")}</SelectItem>
                      <SelectItem value="1to1">{t("soraPanel.rule1to1")}</SelectItem>
                      <SelectItem value="ballistic">{t("soraPanel.ballistic")}</SelectItem>
                      <SelectItem value="glide">{t("soraPanel.glide")}</SelectItem>
                      <SelectItem value="drift">{t("soraPanel.drift")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {grbMethod === "glide" && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("soraPanel.glideRatio")}</Label>
                    <Input type="number" min={1} step={0.5} value={glideRatio} onChange={(e) => setGlideRatio(e.target.value)} className="h-8 text-sm" />
                  </div>
                )}
                {grbMethod === "drift" && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("soraPanel.descentSpeed")}</Label>
                    <Input type="number" min={0.1} step={0.1} value={descentSpeed} onChange={(e) => setDescentSpeed(e.target.value)} className="h-8 text-sm" />
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("soraPanel.windOverride")}</Label>
                <Input
                  type="number"
                  min={0}
                  max={30}
                  placeholder={catalogSpecs?.max_wind_mps != null ? (t as any)("soraPanel.windOverridePlaceholder", { max: catalogSpecs.max_wind_mps }) : "—"}
                  value={windOverride}
                  onChange={(e) => setWindOverride(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* ── Suggestion result ── */}
      {suggestion && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs font-medium text-foreground">{t("soraPanel.soraCalc")}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-bold text-green-600 dark:text-green-400">{settings.flightGeographyDistance}m</p>
              <p className="text-[10px] text-muted-foreground">{t("soraPanel.flightGeo")}</p>
            </div>
            <div>
              <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{suggestion.suggested_contingency_buffer_m}m</p>
              <p className="text-[10px] text-muted-foreground">SCV</p>
            </div>
            <div>
              <p className="text-lg font-bold text-red-600 dark:text-red-400">{suggestion.suggested_ground_risk_buffer_m}m</p>
              <p className="text-[10px] text-muted-foreground">SGRB</p>
            </div>
          </div>

          {manualOverride && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <p className="text-[10px] text-muted-foreground italic">{t("soraPanel.manuallyOverridden")}</p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  if (!suggestion) return;
                  setManualOverride(false);
                  onChange({
                    ...settings,
                    contingencyDistance: suggestion.suggested_contingency_buffer_m,
                    contingencyHeight: suggestion.suggested_contingency_height_m,
                    groundRiskDistance: suggestion.suggested_ground_risk_buffer_m,
                  });
                }}
              >
                {t("soraPanel.resetSystem")}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Manual controls ── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">{t("soraPanel.flightGeoArea")}</Label>
          <span className="text-xs font-mono text-green-600 dark:text-green-400">{settings.flightGeographyDistance}m</span>
        </div>
        <Slider
          min={0}
          max={200}
          step={1}
          value={[settings.flightGeographyDistance]}
          onValueChange={([v]) => { update({ flightGeographyDistance: v }); }}
          className="[&_[role=slider]]:bg-green-600"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">{t("soraPanel.contingencyArea")}</Label>
          <span className="text-xs font-mono text-amber-600 dark:text-amber-400">{settings.contingencyDistance}m</span>
        </div>
        <Slider
          min={1}
          max={200}
          step={1}
          value={[settings.contingencyDistance]}
          onValueChange={([v]) => { update({ contingencyDistance: v }); setManualOverride(true); }}
          className="[&_[role=slider]]:bg-amber-500"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">{t("soraPanel.groundRiskBuffer")}</Label>
          <span className="text-xs font-mono text-red-600 dark:text-red-400">{settings.groundRiskDistance}m</span>
        </div>
        <Slider
          min={1}
          max={500}
          step={1}
          value={[settings.groundRiskDistance]}
          onValueChange={([v]) => { update({ groundRiskDistance: v }); setManualOverride(true); }}
          className="[&_[role=slider]]:bg-red-500"
        />
      </div>

      <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-green-600/40 border border-green-600/60" /> {t("soraPanel.legendFlightGeoArea")}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-green-500/40 border border-green-500/60" /> {t("soraPanel.legendFlightGeo")}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-amber-500/40 border border-amber-500/60" /> {t("soraPanel.legendContingency")}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-red-500/40 border border-red-500/60" /> {t("soraPanel.legendGroundRisk")}
        </span>
      </div>

      {(() => {
        const cells = populationDensityResult?.cells ?? [];
        const ssbCount = cells.filter((c: any) => c.source !== "eurostat").length;
        const eurostatCount = cells.length - ssbCount;
        let sourceLabel = t("soraPanel.popDensity");
        if (ssbCount > 0 && eurostatCount > 0) sourceLabel = t("soraPanel.popDensitySsbEurostat");
        else if (ssbCount > 0) sourceLabel = t("soraPanel.popDensitySsb");
        else if (eurostatCount > 0) sourceLabel = t("soraPanel.popDensityEurostat");
        return (
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-medium">{sourceLabel}</p>
              <p className="text-[11px] text-muted-foreground">
                {populationDensityLoading
                  ? t("soraPanel.popDensityLoading")
                  : populationDensityResult?.maxDensityCell
                    ? (t as any)("soraPanel.popDensityDriver", { density: populationDensityResult.maxDensityPerKm2.toLocaleString("nb-NO"), count: cells.length.toLocaleString("nb-NO") })
                    : t("soraPanel.popDensityEmpty")}
              </p>
            </div>
            <Switch checked={showPopulationDensity} onCheckedChange={onShowPopulationDensityChange} />
          </div>
        );
      })()}
    </div>
  );

  // Controlled mode: render content only (parent manages trigger)
  if (controlledOpen !== undefined) {
    return open ? contentJsx : null;
  }

  // Standalone mode with own collapsible trigger
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t border-border">
      <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 sm:px-4 hover:bg-muted/50 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{t("soraPanel.soraVolume")}</span>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={settings.enabled}
            onCheckedChange={(checked) => update({ enabled: checked })}
            onClick={(e) => e.stopPropagation()}
          />
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {contentJsx}
      </CollapsibleContent>
    </Collapsible>
  );
}
