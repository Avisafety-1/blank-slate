import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveFlightInputs } from "./flightInputs.ts";
import { evaluateCivilTwilight } from "./twilight.ts";
import { isFixedWingDrone, modelSearchTerms, sanitizeIlikeTerm } from "./catalogLookup.ts";
import { deriveHardStops } from "./hardStops.ts";
import { calculateDroneAggregatedStatus, isYellowStatus, unknownStatusText } from "./maintenanceStatus.ts";

Deno.test("høyde mangler → 120 m + merknad", () => {
  const r = resolveFlightInputs({}, {});
  assertEquals(r.heightM, 120);
  assertEquals(r.heightSource, "default");
  assertEquals(r.note, "Flyhøyde ikke oppgitt — 120 m lagt til grunn");
});

Deno.test("soraSettings 42 → 42 m", () => {
  const r = resolveFlightInputs({ flightHeight: 0 }, { route: { soraSettings: { flightAltitude: 42 } } });
  assertEquals([r.heightM, r.heightSource, r.note], [42, "route", null]);
});

Deno.test("pilotInputs overstyrer soraSettings", () => {
  const r = resolveFlightInputs({ flightHeight: 80, isVlos: false }, { route: { soraSettings: { flightAltitude: 42 } } });
  assertEquals([r.heightM, r.heightSource, r.isVlos], [80, "pilot", false]);
});

Deno.test("NOTAM ignoreres, isVlos mangler → VLOS", () => {
  const r = resolveFlightInputs({}, { notam_max_agl_ft: 400, notam_operation_type: "BVLOS" } as any);
  assertEquals([r.heightM, r.isVlos], [120, true]);
});

Deno.test("lookupFailed → gul liste", () => {
  const r = calculateDroneAggregatedStatus({ id: "d" } as any, [], [], { lookupFailed: true });
  assertEquals(r.ownStatus, "Ukjent");
  assertEquals(isYellowStatus(r.ownStatus), true);
  assertEquals(unknownStatusText("en"), "Maintenance status could not be retrieved");
});

Deno.test("skumring: slutt_tidspunkt etter dusk → brudd", () => {
  // Oslo 4. okt: dusk ca. 19:30 lokal (17:30 UTC)
  const ok = evaluateCivilTwilight({ start: "2026-10-04T10:00:00Z", end: "2026-10-04T12:00:00Z", lat: 59.91, lng: 10.75 });
  assertEquals(ok.violation, false);
  const bad = evaluateCivilTwilight({ start: "2026-10-04T15:00:00Z", end: "2026-10-04T19:00:00Z", lat: 59.91, lng: 10.75 });
  assertEquals(bad.violation, true);
});

Deno.test("skumring: dato velges etter Oslo-tid", () => {
  // 23:30 UTC 4. okt = 01:30 Oslo 5. okt → utenfor skumring
  const r = evaluateCivilTwilight({ start: "2026-10-04T23:30:00Z", lat: 59.91, lng: 10.75 });
  assertEquals(r.violation, true);
});

Deno.test("polarnatt → brudd og hard stop-tekst", () => {
  const r = evaluateCivilTwilight({ start: "2026-12-21T11:00:00Z", lat: 80.0, lng: 15.0 });
  assertEquals(r.polarNight, true);
  assertEquals(r.violation, true);
  const stops = deriveHardStops({
    lang: "no", requireCivilTwilight: true, allowNightFlight: null,
    civilTwilightViolation: true, civilTwilightPolarNight: true,
  } as any);
  assertEquals(stops.some((s: any) => /polarnatt/.test(JSON.stringify(s))), true);
});

Deno.test("midnattssol → ingen brudd", () => {
  const r = evaluateCivilTwilight({ start: "2026-06-21T23:00:00Z", lat: 69.65, lng: 18.96 });
  assertEquals(r.violation, false);
});

Deno.test("modellnavn med parentes gir rene søkeord", () => {
  const terms = modelSearchTerms("DJI Mavic 3 Enterprise (M3E)");
  for (const t of terms) assertEquals(/[,()%]/.test(t), false);
  assertEquals(terms.includes("Mavic 3 Enterprise"), true);
  assertEquals(sanitizeIlikeTerm("a,b(c)%"), "a b c");
});

Deno.test("fastvinge: kategori først, ordgrenser", () => {
  assertEquals(isFixedWingDrone("Flycart 30", null), false);
  assertEquals(isFixedWingDrone("Wingtra One", null), false);
  assertEquals(isFixedWingDrone("eBee X fixed-wing", null), true);
  assertEquals(isFixedWingDrone("Anything", "VTOL"), true);
  assertEquals(isFixedWingDrone("Some VTOL", "multirotor"), false);
});
