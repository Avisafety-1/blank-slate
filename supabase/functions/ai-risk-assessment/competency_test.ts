import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildCompetencyReason, classifyCompetency, evaluateCompetency } from './competency.ts';

const now = new Date('2026-09-24T12:00:00Z');
const row = (navn: string, type = 'Sertifikat', utloper_dato: string | null = null) =>
  ({ profile_id: 'p1', navn, type, utloper_dato });
const run = (rows: any[], droneClass: string | null, proximityToPeople = 'sparsely_populated', isVlos = true) =>
  evaluateCompetency({ rows, pilotIds: ['p1'], droneClass, proximityToPeople, isVlos, now });

Deno.test('classifies spelling variants', () => {
  assertEquals(classifyCompetency('A1A3'), ['A1A3']);
  assertEquals(classifyCompetency('A1, A3 '), ['A1A3']);
  assertEquals(classifyCompetency('A1/A3 drone'), ['A1A3']);
  assertEquals(classifyCompetency('A1/A3 A2 STS').sort(), ['A1A3', 'A2', 'STS01']);
  assertEquals(classifyCompetency('STS-02'), ['STS02']);
});

Deno.test('C0/C1/C3/C4 require only A1/A3', () => {
  for (const c of ['C0', 'C1', 'C3', 'C4']) {
    assertEquals(run([row('A1/A3')], c, 'populated').status, 'ok');
  }
});

Deno.test('C2 requires A2 only near people', () => {
  assertEquals(run([row('A1/A3')], 'C2').status, 'ok');
  const a = run([row('A1/A3')], 'C2', 'populated');
  assertEquals(a.status, 'missing');
  assertEquals(buildCompetencyReason(a, 'no'),
    'Dronen er C2 og flys nær uinvolverte, som krever A2; piloten har kun A1/A3, og ingen operatørgodkjenning dekker operasjonen');
  assertEquals(run([row('A2', 'Kurs')], 'C2', 'populated').status, 'ok');
});

Deno.test('BVLOS needs STS-02 or operator approval', () => {
  assertEquals(run([row('STS')], 'C2', 'sparsely_populated', false).status, 'missing');
  assertEquals(run([row('STS-02')], 'C6', 'sparsely_populated', false).status, 'ok');
  const op = run([row('A1/A3'), row('Operatør godkjenning LT', 'Godkjenning')], 'C2', 'sparsely_populated', false);
  assertEquals(op.status, 'ok');
  assertEquals(op.coveredBy, 'operator_approval');
});

Deno.test('expired does not count, no date counts', () => {
  assertEquals(run([row('A2', 'Sertifikat', '2026-01-01')], 'C2', 'populated').status, 'missing');
  assertEquals(run([row('A2', 'Sertifikat', null)], 'C2', 'populated').status, 'ok');
});

Deno.test('tour and internal courses never satisfy requirements', () => {
  const a = run([row('Opprett oppdrag (kart-flyt)', 'Veiledet tour'), row('AviSafe grunnkurs', 'Kurs')], 'C1');
  assertEquals(a.status, 'missing');
  assertEquals(a.ignored.length, 2);
});

Deno.test('unknown class or unclassified rows are undetermined', () => {
  assertEquals(run([row('A1/A3')], null).status, 'undetermined');
  assertEquals(run([row('A1/A3')], 'C5').status, 'undetermined');
  assertEquals(run([row('Dronepilot (specific category)', 'Sertifikat')], 'C2', 'populated').status, 'undetermined');
});
