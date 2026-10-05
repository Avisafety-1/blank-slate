import { assertEquals } from "jsr:@std/assert@1";
import { resolveContainment } from "./containment.ts";
import { calculateContainmentRequirement } from "../_shared/soraContainment.ts";

const doc = (o: Record<string, unknown> = {}) => ({
  enabled: true, calculatedAt: "2026-10-01T10:00:00Z", adjacentRadiusM: 1500, avgDensity: 30,
  uaSize: "1m", sail: "II", populationDensityCategory: "50k", outdoorAssemblies: "40k", ...o,
});

Deno.test("map doc + assessment SAIL II gives the map's requirement", () => {
  const r = resolveContainment(doc(), "SAIL II", "no");
  assertEquals(r.source, "map");
  assertEquals(r.required, calculateContainmentRequirement("1m", "II", "50k", "40k"));
  assertEquals(r.note, null);
  assertEquals(r.calculatedAt, "2026-10-01T10:00:00Z");
});

Deno.test("map SAIL III but assessment SAIL II recalculates with II and adds a note", () => {
  const r = resolveContainment(doc({ sail: "III" }), "SAIL II", "no");
  assertEquals(r.required, calculateContainmentRequirement("1m", "II", "50k", "40k"));
  assertEquals(r.mapSail, "III");
  assertEquals(r.assessmentSail, "II");
  assertEquals(r.note?.includes("med SAIL III; kravet er beregnet på nytt med vurderingens SAIL II"), true);
});

Deno.test("no documentation gives 'Ikke beregnet' with warning", () => {
  for (const d of [null, undefined, doc({ enabled: false }), { enabled: true }]) {
    const r = resolveContainment(d, "SAIL II", "no");
    assertEquals(r.required, "Ikke beregnet");
    assertEquals(r.source, "missing");
    assertEquals(r.warning, true);
    assertEquals(r.note?.startsWith("Beregn tilstøtende område i kartet"), true);
  }
});

Deno.test("SAIL null gives no lookup and shows the reason", () => {
  const r = resolveContainment(doc(), null, "en", "certified category");
  assertEquals(r.required, "Ikke beregnet");
  assertEquals(r.source, "map");
  assertEquals(r.note, "Containment not looked up: certified category");
});

Deno.test("Out of scope is flagged", () => {
  // Find any out-of-scope cell in the shared matrix.
  const sizes = ["1m", "3mShelterApplicable", "3mShelterNotApplicable", "8m", "20m", "40m"] as const;
  const dens = ["50", "500", "5k", "50k", "NoLimit"] as const;
  const outs = ["40k", "40kTo400k", "400k"] as const;
  const sails = ["I", "II", "III", "IV", "V", "VI"] as const;
  for (const u of sizes) for (const d of dens) for (const o of outs) for (const s of sails) {
    if (calculateContainmentRequirement(u, s, d, o) === "Out of scope") {
      const r = resolveContainment(doc({ uaSize: u, populationDensityCategory: d, outdoorAssemblies: o, sail: s }), `SAIL ${s}`, "no");
      assertEquals(r.outOfScope, true);
      assertEquals(r.note?.includes("Utenfor specific-kategorien"), true);
      return;
    }
  }
});
