import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { checkSoraProfileConsistency, emptySoraProfile, sanitizeSoraProfile } from './soraProfile.ts';

const reference = () => {
  const p = emptySoraProfile();
  p.envelope = { maxHeightM: 120, maxSpeedMps: 15, maxPopulationDensity: 500, operationType: 'BVLOS', maxDistanceFromPilotM: 1500, controlledGroundArea: false };
  p.aircraft = [
    { manufacturer: 'DJI', model: 'M350 RTK', type: 'multirotor', maxDimensionM: 1.43, maxSpeedMps: 23, mtomKg: 9.2 },
    { manufacturer: 'DJI', model: 'M400', type: 'multirotor', maxDimensionM: 1.43, maxSpeedMps: 25, mtomKg: 15.8 },
    { manufacturer: 'DJI', model: 'Matrice 4', type: 'multirotor', maxDimensionM: 0.9, maxSpeedMps: 21, mtomKg: 1.43 },
  ];
  p.ground.igrc = 5;
  p.ground.fgrc = 3;
  p.ground.mitigations.m1a = { robustness: 'Low', reduction: -1, conditionText: null };
  p.ground.mitigations.m1c = { robustness: 'Low', reduction: -1, conditionText: null, requiresObserver: true };
  p.air = { scenario: null, initialArc: 'ARC-b', aec: 10, strategicReductions: [], residualArc: 'ARC-b', tmpr: 'Low' };
  p.sail = 'II';
  return p;
};

Deno.test('reference SORA has no deviations', () => {
  assertEquals(checkSoraProfileConsistency(reference()), []);
});

Deno.test('wrong fGRC, SAIL and TMPR are reported', () => {
  const p = reference();
  p.ground.fgrc = 4;
  p.sail = 'IV';
  p.air.tmpr = 'Medium';
  const fields = checkSoraProfileConsistency(p).map((i) => i.field);
  assertEquals(fields.includes('ground.fgrc'), true);
  assertEquals(fields.includes('sail'), true);
  assertEquals(fields.includes('air.tmpr'), true);
});

Deno.test('reduction not matching robustness is reported', () => {
  const p = reference();
  p.ground.mitigations.m1a.reduction = -2;
  assertEquals(checkSoraProfileConsistency(p)[0].field, 'ground.mitigations.m1a.reduction');
});

Deno.test('sanitizer normalizes AI output', () => {
  const p = sanitizeSoraProfile({ sail: 'SAIL 2', air: { residualArc: 'b', tmpr: 'low' }, envelope: { maxHeightM: '120 m' } });
  assertEquals(p.sail, 'II');
  assertEquals(p.air.residualArc, 'ARC-b');
  assertEquals(p.air.tmpr, 'Low');
  assertEquals(p.envelope.maxHeightM, 120);
});
