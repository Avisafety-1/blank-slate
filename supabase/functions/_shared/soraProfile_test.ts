import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { checkSoraProfileConsistency, emptySoraProfile, sanitizeSoraProfile, suggestAircraftMatches } from './soraProfile.ts';

const reference = () => {
  const p = emptySoraProfile();
  p.envelope = { maxHeightM: 120, maxSpeedMps: 15, maxPopulationDensity: 500, operationType: 'BVLOS', maxDistanceFromPilotM: 1500, controlledGroundArea: false };
  p.aircraft = [
    { manufacturer: 'DJI', model: 'M350 RTK', type: 'multirotor', maxDimensionM: 1.43, maxSpeedMps: 23, mtomKg: 9.2, droneIds: [], catalogModelId: null },
    { manufacturer: 'DJI', model: 'M400', type: 'multirotor', maxDimensionM: 1.43, maxSpeedMps: 25, mtomKg: 15.8, droneIds: [], catalogModelId: null },
    { manufacturer: 'DJI', model: 'Matrice 4', type: 'multirotor', maxDimensionM: 0.9, maxSpeedMps: 21, mtomKg: 1.43, droneIds: [], catalogModelId: null },
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

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const drones = [
  { id: U(1), modell: 'DJI Matrice 350 RTK' },
  { id: U(2), modell: 'Matrice 4T' },
  { id: U(3), modell: 'Matrice 4E' },
  { id: U(4), modell: 'M30T' },
  { id: U(5), modell: 'M4TD' },
];
const catalog = [{ id: U(10), name: 'Matrice 4TD' }, { id: U(11), name: 'Matrice 400' }];

Deno.test('Matrice 350 RTK matches DJI Matrice 350 RTK', () => {
  const m = suggestAircraftMatches({ manufacturer: 'DJI', model: 'Matrice 350 RTK' }, drones, catalog);
  assertEquals(m.droneIds, [U(1)]);
  assertEquals(m.confidence, 'high');
});

Deno.test('Matrice 4 Series matches Matrice 4T, 4E and M4TD', () => {
  const m = suggestAircraftMatches({ manufacturer: 'DJI', model: 'Matrice 4 Series' }, drones, catalog);
  assertEquals(m.droneIds, [U(2), U(3), U(5)]);
  assertEquals(m.catalogModelId, U(10));
});

Deno.test('Matrice 400 does not match Matrice 4T', () => {
  const m = suggestAircraftMatches({ manufacturer: 'DJI', model: 'Matrice 400' }, drones, catalog);
  assertEquals(m.droneIds, []);
  assertEquals(m.catalogModelId, U(11));
});

Deno.test('M30T matches nothing in the SORA list', () => {
  for (const model of ['Matrice 350 RTK', 'Matrice 400', 'Matrice 4 Series']) {
    const m = suggestAircraftMatches({ manufacturer: 'DJI', model }, [{ id: U(4), modell: 'M30T' }], []);
    assertEquals(m.droneIds, []);
  }
});

Deno.test('sanitizer keeps only valid uuids', () => {
  const p = sanitizeSoraProfile({ aircraft: [{ droneIds: [U(1), 'x', U(1)], catalogModelId: 'nope' }], ground: { mitigations: { m2: { equipmentIds: ['bad', U(2)] } } } });
  assertEquals(p.aircraft[0].droneIds, [U(1)]);
  assertEquals(p.aircraft[0].catalogModelId, null);
  assertEquals(p.ground.mitigations.m2.equipmentIds, [U(2)]);
});

Deno.test('OSO robustness "M" → Medium, "NR" → None', () => {
  const p = sanitizeSoraProfile({ oso: [{ id: 'OSO#08', robustness: 'M' }, { id: 'OSO#01', robustness: 'NR' }] });
  assertEquals(p.oso[0].robustness, 'Medium');
  assertEquals(p.oso[1].robustness, 'None');
});

Deno.test('TMPR "No requirement" → None and flagged against ARC-b', () => {
  const p = reference();
  const s = sanitizeSoraProfile({ ...p, air: { ...p.air, tmpr: 'No requirement' } });
  assertEquals(s.air.tmpr, 'None');
  assertEquals(checkSoraProfileConsistency(s).some((i) => i.field === 'air.tmpr'), true);
});
