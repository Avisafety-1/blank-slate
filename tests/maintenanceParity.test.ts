import { describe, expect, test } from "bun:test";
import { calculateDroneAggregatedStatus, worstStatus } from "../src/lib/maintenanceStatus";
import type { Status } from "../src/types";
import { parityCases } from "../supabase/functions/ai-risk-assessment/maintenanceParityFixtures";

// Same fixtures as the edge copy. The app combines drones.status with the
// aggregated status in the UI, so it is applied here the same way.
describe("maintenance status parity (app)", () => {
  for (const c of parityCases()) {
    test(c.name, () => {
      const r = calculateDroneAggregatedStatus(c.drone as any, c.accessories as any, c.linkedEquipment as any);
      const withDb = worstStatus(r.status, ((c.drone as any).status as Status) || "Grønn");
      expect(withDb).toBe(c.expected);
    });
  }
});
