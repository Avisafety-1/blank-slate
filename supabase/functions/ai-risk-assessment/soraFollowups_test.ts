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

Deno.test('specific: C2-link recommendation kept', () => {
  const a = { recommendations: [{ action: 'Kontroller C2-link og signalstyrke' }] };
  stripOpenCategoryCompetency(a);
  if (a.recommendations.length !== 1) throw new Error('C2-link stripped');
});

Deno.test('specific: C3 link quality (OSO#06) kept', () => {
  const a = { recommendations: [{ action: 'Sjekk C3 link-kvalitet (OSO#06)' }] };
  stripOpenCategoryCompetency(a);
  if (a.recommendations.length !== 1) throw new Error('C3 link stripped');
});

Deno.test('specific: DJI Dock recommendation kept', () => {
  const a = { recommendations: [{ action: 'Verifiser Dock 2 (C2) kommunikasjon' }] };
  stripOpenCategoryCompetency(a);
  if (a.recommendations.length !== 1) throw new Error('Dock stripped');
});

Deno.test('specific: A2 competency removed', () => {
  const a = { recommendations: [{ action: 'Pilot bør ha A2-kompetanse' }] };
  stripOpenCategoryCompetency(a);
  if (a.recommendations.length !== 0) throw new Error('A2 kept');
});

Deno.test('specific: C3-class competency certificate removed', () => {
  const a = { recommendations: [{ action: 'Krever kompetansebevis for C3-klasse' }] };
  stripOpenCategoryCompetency(a);
  if (a.recommendations.length !== 0) throw new Error('C3 competency kept');
});

Deno.test('broken profile does not throw in sanitize/evaluate', () => {
  const p = sanitizeSoraProfile({ aircraft: 'x', envelope: null, ground: null });
  const ev = evaluateSoraProfile(p, { lang: 'no', drones: [], heightM: null, densityPerKm2: null, m1cEligible: false, equipmentIds: [], igrc: null, controlledMinimum: null, residualArc: null, declaredAec: null, maxRouteDistanceM: null, adjacentAvgDensity: null });
  if (!ev || !Array.isArray(ev.deviations) || !Array.isArray(ev.notes)) throw new Error('bad result');
});

Deno.test('broken profile does not throw in resolveSoraProfile', async () => {
  const { resolveSoraProfile } = await import('./systemDecisions.ts');
  const row = { id: 'p1', status: 'confirmed', source_file_url: 'u', company_id: 'c1', profile: { aircraft: 'x', envelope: null, ground: null }, confirmed_at: '2026-01-01' };
  const doc = { id: 'd1', fil_url: 'u', company_id: 'c1' };
  const { result } = resolveSoraProfile(row, doc, { lang: 'no', drones: [], heightM: null, densityPerKm2: null, m1cEligible: false, equipmentIds: [], igrc: null, controlledMinimum: null, residualArc: null, declaredAec: null, maxRouteDistanceM: null, adjacentAvgDensity: null });
  if (!result) throw new Error('no result');
});

Deno.test('SORA-profil ARC-a overstyrer systemets ARC-c uten avvik', () => {
  const p = sanitizeSoraProfile({ air: { residualArc: 'ARC-a' } });
  const ev = evaluateSoraProfile(p, { lang: 'no', drones: [], heightM: null, densityPerKm2: null, m1cEligible: false, equipmentIds: [], igrc: 3, controlledMinimum: null, residualArc: 'ARC-c', declaredAec: null, maxRouteDistanceM: null, adjacentAvgDensity: null });
  if (ev.arcOverride !== true) throw new Error('expected override');
  if (ev.deviations.some((d) => d.code === 'ARC_EXCEEDED')) throw new Error('no ARC deviation expected');
  if (!ev.notes.some((n) => n.includes('Forutsetningene for ARC-a må følges iht. gitt godkjenning'))) throw new Error('note missing');
});
