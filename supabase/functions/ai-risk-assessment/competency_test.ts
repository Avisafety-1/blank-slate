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

Deno.test('BVLOS under SORA never requires STS and never hard-stops', () => {
  const a = run([row('A2')], 'C2', 'populated', false);
  assertEquals(a.status, 'ok');
  assertEquals(a.coveredBy, 'sora_oso08');
  assertEquals(run([row('A1/A3')], null, 'sparsely_populated', false).status, 'ok');
  assertEquals(run([row('Operatør godkjenning LT', 'Godkjenning')], 'C2', 'sparsely_populated', false).status, 'ok');
  const none = run([], 'C2', 'sparsely_populated', false);
  assertEquals(none.status, 'assumed');
  assertEquals(buildCompetencyReason(none, 'no'), null);
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

Deno.test('jargon is scrubbed and expired rows carry readable codes', async () => {
  const m = await import('./competency.ts');
  assertEquals(m.isCompetencyJargon("Flere 'r4'-sertifikater er utløpt"), true);
  assertEquals(m.isCompetencyJargon('Kompetansevurderingen for BVLOS er uavklart'), true);
  assertEquals(m.isCompetencyJargon('Piloten har gyldig PPL-A'), false);
  const a = m.evaluateCompetency({ rows: [{ type: 'Sertifikat', navn: 'A2', utloper_dato: '2020-01-01' }, { type: 'Kurs', navn: 'R4 intern', utloper_dato: '2020-01-01' }], pilotIds: [], droneClass: 'C6', proximityToPeople: null, isVlos: false });
  assertEquals(a.status, 'assumed');
  assertEquals(a.expired.filter((e) => e.code).map((e) => e.code), ['A2']);
});

Deno.test('summary retains real operational findings and removes orphaned transitions', async () => {
  const { scrubCompetencyText } = await import('./competency.ts');
  assertEquals(scrubCompetencyText('BVLOS kompetanse er uavklart. I tillegg kreves Ninox-godkjenning.'), 'Kreves Ninox-godkjenning.');
  assertEquals(scrubCompetencyText('Oppdraget er betinget på grunn av luftrom og pilotkompetanse. I tillegg kreves klarering.'), 'Oppdraget er betinget på grunn av luftrom og pilotkompetanse. I tillegg kreves klarering.');
  assertEquals(scrubCompetencyText('In addition, airspace clearance is needed.'), 'Airspace clearance is needed.');
});
