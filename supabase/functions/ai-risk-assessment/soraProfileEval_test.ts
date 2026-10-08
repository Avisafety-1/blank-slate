import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { evaluateSoraProfile, type SoraProfileFacts } from '../_shared/soraProfileEvaluation.ts';
import { emptySoraProfile, type SoraProfile } from '../_shared/soraProfile.ts';
import { computeIgrc } from './soraGroundRisk.ts';

const profile = (): SoraProfile => {
  const p = emptySoraProfile();
  p.envelope.maxHeightM = 120;
  p.envelope.maxPopulationDensity = 500;
  p.envelope.maxDistanceFromPilotM = 1500;
  p.aircraft = [
    { manufacturer: 'DJI', model: 'M350 RTK', type: 'multirotor', maxDimensionM: 1.43, maxSpeedMps: 23, mtomKg: 9.2, droneIds: ['d-m350'], catalogModelId: null },
    { manufacturer: 'DJI', model: 'Matrice 4', type: 'multirotor', maxDimensionM: 0.9, maxSpeedMps: 21, mtomKg: 1.43, droneIds: ['d-m4'], catalogModelId: null },
  ];
  p.ground.igrc = 5;
  p.ground.fgrc = 3;
  p.ground.mitigations.m1a = { robustness: 'Low', reduction: -1, conditionText: null };
  p.ground.mitigations.m1c = { robustness: 'Low', reduction: -1, conditionText: null, requiresObserver: true };
  p.air.residualArc = 'ARC-b';
  p.sail = 'II';
  return p;
};

const m350 = computeIgrc({ dimensionM: 1.43, speedMps: 23, weightKg: 9.2, densityPerKm2: 400, controlled: false });
const m4 = computeIgrc({ dimensionM: 0.9, speedMps: 21, weightKg: 1.43, densityPerKm2: 400, controlled: false });

const facts = (over: Partial<SoraProfileFacts> = {}): SoraProfileFacts => ({
  lang: 'no',
  drones: [{ id: 'd-m350', model: 'M350 RTK', weightKg: 9.2 }],
  heightM: 100,
  densityPerKm2: 400,
  m1cEligible: true,
  equipmentIds: [],
  igrc: m350.igrc,
  controlledMinimum: m350.controlledMinimum,
  residualArc: 'ARC-b',
  maxRouteDistanceM: 800,
  adjacentAvgDensity: null,
  autoM1c: -1,
  ...over,
});

const keys = (e: ReturnType<typeof evaluateSoraProfile>) => e.appliedMitigations.map((a) => a.key);
const codes = (e: ReturnType<typeof evaluateSoraProfile>) => e.deviations.map((d) => d.code);

Deno.test('inside envelope with observer → M1A + M1C, fGRC 3 from iGRC 5', () => {
  assertEquals(m350.igrc, 5);
  const e = evaluateSoraProfile(profile(), facts());
  assertEquals(keys(e), ['m1a_sheltering', 'm1c_ground_observation']);
  assertEquals(e.fgrc, 3);
  assertEquals(e.deviations, []);
  assertEquals(e.state, 'within_envelope');
});

Deno.test('no observer and requiresObserver → only M1A', () => {
  const e = evaluateSoraProfile(profile(), facts({ m1cEligible: false, autoM1c: 0 }));
  assertEquals(keys(e), ['m1a_sheltering']);
  assert(e.notes.some((n) => n.includes('M1(C) forutsetter observatør')));
});

Deno.test('unlinked drone → DRONE_NOT_COVERED, no profile credit', () => {
  const e = evaluateSoraProfile(profile(), facts({ drones: [{ id: 'other', model: 'M30T', weightKg: 3.8 }], autoM1c: 0 }));
  assert(codes(e).includes('DRONE_NOT_COVERED'));
  assertEquals(e.appliedMitigations, []);
  assertEquals(e.profileReductions, {});
});

Deno.test('height 150 → HEIGHT_EXCEEDED', () => {
  assert(codes(evaluateSoraProfile(profile(), facts({ heightM: 150 }))).includes('HEIGHT_EXCEEDED'));
});

Deno.test('density 600 → DENSITY_EXCEEDED', () => {
  assert(codes(evaluateSoraProfile(profile(), facts({ densityPerKm2: 600 }))).includes('DENSITY_EXCEEDED'));
});

Deno.test('no route → note, not deviation', () => {
  const e = evaluateSoraProfile(profile(), facts({ maxRouteDistanceM: null }));
  assertEquals(e.deviations.length, 0);
  assert(e.notes.some((n) => n.includes('tillater maks 1500 m fra pilot')));
});

Deno.test('route 5238 m over limit 5000 m → notes, no deviation, reductions kept', () => {
  const p = profile(); p.envelope.maxDistanceFromPilotM = 5000;
  const e = evaluateSoraProfile(p, facts({ maxRouteDistanceM: 5238 }));
  assertEquals(e.deviations.length, 0);
  assertEquals(e.state, 'within_envelope');
  assertEquals(e.maxDistanceFromPilotM, 5000);
  assert(e.notes.includes('SORA-en tillater maks 5000 m fra pilot. Kontroller avstanden under flyging.'));
  assert(e.notes.includes('Det planlagte området strekker seg 5238 m fra første punkt – plasser piloten slik at grensen holdes.'));
  assert(e.appliedMitigations.length > 0);
});

Deno.test('M4 drone (iGRC 4) inside envelope → fGRC 2, no FGRC_EXCEEDED', () => {
  assertEquals(m4.igrc, 4);
  const e = evaluateSoraProfile(profile(), facts({
    drones: [{ id: 'd-m4', model: 'Matrice 4T', weightKg: 1.43 }], igrc: m4.igrc, controlledMinimum: m4.controlledMinimum,
  }));
  assertEquals(e.fgrc, 2);
  assert(!codes(e).includes('FGRC_EXCEEDED'));
});

Deno.test('manual selection overrides profile value', () => {
  const e = evaluateSoraProfile(profile(), facts({ manual: { m1a_sheltering: { applicable: false } } }));
  assertEquals(e.fgrc, 4);
});
