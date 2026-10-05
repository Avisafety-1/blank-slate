import { assertEquals } from "jsr:@std/assert@1";
import { classifyOperation } from "./operationCategory.ts";
import { resolveContainment } from "./containment.ts";
import { calculateContainmentRequirement } from "../_shared/soraContainment.ts";

const base = { isVlos: true, flightHeightM: 60, droneClass: "C2", weightKg: 4 };
const doc = { enabled: true, uaSize: "1m", sail: "II", populationDensityCategory: "50k", outdoorAssemblies: "40k" };

Deno.test("VLOS 60 m C2 → open, no yellow box", () => {
  const c = classifyOperation(base);
  assertEquals(c, { category: "open", reasons: [] });
  const r = resolveContainment(null, "SAIL II", "no", null, c.category);
  assertEquals(r.required, "Ikke relevant");
  assertEquals(r.source, "not_applicable");
  assertEquals(r.warning, false);
  assertEquals(r.note, "Åpen kategori — tilstøtende område og inneslutning er ikke relevant");
});

Deno.test("route.soraSettings.enabled does not matter → still open", () => {
  const input = { ...base, route: { soraSettings: { enabled: true } } } as any;
  assertEquals(classifyOperation(input).category, "open");
});

Deno.test("specific triggers", () => {
  assertEquals(classifyOperation({ ...base, isVlos: false }).reasons, ["BVLOS"]);
  assertEquals(classifyOperation({ ...base, flightHeightM: 130 }).reasons, ["Flyhøyde over 120 m"]);
  assertEquals(classifyOperation({ ...base, droneClass: "C6" }).category, "specific");
  assertEquals(classifyOperation({ ...base, droneClass: null, weightKg: 30 }).category, "specific");
  assertEquals(classifyOperation({ ...base, droneClass: "C3", weightKg: 30 }).category, "open");
  assertEquals(classifyOperation({ ...base, companyRequiresSora: true }).reasons, ["Selskapet krever SORA"]);
  assertEquals(classifyOperation({ ...base, hasSoraDocument: true }).category, "specific");
});

Deno.test("specific / SORA reassessment (no category) computes as before", () => {
  const expected = calculateContainmentRequirement("1m", "II", "50k", "40k");
  assertEquals(resolveContainment(doc, "SAIL II", "no").required, expected);
  assertEquals(resolveContainment(doc, "SAIL II", "no", null, "specific").required, expected);
  assertEquals(resolveContainment(null, "SAIL II", "no", null, "specific").required, "Ikke beregnet");
});
