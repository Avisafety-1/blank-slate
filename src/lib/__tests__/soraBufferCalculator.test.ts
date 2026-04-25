import { describe, expect, it } from "vitest";
import { calculateSoraBuffer, type DroneProfile } from "../soraBufferCalculator";

const drone: DroneProfile = {
  aircraft_type: "multirotor",
  mtow_kg: 1,
  has_parachute_support: true,
  has_fts_support: true,
};

describe("calculateSoraBuffer", () => {
  it("matches the CAA SORA 2.5 contingency volume default example", () => {
    const result = calculateSoraBuffer(drone, {
      planned_altitude_m_agl: 120,
      operation_profile: "vlos",
      containment_level: "medium",
      parachute_enabled: false,
      fts_enabled: false,
      characteristic_dimension_m: 1,
      ground_speed_mps: 15,
      reaction_time_s: 1.5,
      pitch_bank_angle_deg: 30,
      altimetry_error_m: 1,
      gnss_error_m: 5,
      position_hold_error_m: 2,
      map_error_m: 0,
      contingency_method: "standard",
      ground_risk_buffer_method: "off",
    });

    expect(result.suggested_contingency_buffer_m).toBeCloseTo(49.4, 1);
    expect(result.total_ceiling_m).toBeCloseTo(148.4, 1);
    expect(result.details.reaction_distance_m).toBeCloseTo(22.5, 1);
    expect(result.details.maneuver_distance_m).toBeCloseTo(19.9, 1);
    expect(result.details.vertical_reaction_m).toBeCloseTo(15.9, 1);
    expect(result.details.vertical_maneuver_m).toBeCloseTo(11.5, 1);
  });
});
