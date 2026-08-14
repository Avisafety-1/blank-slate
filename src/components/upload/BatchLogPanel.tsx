import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Loader2, Plane, X, Save, AlertTriangle, CheckCircle, Check, ChevronsUpDown, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { toast } from "sonner";
import { isBatteryType } from "@/config/equipmentCategories";
import { cn } from "@/lib/utils";
import { findSnMatches, parseFlightDate } from "@/lib/droneLogMatching";

interface Drone { id: string; modell: string; serienummer: string; internal_serial: string | null; }
interface Personnel { id: string; full_name: string | null; email: string | null; }
interface EquipmentItem { id: string; navn: string; serienummer: string; internal_serial: string | null; type: string; }
interface MissionOption { id: string; tittel: string; tidspunkt: string; lokasjon?: string | null; status?: string | null; }


type OpType = "VLOS" | "BVLOS" | "EVLOS";

interface PendingLog {
  id: string;
  aircraft_name: string | null;
  aircraft_sn: string | null;
  flight_date: string | null;
  duration_seconds: number | null;
  max_height_m: number | null;
  total_distance_m: number | null;
  matched_drone_id: string | null;
  matched_battery_id: string | null;
  parsed_result: any;
  user_id: string | null;
  source_file_type?: string | null;
}

interface RowState {
  pendingLogId: string;
  log: PendingLog;
  parsed: any | null;
  parsing: boolean;
  parseError: string | null;
  pilotId: string;
  droneId: string;
  equipmentIds: string[];
  missionId: string;
  missionUserOverride: boolean;
  autoMatchedMissionId: string | null;
  autoMatchedDroneId: string | null;
  operationType: OpType;
  missions: MissionOption[];
  missionsLoaded: boolean;
  status: "idle" | "saving" | "saved" | "error";
  errorMessage?: string;
}


interface Props {
  pendingLogs: PendingLog[];
  drones: Drone[];
  personnel: Personnel[];
  equipmentList: EquipmentItem[];
  companyId: string;
  userId: string;
  defaultPilotId: string;
  myDroneIds?: string[];
  droneIdsByProfile?: Record<string, string[]>;
  onDeselect: (id: string) => void;
  onClose: () => void;
  onSaved: () => void;
}

const parseDate = (raw: string | null): Date | null => parseFlightDate(raw);

const downsample = <T,>(arr: T[], max: number): T[] => {
  if (arr.length <= max) return arr;
  const step = Math.ceil(arr.length / max);
  return arr.filter((_, i) => i % step === 0 || i === arr.length - 1);
};

export const BatchLogPanel = ({
  pendingLogs, drones, personnel, equipmentList,
  companyId, userId, defaultPilotId,
  myDroneIds = [], droneIdsByProfile = {},
  onDeselect, onClose, onSaved,
}: Props) => {
  const [rows, setRows] = useState<RowState[]>([]);
  const [savingAll, setSavingAll] = useState(false);
  const [allMissions, setAllMissions] = useState<MissionOption[]>([]);

  // Fetch all missions for override list (last 180d + future)
  useEffect(() => {
    if (!companyId) return;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 180);
    (async () => {
      const { data } = await supabase
        .from("missions")
        .select("id, tittel, tidspunkt, lokasjon, status")
        .eq("company_id", companyId)
        .gte("tidspunkt", cutoff.toISOString())
        .order("tidspunkt", { ascending: false })
        .limit(500);
      if (data) setAllMissions(data as any);
    })();
  }, [companyId]);


  // Initialize rows when selection changes
  useEffect(() => {
    setRows(prev => {
      const byId = new Map(prev.map(r => [r.pendingLogId, r]));
      return pendingLogs.map(log => {
        const existing = byId.get(log.id);
        if (existing) return { ...existing, log };
        const eq: string[] = [];
        if (log.matched_battery_id) eq.push(log.matched_battery_id);
        const autoDroneId = resolveDroneId(log);
        return {
          pendingLogId: log.id,
          log,
          parsed: log.parsed_result || null,
          parsing: !log.parsed_result,
          parseError: null,
          pilotId: log.user_id || defaultPilotId || "",
          droneId: autoDroneId || "",
          equipmentIds: eq,
          missionId: "",
          missionUserOverride: false,
          autoMatchedMissionId: null,
          autoMatchedDroneId: autoDroneId,
          operationType: "VLOS",
          missions: [],
          missionsLoaded: false,
          status: "idle",
        };
      });
    });
  }, [pendingLogs, defaultPilotId]);


  // Parse missing logs + fetch same-day missions
  useEffect(() => {
    rows.forEach(async (row, idx) => {
      if (!row.parsing && row.parsed) {
        if (!row.missionsLoaded) {
          const baseDate = parseFlightDate(row.parsed?.startTime) ?? parseFlightDate(row.log.flight_date);
          if (!baseDate || isNaN(baseDate.getTime())) {
            setRows(prev => prev.map(r => r.pendingLogId === row.pendingLogId ? { ...r, missionsLoaded: true } : r));
            return;
          }
          const start = new Date(baseDate); start.setHours(0,0,0,0);
          const end = new Date(baseDate); end.setHours(23,59,59,999);
          const { data } = await supabase
            .from("missions")
            .select("id, tittel, tidspunkt, lokasjon, status")
            .eq("company_id", companyId)
            .gte("tidspunkt", start.toISOString())
            .lte("tidspunkt", end.toISOString())
            .order("tidspunkt", { ascending: true })
            .limit(20);
          // Sort by closest to flight start
          const sorted = (data || []).slice().sort((a: any, b: any) => {
            const dA = Math.abs(new Date(a.tidspunkt).getTime() - baseDate.getTime());
            const dB = Math.abs(new Date(b.tidspunkt).getTime() - baseDate.getTime());
            return dA - dB;
          });
          const autoId = sorted.length > 0 ? sorted[0].id : null;
          setRows(prev => prev.map(r => {
            if (r.pendingLogId !== row.pendingLogId) return r;
            return {
              ...r,
              missions: sorted as any,
              missionsLoaded: true,
              autoMatchedMissionId: autoId,
              // Only preselect if user hasn't manually overridden
              missionId: r.missionUserOverride ? r.missionId : (autoId || ""),
            };
          }));
        }
        return;
      }

      if (row.parsed || row.parseError) return;
      try {
        const { data, error } = await supabase.functions.invoke("dji-process-single", {
          body: { pending_log_id: row.pendingLogId },
        });
        if (error) throw new Error(error.message || "Parse-feil");
        if (data?.success === false) {
          setRows(prev => prev.map(r => r.pendingLogId === row.pendingLogId
            ? { ...r, parsing: false, parseError: data.error || "Kunne ikke parse" }
            : r));
          return;
        }
        const parsed = data?.parsed_result;
        setRows(prev => prev.map(r => r.pendingLogId === row.pendingLogId
          ? {
              ...r,
              parsing: false,
              parsed,
              droneId: r.droneId || resolveDroneId({ ...r.log, parsed_result: parsed }) || data?.matched_drone_id || "",
              equipmentIds: r.equipmentIds.length
                ? r.equipmentIds
                : (data?.matched_battery_id ? [data.matched_battery_id] : []),
            }
          : r));
      } catch (e: any) {
        setRows(prev => prev.map(r => r.pendingLogId === row.pendingLogId
          ? { ...r, parsing: false, parseError: e.message || "Parse-feil" }
          : r));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map(r => `${r.pendingLogId}:${r.parsing}:${!!r.parsed}:${r.missionsLoaded}`).join(",")]);

  const updateRow = (id: string, patch: Partial<RowState>) =>
    setRows(prev => prev.map(r => r.pendingLogId === id ? { ...r, ...patch } : r));

  const buildExtended = (parsed: any) => {
    const startDate = parseDate(parsed.startTime);
    const endDate = parseDate(parsed.endTimeUtc);
    return {
      source: (parsed.source === "ardupilot" ? "ardupilot" : "dronelogapi") as any,
      dronelog_sha256: parsed.sha256Hash || null,
      start_time_utc: startDate ? startDate.toISOString() : null,
      end_time_utc: endDate ? endDate.toISOString() : null,
      total_distance_m: parsed.totalDistance || null,
      max_height_m: parsed.maxAltitude || null,
      max_horiz_speed_ms: parsed.detailsMaxSpeed || null,
      max_vert_speed_ms: parsed.maxVSpeed || null,
      drone_model: parsed.droneType || null,
      aircraft_serial: parsed.aircraftSerial || parsed.aircraftSN || null,
      battery_cycles: parsed.batteryCycles || null,
      battery_temp_min_c: parsed.batteryTempMin || null,
      battery_temp_max_c: parsed.batteryTemperature || null,
      battery_voltage_min_v: parsed.batteryMinVoltage || null,
      gps_sat_min: parsed.minGpsSatellites || null,
      gps_sat_max: parsed.maxGpsSatellites || null,
      rth_triggered: parsed.rthTriggered || false,
      battery_sn: parsed.batterySN || null,
      battery_health_pct: parsed.batteryHealth || null,
      max_distance_m: parsed.maxDistance || null,
      battery_full_capacity_mah: parsed.batteryFullCapacity || null,
      battery_cell_deviation_max_v: parsed.batteryCellDeviationMax || null,
      dronelog_warnings: (parsed.warnings && parsed.warnings.length) ? parsed.warnings : null,
    };
  };

  const adjustHours = async (table: "profiles" | "drones" | "equipment", id: string, minutes: number) => {
    if (!minutes || !id) return;
    const { data: row } = await supabase.from(table).select("flyvetimer").eq("id", id).single();
    if (row) {
      await supabase.from(table).update({
        flyvetimer: Math.max(0, ((row as any).flyvetimer || 0) + minutes / 60.0),
      }).eq("id", id);
    }
  };

  const saveRow = async (row: RowState): Promise<boolean> => {
    if (!row.parsed) {
      updateRow(row.pendingLogId, { status: "error", errorMessage: "Loggdata mangler" });
      return false;
    }
    const parsed = row.parsed;
    const durationMinutes = parsed.durationMinutes || Math.round((parsed.durationSeconds || 0) / 60);
    const positions = parsed.positions || [];
    const flightTrack = downsample(positions, 200);
    const effectiveDate = parseDate(parsed.startTime) || parseDate(row.log.flight_date) || new Date();
    const isArdu = parsed.source === "ardupilot" || row.log.source_file_type === "ardupilot";

    try {
      // SHA-256 dedup check
      let extFields: any = buildExtended(parsed);
      if (extFields.dronelog_sha256) {
        const { data: dup } = await supabase
          .from("flight_logs")
          .select("id")
          .eq("company_id", companyId)
          .eq("dronelog_sha256", extFields.dronelog_sha256)
          .limit(1)
          .maybeSingle();
        if (dup) {
          // Mark pending log approved against existing
          await supabase.from("pending_dji_logs")
            .update({ status: "approved", processed_flight_log_id: (dup as any).id })
            .eq("id", row.pendingLogId);
          updateRow(row.pendingLogId, { status: "saved", errorMessage: "Allerede importert" });
          return true;
        }
      }

      // Determine mission: existing chosen, or auto-create
      let missionId = row.missionId || null;
      let createdMission = false;
      if (!missionId) {
        const { data: m, error: mErr } = await supabase.from("missions").insert({
          company_id: companyId,
          user_id: userId,
          tittel: `${isArdu ? "ArduPilot" : "DJI"}-flylogg ${format(effectiveDate, "dd.MM.yyyy HH:mm")}`,
          lokasjon: parsed.startPosition ? `${parsed.startPosition.lat.toFixed(5)}, ${parsed.startPosition.lng.toFixed(5)}` : "Ukjent",
          tidspunkt: effectiveDate.toISOString(),
          status: "Fullført",
          risk_nivå: "Lav",
          beskrivelse: `Importert fra ${isArdu ? "ArduPilot" : "DJI"}-flylogg. Flytid: ${durationMinutes} min`,
          latitude: parsed.startPosition?.lat ?? null,
          longitude: parsed.startPosition?.lng ?? null,
        }).select("id").single();
        if (mErr) throw mErr;
        missionId = (m as any).id;
        createdMission = true;
      }

      // Link mission resources
      if (missionId) {
        if (row.droneId) {
          const { error: mdErr } = await supabase.from("mission_drones").upsert(
            { mission_id: missionId, drone_id: row.droneId },
            { onConflict: "mission_id,drone_id" }
          );
          if (mdErr) throw mdErr;
        }
        if (row.pilotId) {
          const { error: mpErr } = await supabase.from("mission_personnel").upsert(
            { mission_id: missionId, profile_id: row.pilotId },
            { onConflict: "mission_id,profile_id" }
          );
          if (mpErr) throw mpErr;
        }
        if (row.equipmentIds.length) {
          const { error: meErr } = await supabase.from("mission_equipment").upsert(
            row.equipmentIds.map(eqId => ({ mission_id: missionId!, equipment_id: eqId })),
            { onConflict: "mission_id,equipment_id" }
          );
          if (meErr) throw meErr;
        }
      }

      // Insert flight_log
      const insertPayload: any = {
        company_id: companyId,
        user_id: userId,
        drone_id: row.droneId || null,
        mission_id: missionId,
        flight_date: effectiveDate.toISOString(),
        flight_duration_minutes: durationMinutes,
        departure_location: parsed.startPosition
          ? `${parsed.startPosition.lat.toFixed(5)}, ${parsed.startPosition.lng.toFixed(5)}`
          : "Ukjent",
        landing_location: parsed.endPosition
          ? `${parsed.endPosition.lat.toFixed(5)}, ${parsed.endPosition.lng.toFixed(5)}`
          : "Ukjent",
        movements: 1,
        flight_track: { positions: flightTrack },
        notes: `Batch-import fra ${isArdu ? "ArduPilot" : "DJI"}-flylogg.`,
        operation_type: row.operationType,
        ...extFields,
      };
      // If user linked to existing mission and a SHA dup might exist later, keep SHA for dedup

      const { data: logData, error: logErr } = await supabase
        .from("flight_logs")
        .insert(insertPayload)
        .select("id")
        .single();
      if (logErr) throw logErr;
      const flightLogId = (logData as any).id as string;

      // Pilot junction + hours
      if (row.pilotId) {
        await supabase.from("flight_log_personnel").insert({
          flight_log_id: flightLogId, profile_id: row.pilotId,
        });
        await adjustHours("profiles", row.pilotId, durationMinutes);
      }

      // Equipment junctions (drone hours handled by DB trigger)
      for (const eqId of row.equipmentIds) {
        await supabase.from("flight_log_equipment").insert({
          flight_log_id: flightLogId, equipment_id: eqId,
        });
      }

      // Battery telemetry update
      const batteryEq = equipmentList.filter(e => row.equipmentIds.includes(e.id) && isBatteryType(e.type));
      for (const bat of batteryEq) {
        const upd: any = {};
        if (parsed.batteryCycles != null) upd.battery_cycles = parsed.batteryCycles;
        if (parsed.batteryHealth != null) upd.battery_health_pct = parsed.batteryHealth;
        if (parsed.batteryFullCapacity != null) upd.battery_full_capacity_mah = parsed.batteryFullCapacity;
        if (parsed.batteryCellDeviationMax != null) upd.battery_max_cell_deviation_v = parsed.batteryCellDeviationMax;
        if (Object.keys(upd).length) await supabase.from("equipment").update(upd).eq("id", bat.id);
      }

      // Mark pending approved
      await supabase.from("pending_dji_logs")
        .update({ status: "approved", processed_flight_log_id: flightLogId })
        .eq("id", row.pendingLogId);

      updateRow(row.pendingLogId, { status: "saved" });
      return true;
    } catch (e: any) {
      console.error("Batch save error:", e);
      updateRow(row.pendingLogId, { status: "error", errorMessage: e.message || "Lagring feilet" });
      return false;
    }
  };

  const canSave = useMemo(() =>
    rows.length > 0 && rows.every(r => r.parsed && !r.parsing && r.status !== "saving"),
    [rows]
  );

  const handleSaveAll = async () => {
    setSavingAll(true);
    let ok = 0;
    let fail = 0;
    for (const row of rows) {
      if (row.status === "saved") continue;
      updateRow(row.pendingLogId, { status: "saving", errorMessage: undefined });
      const r = rows.find(rr => rr.pendingLogId === row.pendingLogId)!;
      const success = await saveRow(r);
      if (success) ok++; else fail++;
    }
    setSavingAll(false);
    if (ok > 0) toast.success(`${ok} flylogg(er) lagret`);
    if (fail > 0) toast.error(`${fail} flylogg(er) feilet`);
    onSaved();
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div>
          <p className="text-sm font-semibold">Batch-logging</p>
          <p className="text-[11px] text-muted-foreground">{rows.length} flylogg(er) valgt</p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0 pr-2">
        <div className="space-y-2.5">
          {rows.map(row => {
            const date = parseDate(row.log.flight_date);
            const durMin = row.parsed
              ? (row.parsed.durationMinutes || Math.round((row.parsed.durationSeconds || 0) / 60))
              : Math.round((row.log.duration_seconds || 0) / 60);
            const droneName = row.log.aircraft_name || row.log.aircraft_sn || "Ukjent";
            return (
              <div
                key={row.pendingLogId}
                className={`rounded-lg border p-2.5 space-y-2 ${
                  row.status === "saved" ? "border-green-500/40 bg-green-500/5" :
                  row.status === "error" ? "border-destructive/40 bg-destructive/5" :
                  "border-border bg-card"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Plane className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <p className="text-xs font-medium truncate flex-1">{droneName}</p>
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">
                    {date ? format(date, "dd.MM HH:mm", { locale: nb }) : "—"}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4">
                    {durMin} min
                  </Badge>
                  {row.status === "saving" && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />}
                  {row.status === "saved" && <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                  {row.status === "error" && <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={() => onDeselect(row.pendingLogId)}
                    disabled={savingAll}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>

                {row.parsing && (
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" /> Henter loggdata…
                  </div>
                )}
                {row.parseError && (
                  <p className="text-[11px] text-destructive">{row.parseError}</p>
                )}

                {!row.parsing && !row.parseError && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-0.5">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Pilot</label>
                      <ComboPicker
                        value={row.pilotId}
                        placeholder="Velg pilot"
                        searchPlaceholder="Søk pilot…"
                        options={personnel.map(p => ({
                          id: p.id,
                          label: p.full_name || p.email || "Ukjent",
                          search: `${p.full_name || ""} ${p.email || ""}`,
                        }))}
                        onChange={(v) => updateRow(row.pendingLogId, { pilotId: v })}
                      />
                    </div>
                    <div className="space-y-0.5">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                        Drone
                        {row.autoMatchedDroneId && row.droneId === row.autoMatchedDroneId && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] text-primary normal-case">
                            <Sparkles className="w-2.5 h-2.5" /> auto-matchet
                          </span>
                        )}
                      </label>
                      <ComboPicker
                        value={row.droneId}
                        placeholder="Velg drone"
                        searchPlaceholder="Søk drone…"
                        options={drones.map(d => ({
                          id: d.id,
                          label: `${d.modell}${d.serienummer ? ` (${d.serienummer})` : ""}`,
                          search: `${d.modell} ${d.serienummer || ""} ${d.internal_serial || ""}`,
                        }))}
                        onChange={(v) => updateRow(row.pendingLogId, { droneId: v })}
                      />
                    </div>
                    <div className="space-y-0.5 col-span-2">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                        Utstyr / batteri
                        {row.log.matched_battery_id && row.equipmentIds.includes(row.log.matched_battery_id) && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] text-primary normal-case">
                            <Sparkles className="w-2.5 h-2.5" /> auto-matchet
                          </span>
                        )}
                      </label>
                      <ComboPicker
                        value=""
                        placeholder="Legg til utstyr"
                        searchPlaceholder="Søk utstyr…"
                        options={equipmentList
                          .filter(e => !row.equipmentIds.includes(e.id))
                          .map(e => ({
                            id: e.id,
                            label: `${e.navn}${e.serienummer ? ` (${e.serienummer})` : ""}`,
                            search: `${e.navn} ${e.serienummer || ""} ${e.internal_serial || ""} ${e.type}`,
                          }))}
                        onChange={(v) => {
                          if (v && !row.equipmentIds.includes(v)) {
                            updateRow(row.pendingLogId, { equipmentIds: [...row.equipmentIds, v] });
                          }
                        }}
                      />
                      {row.equipmentIds.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {row.equipmentIds.map(eqId => {
                            const eq = equipmentList.find(e => e.id === eqId);
                            const isAuto = row.log.matched_battery_id === eqId;
                            return (
                              <Badge key={eqId} variant="secondary" className="text-[10px] gap-1 pr-1">
                                {isAuto && <Sparkles className="w-2.5 h-2.5 text-primary" />}
                                {eq?.navn || eqId}
                                <button
                                  type="button"
                                  onClick={() => updateRow(row.pendingLogId, {
                                    equipmentIds: row.equipmentIds.filter(id => id !== eqId),
                                  })}
                                  className="hover:text-destructive"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </Badge>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Operasjonstype</label>
                      <Select value={row.operationType} onValueChange={(v) => updateRow(row.pendingLogId, { operationType: v as OpType })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="VLOS" className="text-xs">VLOS</SelectItem>
                          <SelectItem value="BVLOS" className="text-xs">BVLOS</SelectItem>
                          <SelectItem value="EVLOS" className="text-xs">EVLOS</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-0.5">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                        Oppdrag
                        {row.autoMatchedMissionId && row.missionId === row.autoMatchedMissionId && !row.missionUserOverride && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] text-primary normal-case">
                            <Sparkles className="w-2.5 h-2.5" /> auto-matchet
                          </span>
                        )}
                      </label>
                      <MissionPicker
                        value={row.missionId}
                        sameDayMissions={row.missions}
                        allMissions={allMissions}
                        autoMatchedId={row.autoMatchedMissionId}
                        onChange={(v) => updateRow(row.pendingLogId, { missionId: v, missionUserOverride: true })}
                      />
                    </div>

                  </div>
                )}

                {row.errorMessage && row.status === "error" && (
                  <p className="text-[11px] text-destructive">{row.errorMessage}</p>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <div className="pt-3 mt-3 border-t border-border shrink-0">
        <Button
          className="w-full"
          onClick={handleSaveAll}
          disabled={!canSave || savingAll}
        >
          {savingAll ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Lagrer…</>
          ) : (
            <><Save className="w-4 h-4 mr-2" /> Lagre alle ({rows.filter(r => r.status !== "saved").length})</>
          )}
        </Button>
      </div>
    </div>
  );
};

interface MissionPickerProps {
  value: string;
  sameDayMissions: MissionOption[];
  allMissions: MissionOption[];
  autoMatchedId: string | null;
  onChange: (value: string) => void;
}

const MissionPicker = ({ value, sameDayMissions, allMissions, autoMatchedId, onChange }: MissionPickerProps) => {
  const [open, setOpen] = useState(false);

  const sameDayIds = new Set(sameDayMissions.map(m => m.id));
  const otherMissions = allMissions.filter(m => !sameDayIds.has(m.id));

  const selected = value
    ? (sameDayMissions.find(m => m.id === value) || allMissions.find(m => m.id === value))
    : null;

  const triggerLabel = selected
    ? `${selected.tittel} · ${format(new Date(selected.tidspunkt), "dd.MM HH:mm", { locale: nb })}`
    : "Opprett nytt oppdrag";

  const renderItem = (m: MissionOption) => {
    const searchValue = `${m.tittel} ${m.lokasjon || ""} ${format(new Date(m.tidspunkt), "dd.MM.yyyy HH:mm", { locale: nb })}`;
    return (
      <CommandItem
        key={m.id}
        value={`${m.id}__${searchValue}`}
        onSelect={() => { onChange(m.id); setOpen(false); }}
        className="text-xs"
      >
        <Check className={cn("mr-2 h-3 w-3 shrink-0", value === m.id ? "opacity-100" : "opacity-0")} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 truncate">
            <span className="truncate font-medium">{m.tittel}</span>
            {autoMatchedId === m.id && (
              <Sparkles className="w-2.5 h-2.5 text-primary shrink-0" />
            )}
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            {format(new Date(m.tidspunkt), "dd.MM.yyyy HH:mm", { locale: nb })}
            {m.lokasjon ? ` · ${m.lokasjon}` : ""}
          </div>
        </div>
      </CommandItem>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-8 text-xs font-normal"
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Søk oppdrag…" className="h-9 text-xs" />
          <CommandList className="max-h-64">
            <CommandEmpty className="text-xs py-3 text-center text-muted-foreground">Ingen treff</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__new__opprett nytt oppdrag"
                onSelect={() => { onChange(""); setOpen(false); }}
                className="text-xs"
              >
                <Check className={cn("mr-2 h-3 w-3 shrink-0", value === "" ? "opacity-100" : "opacity-0")} />
                <span className="font-medium">Opprett nytt oppdrag</span>
              </CommandItem>
            </CommandGroup>
            {sameDayMissions.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Samme dag">
                  {sameDayMissions.map(renderItem)}
                </CommandGroup>
              </>
            )}
            {otherMissions.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Alle oppdrag">
                  {otherMissions.map(renderItem)}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

interface ComboOption { id: string; label: string; search: string; }
interface ComboPickerProps {
  value: string;
  options: ComboOption[];
  placeholder: string;
  searchPlaceholder: string;
  onChange: (value: string) => void;
}

const ComboPicker = ({ value, options, placeholder, searchPlaceholder, onChange }: ComboPickerProps) => {
  const [open, setOpen] = useState(false);
  const selected = value ? options.find(o => o.id === value) : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-8 text-xs font-normal"
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} className="h-9 text-xs" />
          <CommandList className="max-h-64">
            <CommandEmpty className="text-xs py-3 text-center text-muted-foreground">Ingen treff</CommandEmpty>
            <CommandGroup>
              {options.map(o => (
                <CommandItem
                  key={o.id}
                  value={`${o.id}__${o.search}`}
                  onSelect={() => { onChange(o.id); setOpen(false); }}
                  className="text-xs"
                >
                  <Check className={cn("mr-2 h-3 w-3 shrink-0", value === o.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

