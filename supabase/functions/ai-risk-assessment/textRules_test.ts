import { assert, assertEquals } from "jsr:@std/assert@1";
import { applyLinkedOnlyEquipment, stripInternalAndOperationTypeText } from "./consistency.ts";
import { buildAlosRouteWarning } from "./systemDecisions.ts";

Deno.test("VLOS med SORA-avvik: ingen BVLOS-omtale og ingen feltnavn", () => {
  const a: any = {
    summary: "Oppdraget er innenfor høyde. Det er BVLOS-lignende. Ifølge soraProfile er det avvik. Avvik fra SORA-rammene på tetthet.",
    categories: { mission_complexity: { factors: ["isVlos er true.", "Ruten er kort."], concerns: ["Planlegg som BVLOS."] } },
    recommendations: [{ action: "Søk BVLOS-tillatelse", priority: "high" }, { action: "Vurder tettheten", priority: "medium" }, { action: "Sjekk pilotInputs", priority: "low" }],
  };
  stripInternalAndOperationTypeText(a, true);
  const all = JSON.stringify(a);
  assert(!/BVLOS/i.test(all));
  assert(!/isVlos|pilotInputs|soraProfile/.test(all));
  assert(a.summary.includes("Avvik fra SORA-rammene"));
  assertEquals(a.recommendations.length, 1);
});

Deno.test("Grønn drone + rødt ikke-valgt tilbehør → utstyr ≥ 8 og lav prioritet", () => {
  const a: any = {
    categories: { equipment: { score: 5.5, go_decision: "BETINGET" } },
    recommendations: [{ action: "Bytt Propell X før flyging", priority: "high" }, { action: "Bytt batteri på Propell X", priority: "medium" }],
  };
  applyLinkedOnlyEquipment(a, { primaryDroneStatus: "Grønn", redItems: [], yellowItems: [], linkedOnlyTerms: ["Propell X"] });
  assert(a.categories.equipment.score >= 8);
  assertEquals(a.categories.equipment.go_decision, "GO");
  assert(a.recommendations.every((r: any) => r.priority === "low"));
});

Deno.test("ALOS mot rute", () => {
  assert(buildAlosRouteWarning(true, 1508, 1328, "no")!.includes("1\u00a0508 m"));
  assertEquals(buildAlosRouteWarning(true, 900, 1328, "no"), null);
  assertEquals(buildAlosRouteWarning(false, 1508, 1328, "no"), null);
});
