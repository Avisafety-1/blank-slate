import { stripOpenCategoryCompetency } from './consistency.ts';
import { evaluateSoraProfile } from '../_shared/soraProfileEvaluation.ts';
import { sanitizeSoraProfile } from '../_shared/soraProfile.ts';

Deno.test('specific: C-class competency recommendations removed', () => {
  const a = { recommendations: [{ action: 'Pilot bør ha A2-kompetanse' }, { action: 'Sjekk vind' }] };
  stripOpenCategoryCompetency(a);
  if (a.recommendations.length !== 1 || a.recommendations[0].action !== 'Sjekk vind') throw new Error('not stripped');
});

Deno.test('declared AEC differing from profile gives note, not deviation', () => {
  const p = sanitizeSoraProfile({ air: { aec: 10 } });
  const ev = evaluateSoraProfile(p, { lang: 'no', drones: [], heightM: null, densityPerKm2: null, m1cEligible: false, equipmentIds: [], igrc: null, controlledMinimum: null, residualArc: null, declaredAec: 12, maxRouteDistanceM: null, adjacentAvgDensity: null });
  if (!ev.notes.some((n) => n.includes('erklært AEC 12') && n.includes('AEC 10'))) throw new Error('no note');
  if (ev.deviations.length !== 0) throw new Error('deviation');
});
