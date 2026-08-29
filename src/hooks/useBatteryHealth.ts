import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  autoMatchBatteryType,
  persistAutoMatch,
  resolveBatteryConfig,
  computeBatteryHealth,
  fetchBatteryTypes,
  DEFAULT_BATTERY_CONFIG,
  type BatteryHealthConfig,
  type BatteryMatch,
  type BatteryEquipmentOverrides,
} from "@/lib/batteryHealth";

export interface BatteryTrendEntry {
  date: Date;
  cycles: number | null;
  health: number | null;
  tempMin: number | null;
  tempMax: number | null;
  voltageMin: number | null;
  capacityMah: number | null;
  cellDeviation: number | null;
}

export interface BatteryHealthData {
  trend: BatteryTrendEntry[];
  config: BatteryHealthConfig;
  suggestion: BatteryMatch | null;
  loading: boolean;
  /** Computed health for the most recent log entry (null when unknown). */
  latestHealth: number | null;
  /** Computed health for the oldest log entry. */
  firstHealth: number | null;
  reload: () => void;
}

export const computeEntryHealth = (
  e: BatteryTrendEntry | undefined,
  config: BatteryHealthConfig,
): number | null =>
  computeBatteryHealth(
    { capacityMah: e?.capacityMah ?? null, cycles: e?.cycles ?? null, djiHealthPct: e?.health ?? null },
    config,
  ).value;

/**
 * Shared battery-health data used by both the equipment detail card and the
 * logbook's battery trend tab, so both surfaces show the same number.
 * Resolves the battery type from the drone model in the same flight logs,
 * with capacity/voltage as fallback signals, and merges per-equipment
 * overrides.
 */
export function useBatteryHealth(
  equipmentId: string | undefined,
  serienummer: string | null | undefined,
  companyId: string | null | undefined,
  enabled: boolean,
): BatteryHealthData {
  const [trend, setTrend] = useState<BatteryTrendEntry[]>([]);
  const [config, setConfig] = useState<BatteryHealthConfig>(DEFAULT_BATTERY_CONFIG);
  const [suggestion, setSuggestion] = useState<BatteryMatch | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!enabled || !equipmentId || !serienummer || !companyId) return;
    setLoading(true);
    try {
      const { data } = await (supabase
        .from("flight_logs")
        .select(
          "flight_date, drone_id, battery_cycles, battery_health_pct, battery_temp_min_c, battery_temp_max_c, battery_voltage_min_v, battery_full_capacity_mah, battery_cell_deviation_max_v",
        )
        .eq("company_id", companyId) as any)
        .eq("battery_sn", serienummer)
        .not("battery_cycles", "is", null)
        .order("flight_date", { ascending: true })
        .limit(100);

      const rows = (data || []) as any[];
      const entries: BatteryTrendEntry[] = rows.map((r: any) => ({
        date: new Date(r.flight_date),
        cycles: r.battery_cycles,
        health: r.battery_health_pct,
        tempMin: r.battery_temp_min_c,
        tempMax: r.battery_temp_max_c,
        voltageMin: r.battery_voltage_min_v,
        capacityMah: r.battery_full_capacity_mah,
        cellDeviation: r.battery_cell_deviation_max_v,
      }));
      setTrend(entries);

      // The log tells us which drone the battery flew with — use it as the
      // primary signal for auto-picking the battery type.
      const lastWithDrone = [...rows].reverse().find((r) => r.drone_id);
      let droneModel: string | null = null;
      if (lastWithDrone?.drone_id) {
        const { data: drone } = await (supabase as any)
          .from("drones")
          .select("modell")
          .eq("id", lastWithDrone.drone_id)
          .maybeSingle();
        droneModel = drone?.modell ?? null;
      }

      const last = rows[rows.length - 1];
      const signals = {
        capacityMah: last?.battery_full_capacity_mah ?? null,
        packVoltageV: last?.battery_voltage_min_v ?? null,
      };

      const [types, { data: eq }] = await Promise.all([
        fetchBatteryTypes(),
        (supabase as any)
          .from("equipment")
          .select(
            "battery_type_id, battery_type_locked, battery_design_capacity_mah, battery_max_cycles, battery_health_warn_pct, battery_health_critical_pct, battery_cell_deviation_warn_v, battery_cell_deviation_critical_v",
          )
          .eq("id", equipmentId)
          .maybeSingle(),
      ]);

      const overrides = (eq || {}) as BatteryEquipmentOverrides;
      let type = types.find((tp) => tp.id === overrides.battery_type_id) || null;

      const match = autoMatchBatteryType(types, { droneModel, ...signals });
      setSuggestion(match);

      if (!type && match && !overrides.battery_type_locked) {
        type = match.type;
        persistAutoMatch(equipmentId, match.type.id);
      }

      setConfig(resolveBatteryConfig(type, overrides));
    } catch (e) {
      console.error("Error loading battery health:", e);
    } finally {
      setLoading(false);
    }
  }, [enabled, equipmentId, serienummer, companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const latest = trend[trend.length - 1];
  const first = trend[0];

  return {
    trend,
    config,
    suggestion,
    loading,
    latestHealth: computeEntryHealth(latest, config),
    firstHealth: computeEntryHealth(first, config),
    reload: load,
  };
}
