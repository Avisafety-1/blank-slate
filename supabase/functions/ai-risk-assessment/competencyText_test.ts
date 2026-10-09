import { assert, assertEquals } from "jsr:@std/assert@1";
import { evaluateCompetency, buildCompetencyReason } from "./competency.ts";
import { applyCompetencyDecision, buildCompetencyForAi, stripOpenCategoryCompetency } from "./consistency.ts";

const now = new Date("2026-10-09T12:00:00Z");
const row = (navn: string, type = "Sertifikat") => ({ profile_id: "p1", navn, type, utloper_dato: null });
const LOWER_RE = /lavere|mangler|manglende|under kravet/i;

Deno.test("BVLOS, C2, A2 + operatørgodkjenning → ingen setning om lavere kompetanse", () => {
  const ca = evaluateCompetency({ rows: [row("A2"), row("Operatørgodkjenning LT", "Godkjenning")], pilotIds: ["p1"], droneClass: "C2", proximityToPeople: "populated", isVlos: false, now });
  assertEquals(ca.status, "ok");
  const ai = buildCompetencyForAi(ca, { specific: true, isVlos: false });
  assertEquals(Object.keys(ai).sort(), ["coveredBy", "operatorApproval", "recognised", "status"]);
  const a: any = {
    summary: "Ruten er godt planlagt. Pilotens kompetanse er lavere enn kravet for C2 nær folk. Været er fint.",
    categories: { pilot_experience: { score: 5.5, go_decision: "BETINGET", experience_summary: "Piloten har A2. Manglende formell matching mot krav.", factors: ["Erfaren pilot."], concerns: ["Kompetansen er ikke tilstrekkelig for C2 nær folk."] } },
    recommendations: [],
  };
  stripOpenCategoryCompetency(a);
  applyCompetencyDecision(a, ca.status);
  assert(!LOWER_RE.test(a.summary));
  assert(!LOWER_RE.test(JSON.stringify(a.categories.pilot_experience)));
  assert(a.summary.includes("Været er fint."));
  assert(a.categories.pilot_experience.score >= 7);
});

Deno.test("VLOS åpen kategori, C2 nær folk, kun A1/A3 → missing og begrunnelsen beholdes", () => {
  const ca = evaluateCompetency({ rows: [row("A1/A3")], pilotIds: ["p1"], droneClass: "C2", proximityToPeople: "populated", isVlos: true, now });
  assertEquals(ca.status, "missing");
  assert(buildCompetencyReason(ca, "no")!.includes("krever A2"));
  assertEquals(buildCompetencyForAi(ca, { specific: false, isVlos: true }).requiredLevel, ca.requiredLabel);
  const text = "Pilotens kompetanse er lavere enn kravet for C2 nær folk.";
  const a: any = { summary: text, categories: { pilot_experience: { score: 4, go_decision: "BETINGET", concerns: [text] } } };
  applyCompetencyDecision(a, ca.status);
  assertEquals(a.summary, text);
  assertEquals(a.categories.pilot_experience.concerns, [text]);
  assertEquals(a.categories.pilot_experience.score, 4);
});
