import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { evaluateSoraProfile } from '../_shared/soraProfileEvaluation.ts';
import { emptySoraProfile } from '../_shared/soraProfile.ts';
import { calculateDroneAggregatedStatus, linkedReasonsNotOnMission } from './maintenanceStatus.ts';
import { applyOperationCategoryText } from './consistency.ts';
import { classifyOperation } from './operationCategory.ts';
import { decideApproval } from './approval.ts';

const evalOp = (op: 'VLOS' | 'EVLOS' | 'BVLOS' | null, isVlos: boolean | null) => {
  const p = emptySoraProfile();
  p.envelope.operationType = op;
  p.envelope.maxHeightM = 120;
  p.envelope.maxPopulationDensity = 500;
  p.ground.mitigations.m1a = { robustness: 'Low', reduction: -1, conditionText: null };
  p.aircraft = [{ manufacturer: 'DJI', model: 'M350', type: 'multirotor', maxDimensionM: 1.43, maxSpeedMps: 23, mtomKg: 9.2, droneIds: ['d1'], catalogModelId: null }];
  return evaluateSoraProfile(p, {
    lang: 'no', drones: [{ id: 'd1', model: 'M350', weightKg: 9.2 }], heightM: 100, isVlos,
    densityPerKm2: 100, m1cEligible: false, equipmentIds: [], igrc: 5, controlledMinimum: null,
    residualArc: null, maxRouteDistanceM: null, adjacentAvgDensity: null,
  });
};
const opDev = (r: ReturnType<typeof evalOp>) => r.deviations.some((d) => d.code === 'OPERATION_TYPE_EXCEEDED');

Deno.test('BVLOS profile + VLOS mission → no deviation, covered note', () => {
  const r = evalOp('BVLOS', true);
  assert(!opDev(r));
  assert(r.notes.includes('VLOS-flyging er dekket av BVLOS-SORA-en.'));
  assert(r.appliedMitigations.length > 0);
});
Deno.test('BVLOS profile + BVLOS mission → no deviation, no note', () => {
  const r = evalOp('BVLOS', false);
  assert(!opDev(r));
  assert(!r.notes.some((n) => n.includes('dekket av BVLOS')));
});
Deno.test('EVLOS profile + VLOS mission → no deviation', () => assert(!opDev(evalOp('EVLOS', true))));
Deno.test('EVLOS profile + BVLOS mission → OPERATION_TYPE_EXCEEDED, no profile credit', () => {
  const r = evalOp('EVLOS', false);
  assert(opDev(r));
  assertEquals(r.appliedMitigations.length, 0);
});
Deno.test('VLOS profile + VLOS mission → no deviation', () => assert(!opDev(evalOp('VLOS', true))));
Deno.test('VLOS profile + BVLOS mission → OPERATION_TYPE_EXCEEDED', () => assert(opDev(evalOp('VLOS', false))));
Deno.test('unknown profile type → note, not deviation', () => {
  const r = evalOp(null, true);
  assert(!opDev(r));
  assert(r.notes.some((n) => n.startsWith('Operasjonstype') && n.includes('kunne ikke kontrolleres')));
});
Deno.test('unknown mission type → note, not deviation', () => {
  const r = evalOp('VLOS', null);
  assert(!opDev(r));
  assert(r.notes.some((n) => n.startsWith('Operasjonstype')));
});
Deno.test('OPERATION_TYPE_EXCEEDED stops auto-approval with status unchanged', () => {
  const r = evalOp('VLOS', false);
  const d = decideApproval({
    lang: 'no', currentStatus: 'not_approved', score: 7.5, threshold: 7.0, autoApprovalOn: true,
    hardStopTriggered: false, hardStopReason: null, noGoCategories: [], weatherAssessed: true,
    dataAvailability: { population: true, airspace: true, weather: true }, assessmentSaved: true, canWrite: true,
    soraEnvelopeDeviation: r.deviations.length > 0,
  } as any);
  assertEquals(d.status, null);
});

Deno.test('battery linked to drone AND selected on mission → no linked-only note', () => {
  const r = calculateDroneAggregatedStatus({ status: 'Grønn', neste_inspeksjon: '2099-01-01' } as any, [], [{ id: 'bat-1', navn: 'Batteri 1', status: 'Rød' }]);
  assertEquals(r.linkedReasonItems.length, 1);
  assertEquals(linkedReasonsNotOnMission(r.linkedReasonItems, new Set(['bat-1'])), []);
  assertEquals(linkedReasonsNotOnMission(r.linkedReasonItems, new Set()).length, 1);
});

Deno.test('category text comes only from classifyOperation reasons', () => {
  const c = classifyOperation({ isVlos: false, flightHeightM: 150, hasSoraDocument: true, lang: 'no' });
  const a = applyOperationCategoryText({ operation_classification: { reasoning: 'C2-drone i A2', open_category_rules: ['A2'] } }, c, 'no');
  assertEquals(a.operation_classification.reasoning, 'Spesifikk kategori fordi: BVLOS, Flyhøyde over 120 m, SORA-dokument valgt på oppdraget.');
  assertEquals(a.operation_classification.open_category_rules, ['BVLOS', 'Flyhøyde over 120 m', 'SORA-dokument valgt på oppdraget']);
  assertEquals(a.operation_classification.category, 'Specific');
});
