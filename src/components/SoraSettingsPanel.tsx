import { SoraSettings } from "@/types/map";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronDown, AlertTriangle, Zap, Plane } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  calculateSoraBuffer,
  categoryToAircraftType,
  type DroneProfile,
  type MissionParams,
  type SoraBufferSuggestion,
} from "@/lib/soraBufferCalculator";

interface SoraSettingsPanelProps {
  settings: SoraSettings;
  onChange: (settings: SoraSettings) => void;
}

interface CompanyDrone {
  id: string;
  modell: string;
  serienummer: string;
  vekt: number | null;
  klasse: string | null;
}

interface CatalogSpecs {
  weight_kg: number;
  max_wind_mps: number | null;
  max_speed_mps?: number | null;
  category: string | null;
  endurance_min: number | null;
  standard_takeoff_weight_kg: number | null;
}

export function SoraSettingsPanel({ settings, onChange }: SoraSettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const { companyId } = useAuth();

  // Drone selector state
  const [drones, setDrones] = useState<CompanyDrone[]>([]);
  const [selectedDroneId, setSelectedDroneId] = useState<string>("");
  const [catalogSpecs, setCatalogSpecs] = useState<CatalogSpecs | null>(null);

  // Mission params state
  const [operationProfile, setOperationProfile] = useState<"vlos" | "bvlos">("vlos");
  const [containmentLevel, setContainmentLevel] = useState<"low" | "medium" | "high">("medium");
  const [parachuteEnabled, setParachuteEnabled] = useState(false);
  const [ftsEnabled, setFtsEnabled] = useState(false);
  const [windOverride, setWindOverride] = useState<string>("");

  // UI state
  const [manualOverride, setManualOverride] = useState(false);

  const update = (partial: Partial<SoraSettings>) => {
    onChange({ ...settings, ...partial });
  };

  // Fetch company drones
  useEffect(() => {
    if (!companyId) return;
    const fetchDrones = async () => {
      const { data } = await supabase
        .from("drones")
        .select("id, modell, serienummer, vekt, klasse")
        .eq("company_id", companyId)
        .eq("aktiv", true)
        .order("modell");
      setDrones(data ?? []);
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
      const { data } = await supabase
        .from("drone_models")
        .select("weight_kg, max_wind_mps, category, endurance_min, standard_takeoff_weight_kg")
        .ilike("name", selectedDrone.modell)
        .maybeSingle();
      setCatalogSpecs(data as CatalogSpecs | null);
    };
    fetchSpecs();
  }, [selectedDrone?.modell]);

  // Build drone profile
  const droneProfile: DroneProfile | null = useMemo(() => {
    if (!selectedDrone) return null;
    const mtow = catalogSpecs?.standard_takeoff_weight_kg ?? catalogSpecs?.weight_kg ?? selectedDrone.vekt ?? 0;
    return {
      aircraft_type: categoryToAircraftType(catalogSpecs?.category ?? null, selectedDrone.modell),
      mtow_kg: mtow,
      max_speed_mps: undefined,
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
      operation_profile: operationProfile,
      containment_level: containmentLevel,
      parachute_enabled: parachuteEnabled,
      fts_enabled: ftsEnabled,
      wind_override_mps: windOverride ? Number(windOverride) : undefined,
    };
    return calculateSoraBuffer(droneProfile, missionParams);
  }, [droneProfile, settings.flightAltitude, operationProfile, containmentLevel, parachuteEnabled, ftsEnabled, windOverride]);

  const applySuggestion = () => {
    if (!suggestion) return;
    setManualOverride(false);
    onChange({
      ...settings,
      flightGeographyDistance: suggestion.suggested_flight_geography_m,
      contingencyDistance: suggestion.suggested_contingency_buffer_m,
      groundRiskDistance: suggestion.suggested_ground_risk_buffer_m,
    });
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t border-border">
      <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 sm:px-4 hover:bg-muted/50 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">SORA Operasjonelt volum</span>
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
        <div className="px-3 pb-3 sm:px-4 sm:pb-4 space-y-4">

          {/* ── Drone selector ── */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Plane className="h-3 w-3" /> Velg drone
            </Label>
            <Select value={selectedDroneId} onValueChange={(v) => { setSelectedDroneId(v); setManualOverride(false); }}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Velg drone fra flåten" />
              </SelectTrigger>
              <SelectContent>
                {drones.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.modell} — {d.serienummer}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedDrone && catalogSpecs && (
              <p className="text-[11px] text-muted-foreground">
                {catalogSpecs.category ?? droneProfile?.aircraft_type} · {droneProfile?.mtow_kg} kg MTOW
                {catalogSpecs.max_wind_mps != null && ` · Maks vind ${catalogSpecs.max_wind_mps} m/s`}
              </p>
            )}
          </div>

          {/* ── Mission params (always show altitude, rest when drone selected) ── */}
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <p className="text-xs font-medium text-foreground">Oppdragsparametere</p>

            {/* Flight altitude */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Flyhøyde (m AGL)</Label>
              <Input
                type="number"
                min={0}
                max={500}
                value={settings.flightAltitude === 0 ? "" : settings.flightAltitude}
                onChange={(e) => { update({ flightAltitude: e.target.value === "" ? 0 : Number(e.target.value) }); setManualOverride(true); }}
                onBlur={(e) => { if (e.target.value === "") update({ flightAltitude: 0 }); }}
                placeholder="0"
                className="h-8 text-sm"
              />
            </div>

          {selectedDrone && (
            <>

              {/* Operation profile */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Operasjonsprofil</Label>
                <RadioGroup value={operationProfile} onValueChange={(v) => setOperationProfile(v as "vlos" | "bvlos")} className="flex gap-4">
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="vlos" id="op-vlos" />
                    <Label htmlFor="op-vlos" className="text-xs cursor-pointer">VLOS</Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="bvlos" id="op-bvlos" />
                    <Label htmlFor="op-bvlos" className="text-xs cursor-pointer">BVLOS</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Containment level */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Containment-nivå</Label>
                <RadioGroup value={containmentLevel} onValueChange={(v) => setContainmentLevel(v as "low" | "medium" | "high")} className="flex gap-4">
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="low" id="cl-low" />
                    <Label htmlFor="cl-low" className="text-xs cursor-pointer">Lav</Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="medium" id="cl-med" />
                    <Label htmlFor="cl-med" className="text-xs cursor-pointer">Middels</Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="high" id="cl-high" />
                    <Label htmlFor="cl-high" className="text-xs cursor-pointer">Høy</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Mitigations */}
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <Switch checked={parachuteEnabled} onCheckedChange={setParachuteEnabled} className="scale-90" />
                  <Label className="text-xs text-muted-foreground">Fallskjerm</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={ftsEnabled} onCheckedChange={setFtsEnabled} className="scale-90" />
                  <Label className="text-xs text-muted-foreground">FTS</Label>
                </div>
              </div>

              {/* Wind override */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Vind-overstyring (m/s, valgfritt)</Label>
                <Input
                  type="number"
                  min={0}
                  max={30}
                  placeholder={catalogSpecs?.max_wind_mps != null ? `Drone maks: ${catalogSpecs.max_wind_mps}` : "—"}
                  value={windOverride}
                  onChange={(e) => setWindOverride(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </>
          )}
          </div>

          {/* ── Suggestion result ── */}
          {suggestion && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-primary" />
                <p className="text-xs font-medium text-foreground">Foreslått SORA-buffer</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">{suggestion.suggested_flight_geography_m}m</p>
                  <p className="text-[10px] text-muted-foreground">Flight geo</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{suggestion.suggested_contingency_buffer_m}m</p>
                  <p className="text-[10px] text-muted-foreground">Contingency</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-red-600 dark:text-red-400">{suggestion.suggested_ground_risk_buffer_m}m</p>
                  <p className="text-[10px] text-muted-foreground">Ground risk</p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">{suggestion.calculation_summary}</p>

              {suggestion.warnings.length > 0 && (
                <div className="space-y-1">
                  {suggestion.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              <Button size="sm" className="w-full h-7 text-xs" onClick={applySuggestion}>
                Bruk foreslått buffer
              </Button>

              {manualOverride && (
                <p className="text-[10px] text-muted-foreground text-center italic">Manuelt overstyrt</p>
              )}
            </div>
          )}

          {/* ── Existing manual controls ── */}

          {/* Flight Geography Area */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Flight Geography Area (m)</Label>
              <span className="text-xs font-mono text-green-600 dark:text-green-400">{settings.flightGeographyDistance}m</span>
            </div>
            <Slider
              min={0}
              max={200}
              step={1}
              value={[settings.flightGeographyDistance]}
              onValueChange={([v]) => { update({ flightGeographyDistance: v }); setManualOverride(true); }}
              className="[&_[role=slider]]:bg-green-600"
            />
          </div>

          {/* Buffer mode */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Buffermetode</Label>
            <RadioGroup
              value={settings.bufferMode ?? "corridor"}
              onValueChange={(v) => update({ bufferMode: v as "corridor" | "convexHull" })}
              className="flex gap-4"
            >
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="corridor" id="mode-corridor" />
                <Label htmlFor="mode-corridor" className="text-xs cursor-pointer">Rute-korridor</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="convexHull" id="mode-hull" />
                <Label htmlFor="mode-hull" className="text-xs cursor-pointer">Konveks område</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Contingency area */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Contingency area (m)</Label>
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

          {/* Contingency volume height */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Contingency volume høyde (m over flyhøyde)</Label>
            <Input
              type="number"
              min={0}
              max={200}
              value={settings.contingencyHeight}
              onChange={(e) => update({ contingencyHeight: Number(e.target.value) || 0 })}
              className="h-8 text-sm"
            />
          </div>

          {/* Ground risk buffer */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Ground risk buffer (m)</Label>
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

          {/* Legend */}
          <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-green-600/40 border border-green-600/60" /> Flight geography area
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-green-500/40 border border-green-500/60" /> Flight geography
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-amber-500/40 border border-amber-500/60" /> Contingency
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-red-500/40 border border-red-500/60" /> Ground risk
            </span>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
