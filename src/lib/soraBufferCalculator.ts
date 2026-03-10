export interface DroneProfile {
  aircraft_type: "multirotor" | "fixed_wing" | "vtol" | "helicopter";
  mtow_kg: number;
  max_speed_mps?: number;
  max_wind_mps?: number;
  characteristic_dimension_m?: number;
  has_parachute_support: boolean;
  has_fts_support: boolean;
}

export interface MissionParams {
  planned_altitude_m_agl: number;
  planned_speed_mps?: number;
  operation_profile: "vlos" | "bvlos";
  containment_level: "low" | "medium" | "high";
  parachute_enabled: boolean;
  fts_enabled: boolean;
  wind_override_mps?: number;
}

export interface SoraBufferSuggestion {
  suggested_contingency_buffer_m: number;
  suggested_ground_risk_buffer_m: number;
  suggested_flight_geography_m: number;
  suggested_total_buffer_m: number;
  calculation_summary: string;
  warnings: string[];
}

const BASE_VALUES: Record<string, { contingency: number; groundRisk: number; flightGeo: number }> = {
  multirotor: { contingency: 20, groundRisk: 50, flightGeo: 10 },
  fixed_wing: { contingency: 40, groundRisk: 80, flightGeo: 20 },
  vtol: { contingency: 30, groundRisk: 60, flightGeo: 15 },
  helicopter: { contingency: 35, groundRisk: 70, flightGeo: 15 },
};

const REACTION_TIME_S = 3;

function roundTo5(val: number): number {
  return Math.ceil(val / 5) * 5;
}

export function calculateSoraBuffer(
  drone: DroneProfile,
  mission: MissionParams
): SoraBufferSuggestion {
  const warnings: string[] = [];
  const base = BASE_VALUES[drone.aircraft_type] ?? BASE_VALUES.multirotor;

  let contingency = base.contingency;
  let groundRisk = base.groundRisk;
  let flightGeo = base.flightGeo;

  // Weight multipliers
  if (drone.mtow_kg > 25) {
    contingency *= 2.5;
    groundRisk *= 2.5;
    warnings.push("MTOW > 25 kg — økte buffere vesentlig");
  } else if (drone.mtow_kg > 4) {
    contingency *= 1.5;
    groundRisk *= 1.5;
  }

  // Altitude multipliers
  const alt = mission.planned_altitude_m_agl;
  if (alt > 120) {
    contingency *= 1.5;
    groundRisk *= 1.5;
    warnings.push("Flyhøyde > 120 m AGL — utvidet buffer");
  } else if (alt > 50) {
    contingency *= 1.2;
    groundRisk *= 1.2;
  }

  // Operation profile
  if (mission.operation_profile === "bvlos") {
    contingency *= 1.5;
    groundRisk *= 1.3;
    warnings.push("BVLOS-operasjon — økt contingency");
  }

  // Containment level
  if (mission.containment_level === "low") {
    contingency *= 1.3;
    groundRisk *= 1.3;
  } else if (mission.containment_level === "high") {
    contingency *= 0.9;
    groundRisk *= 0.9;
  }

  // Wind contribution
  const windSpeed = mission.wind_override_mps ?? drone.max_wind_mps ?? 0;
  if (windSpeed > 0) {
    contingency += windSpeed * REACTION_TIME_S;
  }

  // Speed contribution
  const speed = mission.planned_speed_mps ?? drone.max_speed_mps ?? 0;
  if (speed > 0) {
    contingency += speed * REACTION_TIME_S * 0.5;
  }

  // Mitigations
  if (mission.parachute_enabled && drone.has_parachute_support) {
    groundRisk *= 0.7;
  }
  if (mission.fts_enabled && drone.has_fts_support) {
    contingency *= 0.8;
  }

  // Enforce minimums and round
  contingency = Math.max(roundTo5(contingency), 10);
  groundRisk = Math.max(roundTo5(groundRisk), 25);
  flightGeo = Math.max(roundTo5(flightGeo), 5);

  const total = flightGeo + contingency + groundRisk;

  const summaryParts: string[] = [
    `Type: ${drone.aircraft_type}, MTOW: ${drone.mtow_kg} kg`,
    `Høyde: ${alt} m AGL, Profil: ${mission.operation_profile.toUpperCase()}`,
    `Containment: ${mission.containment_level}`,
  ];
  if (windSpeed > 0) summaryParts.push(`Vind: ${windSpeed} m/s`);
  if (mission.parachute_enabled) summaryParts.push("Fallskjerm aktiv");
  if (mission.fts_enabled) summaryParts.push("FTS aktiv");

  return {
    suggested_contingency_buffer_m: contingency,
    suggested_ground_risk_buffer_m: groundRisk,
    suggested_flight_geography_m: flightGeo,
    suggested_total_buffer_m: total,
    calculation_summary: summaryParts.join(" · "),
    warnings,
  };
}

/**
 * Map drone_models category string to aircraft_type for buffer calculation.
 */
export function categoryToAircraftType(
  category: string | null,
  modelName: string
): DroneProfile["aircraft_type"] {
  const lower = (category ?? "").toLowerCase();
  const nameLower = modelName.toLowerCase();

  if (lower.includes("vtol") || nameLower.includes("vtol")) return "vtol";
  if (
    lower.includes("fixed") ||
    lower.includes("wing") ||
    nameLower.includes("wing") ||
    nameLower.includes("trinity") ||
    nameLower.includes("ebee")
  )
    return "fixed_wing";
  if (lower.includes("helicopter") || nameLower.includes("helicopter")) return "helicopter";
  return "multirotor";
}
