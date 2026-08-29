import { supabase } from "@/integrations/supabase/client";

export interface BatteryType {
  id: string;
  company_id: string | null;
  name: string;
  manufacturer: string | null;
  drone_models: string[];
  design_capacity_mah: number | null;
  cell_count: number | null;
  nominal_voltage_v: number | null;
  max_cycles: number | null;
  health_warn_pct: number;
  health_critical_pct: number;
  cell_deviation_warn_v: number;
  cell_deviation_critical_v: number;
  max_temp_c: number | null;
  capacity_min_mah: number | null;
  capacity_max_mah: number | null;
  voltage_min_v: number | null;
  voltage_max_v: number | null;
}

/** Per-equipment overrides stored on the equipment row. */
export interface BatteryEquipmentOverrides {
  battery_type_id?: string | null;
  battery_type_locked?: boolean | null;
  battery_design_capacity_mah?: number | null;
  battery_max_cycles?: number | null;
  battery_health_warn_pct?: number | null;
  battery_health_critical_pct?: number | null;
  battery_cell_deviation_warn_v?: number | null;
  battery_cell_deviation_critical_v?: number | null;
}

export interface BatteryHealthConfig {
  designCapacityMah: number | null;
  maxCycles: number | null;
  healthWarnPct: number;
  healthCriticalPct: number;
  cellDeviationWarnV: number;
  cellDeviationCriticalV: number;
  typeName: string | null;
}

export const DEFAULT_BATTERY_CONFIG: BatteryHealthConfig = {
  designCapacityMah: null,
  maxCycles: null,
  healthWarnPct: 80,
  healthCriticalPct: 60,
  cellDeviationWarnV: 0.05,
  cellDeviationCriticalV: 0.1,
  typeName: null,
};

/** Merges catalog values with per-equipment overrides. */
export function resolveBatteryConfig(
  type: BatteryType | null | undefined,
  overrides?: BatteryEquipmentOverrides | null,
): BatteryHealthConfig {
  const num = (v: unknown): number | null =>
    v === null || v === undefined || v === "" ? null : Number(v);

  return {
    designCapacityMah:
      num(overrides?.battery_design_capacity_mah) ?? num(type?.design_capacity_mah) ?? null,
    maxCycles: num(overrides?.battery_max_cycles) ?? num(type?.max_cycles) ?? null,
    healthWarnPct:
      num(overrides?.battery_health_warn_pct) ??
      num(type?.health_warn_pct) ??
      DEFAULT_BATTERY_CONFIG.healthWarnPct,
    healthCriticalPct:
      num(overrides?.battery_health_critical_pct) ??
      num(type?.health_critical_pct) ??
      DEFAULT_BATTERY_CONFIG.healthCriticalPct,
    cellDeviationWarnV:
      num(overrides?.battery_cell_deviation_warn_v) ??
      num(type?.cell_deviation_warn_v) ??
      DEFAULT_BATTERY_CONFIG.cellDeviationWarnV,
    cellDeviationCriticalV:
      num(overrides?.battery_cell_deviation_critical_v) ??
      num(type?.cell_deviation_critical_v) ??
      DEFAULT_BATTERY_CONFIG.cellDeviationCriticalV,
    typeName: type?.name ?? null,
  };
}

export interface BatteryHealthInput {
  capacityMah?: number | null;
  cycles?: number | null;
  djiHealthPct?: number | null;
}

export type BatteryHealthSource = "capacity" | "cycles" | "capacity+cycles" | "dji" | "none";

export interface BatteryHealthResult {
  /** 0-100, or null when it cannot be computed. */
  value: number | null;
  source: BatteryHealthSource;
  capacityHealth: number | null;
  cycleHealth: number | null;
  /** Reason keys for the i18n explanation when value is null. */
  missing: ("designCapacity" | "maxCycles" | "logData")[];
}

/**
 * Health = remaining capacity vs. design capacity. Cycle life is tracked
 * separately (see `cycleLevel`) because a used-up cycle budget does not mean
 * the pack has lost the same share of its usable energy: a battery at
 * 100 of 200 cycles is halfway through its rated life, not half dead.
 * Falls back to cycle life only when no capacity data exists, and to the DJI
 * reported value when nothing else is available.
 */
export function computeBatteryHealth(
  input: BatteryHealthInput,
  config: BatteryHealthConfig,
): BatteryHealthResult {
  const missing: BatteryHealthResult["missing"] = [];

  let capacityHealth: number | null = null;
  if (input.capacityMah != null && config.designCapacityMah) {
    capacityHealth = Math.max(
      0,
      Math.min(120, (input.capacityMah / config.designCapacityMah) * 100),
    );
  } else if (input.capacityMah != null && !config.designCapacityMah) {
    missing.push("designCapacity");
  }

  let cycleHealth: number | null = null;
  if (input.cycles != null && config.maxCycles) {
    cycleHealth = Math.max(0, Math.min(100, (1 - input.cycles / config.maxCycles) * 100));
  } else if (input.cycles != null && !config.maxCycles) {
    missing.push("maxCycles");
  }

  if (capacityHealth != null) {
    return {
      value: Math.round(capacityHealth),
      source: "capacity",
      capacityHealth,
      cycleHealth,
      missing,
    };
  }
  if (input.djiHealthPct != null && input.djiHealthPct > 0) {
    return {
      value: Math.round(input.djiHealthPct),
      source: "dji",
      capacityHealth,
      cycleHealth,
      missing,
    };
  }
  if (cycleHealth != null) {
    return { value: Math.round(cycleHealth), source: "cycles", capacityHealth, cycleHealth, missing };
  }
  if (input.capacityMah == null && input.cycles == null) missing.push("logData");
  return { value: null, source: "none", capacityHealth, cycleHealth, missing };
}

export type BatteryStatusLevel = "ok" | "warn" | "critical" | "unknown";

export function batteryHealthLevel(
  value: number | null,
  config: BatteryHealthConfig,
): BatteryStatusLevel {
  if (value == null) return "unknown";
  if (value < config.healthCriticalPct) return "critical";
  if (value < config.healthWarnPct) return "warn";
  return "ok";
}

/** Warn from 90 % of the rated cycle budget, critical only when it is used up. */
export const CYCLE_WARN_RATIO = 0.9;

export function cycleLevel(
  cycles: number | null | undefined,
  config: BatteryHealthConfig,
): BatteryStatusLevel {
  if (cycles == null || !config.maxCycles) return "unknown";
  if (cycles >= config.maxCycles) return "critical";
  if (cycles >= config.maxCycles * CYCLE_WARN_RATIO) return "warn";
  return "ok";
}

export function cellDeviationLevel(
  value: number | null | undefined,
  config: BatteryHealthConfig,
): BatteryStatusLevel {
  if (value == null) return "unknown";
  if (value > config.cellDeviationCriticalV) return "critical";
  if (value > config.cellDeviationWarnV) return "warn";
  return "ok";
}

const LEVEL_RANK: Record<BatteryStatusLevel, number> = {
  unknown: 0,
  ok: 1,
  warn: 2,
  critical: 3,
};

export function worstBatteryLevel(...levels: BatteryStatusLevel[]): BatteryStatusLevel {
  return levels.reduce((worst, l) => (LEVEL_RANK[l] > LEVEL_RANK[worst] ? l : worst), "unknown");
}

/**
 * Overall battery status: capacity health, cycle budget and cell deviation
 * each contribute, and the worst one wins.
 */
export function batteryOverallLevel(
  input: { healthValue: number | null; cycles?: number | null; cellDeviation?: number | null },
  config: BatteryHealthConfig,
): BatteryStatusLevel {
  return worstBatteryLevel(
    batteryHealthLevel(input.healthValue, config),
    cycleLevel(input.cycles, config),
    cellDeviationLevel(input.cellDeviation, config),
  );
}

export function levelColorClass(level: BatteryStatusLevel): string {
  switch (level) {
    case "critical":
      return "text-destructive";
    case "warn":
      return "text-yellow-600 dark:text-yellow-400";
    case "ok":
      return "text-emerald-600 dark:text-emerald-400";
    default:
      return "text-muted-foreground";
  }
}

/** Fetches the global catalog plus the company's own battery types. */
export async function fetchBatteryTypes(): Promise<BatteryType[]> {
  const { data, error } = await (supabase as any)
    .from("battery_types")
    .select("*")
    .order("name");
  if (error) {
    console.error("Failed to fetch battery types", error);
    return [];
  }
  return (data || []) as BatteryType[];
}

export interface BatteryMatchSignals {
  /** Drone model the battery was flown with (drones.modell). */
  droneModel?: string | null;
  capacityMah?: number | null;
  /** Pack voltage from the log (battery_voltage_min_v). */
  packVoltageV?: number | null;
}

export interface BatteryMatch {
  type: BatteryType;
  confidence: "high" | "medium" | "low";
  reason: "droneModel" | "droneModelAndCapacity" | "capacity";
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function modelMatches(type: BatteryType, model: string): boolean {
  const target = normalize(model);
  return (type.drone_models || []).some((m) => {
    const n = normalize(m);
    return n === target || target.includes(n) || n.includes(target);
  });
}

function capacityMatches(type: BatteryType, capacity: number): boolean {
  if (type.capacity_min_mah == null || type.capacity_max_mah == null) return false;
  return capacity >= type.capacity_min_mah && capacity <= type.capacity_max_mah;
}

function voltageMatches(type: BatteryType, voltage: number): boolean {
  if (type.voltage_min_v == null || type.voltage_max_v == null) return false;
  return voltage >= type.voltage_min_v && voltage <= type.voltage_max_v;
}

/**
 * Picks the best battery type: the drone model from the same flight log is the
 * primary signal, capacity/voltage disambiguates when a model has variants.
 */
export function autoMatchBatteryType(
  types: BatteryType[],
  signals: BatteryMatchSignals,
): BatteryMatch | null {
  if (types.length === 0) return null;

  if (signals.droneModel) {
    const byModel = types.filter((t) => modelMatches(t, signals.droneModel as string));
    if (byModel.length === 1) {
      return { type: byModel[0], confidence: "high", reason: "droneModel" };
    }
    if (byModel.length > 1) {
      const narrowed = byModel.filter(
        (t) =>
          (signals.capacityMah != null && capacityMatches(t, signals.capacityMah)) ||
          (signals.packVoltageV != null && voltageMatches(t, signals.packVoltageV)),
      );
      if (narrowed.length === 1) {
        return { type: narrowed[0], confidence: "high", reason: "droneModelAndCapacity" };
      }
      return { type: byModel[0], confidence: "medium", reason: "droneModel" };
    }
  }

  if (signals.capacityMah != null) {
    const byCapacity = types.filter(
      (t) =>
        capacityMatches(t, signals.capacityMah as number) &&
        (signals.packVoltageV == null || voltageMatches(t, signals.packVoltageV)),
    );
    if (byCapacity.length === 1) {
      return { type: byCapacity[0], confidence: "medium", reason: "capacity" };
    }
    if (byCapacity.length > 1) {
      return { type: byCapacity[0], confidence: "low", reason: "capacity" };
    }
  }

  return null;
}

export interface BatteryTypeInput {
  name: string;
  manufacturer: string | null;
  drone_models: string[];
  design_capacity_mah: number | null;
  cell_count: number | null;
  max_cycles: number | null;
  health_warn_pct: number;
  health_critical_pct: number;
  cell_deviation_warn_v: number;
  cell_deviation_critical_v: number;
}

/** Creates a company-scoped battery type (visible to the company + its departments). */
export async function createBatteryType(
  companyId: string,
  input: BatteryTypeInput,
): Promise<BatteryType> {
  const { data, error } = await (supabase as any)
    .from("battery_types")
    .insert({ ...input, company_id: companyId })
    .select("*")
    .single();
  if (error) throw error;
  return data as BatteryType;
}

/** Updates a company-owned battery type. */
export async function updateBatteryType(
  id: string,
  input: BatteryTypeInput,
): Promise<BatteryType> {
  const { data, error } = await (supabase as any)
    .from("battery_types")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as BatteryType;
}

/** Deletes a company-owned battery type. */
export async function deleteBatteryType(id: string): Promise<void> {
  const { error } = await (supabase as any).from("battery_types").delete().eq("id", id);
  if (error) throw error;
}

/** Saves an automatically detected type, never overwriting a manual choice. */
export async function persistAutoMatch(equipmentId: string, typeId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("equipment")
    .update({ battery_type_id: typeId })
    .eq("id", equipmentId)
    .eq("battery_type_locked", false)
    .is("battery_type_id", null);
  if (error) console.error("Failed to persist battery type auto-match", error);
}
