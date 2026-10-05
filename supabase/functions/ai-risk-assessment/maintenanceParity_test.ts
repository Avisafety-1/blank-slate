import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { calculateDroneAggregatedStatus, calculateMaintenanceStatus } from "./maintenanceStatus.ts";
import { parityCases } from "./maintenanceParityFixtures.ts";

for (const c of parityCases()) {
  Deno.test(`parity (edge): ${c.name}`, () => {
    const r = calculateDroneAggregatedStatus(c.drone as any, c.accessories as any, c.linkedEquipment as any);
    assertEquals(r.status, c.expected);
  });
}

Deno.test("drones.status Rød → ownStatus Rød", () => {
  const r = calculateDroneAggregatedStatus({ status: "Rød" }, [], []);
  assertEquals(r.ownStatus, "Rød");
});

Deno.test("statusoppslag feiler → Ukjent", () => {
  const r = calculateDroneAggregatedStatus({}, [], [], { lookupFailed: true });
  assertEquals(r.ownStatus, "Ukjent");
  assertEquals(r.ownReasons.includes("Vedlikeholdsstatus kunne ikke hentes"), true);
});

Deno.test("dagens dato i Oslo: forfall i dag er Gul, ikke Rød", () => {
  // 2026-10-04 23:30 UTC = 2026-10-05 01:30 Oslo
  const now = new Date("2026-10-04T23:30:00Z");
  assertEquals(calculateMaintenanceStatus("2026-10-05", 14, now), "Gul");
  assertEquals(calculateMaintenanceStatus("2026-10-04", 14, now), "Rød");
});
