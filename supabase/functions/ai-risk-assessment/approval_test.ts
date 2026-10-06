import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { decideApproval, type ApprovalDecisionInput } from './approval.ts';

const base = (): ApprovalDecisionInput => ({
  lang: 'no',
  currentStatus: 'not_approved',
  score: 7.5,
  threshold: 7.0,
  autoApprovalOn: true,
  hardStopTriggered: false,
  hardStopReason: null,
  noGoCategories: [],
  weatherAssessed: true,
  dataAvailability: { population: true, airspace: true, weather: true },
  assessmentSaved: true,
  canWrite: true,
});

Deno.test('not_approved + all green + auto on -> approved', () => {
  const d = decideApproval(base());
  assertEquals(d.status, 'approved');
  assertEquals(d.severity, 'info');
});

Deno.test('not_approved + auto off -> unchanged', () => {
  const d = decideApproval({ ...base(), autoApprovalOn: false });
  assertEquals(d.status, null);
  assertEquals(d.reason.includes('Automatisk godkjenning er av'), true);
});

Deno.test('not_approved + score below threshold -> unchanged with reason', () => {
  const d = decideApproval({ ...base(), score: 6.9 });
  assertEquals(d.status, null);
  assertEquals(d.reason.includes('under godkjenningsterskelen'), true);
});

Deno.test('not_approved + hard stop -> unchanged, danger', () => {
  const d = decideApproval({ ...base(), hardStopTriggered: true, hardStopReason: 'Vind er over grensen.' });
  assertEquals(d.status, null);
  assertEquals(d.severity, 'danger');
  assertEquals(d.reason.includes('Vind er over grensen.'), true);
});

Deno.test('not_approved + NO-GO category -> unchanged, danger', () => {
  const d = decideApproval({ ...base(), noGoCategories: ['weather'] });
  assertEquals(d.status, null);
  assertEquals(d.severity, 'danger');
  assertEquals(d.reason.includes('NO-GO i vær'), true);
});

Deno.test('not_approved + weather not assessed -> unchanged', () => {
  const d = decideApproval({ ...base(), weatherAssessed: false });
  assertEquals(d.status, null);
  assertEquals(d.reason.includes('Vær er ikke vurdert'), true);
});

Deno.test('not_approved + missing population data -> unchanged', () => {
  const d = decideApproval({ ...base(), dataAvailability: { population: false, airspace: true, weather: true } });
  assertEquals(d.status, null);
  assertEquals(d.reason.includes('befolkningsdata'), true);
});

Deno.test('not_approved + assessment not saved -> unchanged', () => {
  const d = decideApproval({ ...base(), assessmentSaved: false });
  assertEquals(d.status, null);
  assertEquals(d.reason.includes('ikke lagres'), true);
});

Deno.test('not_approved + no write access -> unchanged with access reason', () => {
  const d = decideApproval({ ...base(), canWrite: false });
  assertEquals(d.status, null);
  assertEquals(d.reason, 'Du har ikke tilgang til å endre godkjenningsstatus.');
});

Deno.test('pending_approval + hard stop -> unchanged with approver reason', () => {
  const d = decideApproval({ ...base(), currentStatus: 'pending_approval', hardStopTriggered: true, hardStopReason: 'Vind.' });
  assertEquals(d.status, null);
  assertEquals(d.severity, 'danger');
  assertEquals(d.reason.includes('godkjenner må ta stilling'), true);
});

Deno.test('pending_approval + NO-GO -> unchanged', () => {
  const d = decideApproval({ ...base(), currentStatus: 'pending_approval', noGoCategories: ['airspace'] });
  assertEquals(d.status, null);
  assertEquals(d.severity, 'danger');
});

Deno.test('pending_approval + low score -> unchanged', () => {
  const d = decideApproval({ ...base(), currentStatus: 'pending_approval', score: 5 });
  assertEquals(d.status, null);
  assertEquals(d.reason.includes('under godkjenningsterskelen'), true);
});

Deno.test('pending_approval + all green + auto on -> approved', () => {
  const d = decideApproval({ ...base(), currentStatus: 'pending_approval' });
  assertEquals(d.status, 'approved');
});

Deno.test('approved is never changed, but hard stop gives a red warning', () => {
  const d = decideApproval({ ...base(), currentStatus: 'approved', hardStopTriggered: true, hardStopReason: 'Vind.' });
  assertEquals(d.status, null);
  assertEquals(d.severity, 'danger');
  assertEquals(d.reason.includes('Oppdraget er godkjent'), true);
});

Deno.test('approved keeps its status when data is missing', () => {
  const d = decideApproval({ ...base(), currentStatus: 'approved', dataAvailability: { population: false, airspace: true, weather: true } });
  assertEquals(d.status, null);
  assertEquals(d.severity, 'info');
});

Deno.test('auto off ignores every status including approved and pending', () => {
  for (const currentStatus of ['approved', 'pending_approval', 'not_approved']) {
    const d = decideApproval({ ...base(), currentStatus, autoApprovalOn: false, hardStopTriggered: true, hardStopReason: 'Vind.' });
    assertEquals(d.status, null);
  }
});

Deno.test('auto off ignores sora_hardstop_requires_approval semantics (no downgrades)', () => {
  const d = decideApproval({ ...base(), autoApprovalOn: false, hardStopTriggered: true, hardStopReason: null });
  assertEquals(d.status, null);
  assertEquals(d.reason.includes('hard stop'), true);
});

Deno.test('English reasons', () => {
  const approved = decideApproval({ ...base(), lang: 'en' });
  assertEquals(approved.reason.startsWith('Automatic approval'), true);
  const denied = decideApproval({ ...base(), lang: 'en', score: 4 });
  assertEquals(denied.reason.includes('below the approval threshold'), true);
  const hard = decideApproval({ ...base(), lang: 'en', currentStatus: 'approved', hardStopTriggered: true, hardStopReason: 'Wind.' });
  assertEquals(hard.reason.startsWith('The mission is approved, but the latest assessment has a hard stop: Wind.'), true);
});

Deno.test('one decimal scores are preserved (6.5 stays 6.5)', () => {
  const d = decideApproval({ ...base(), score: 6.5, threshold: 6.5 });
  assertEquals(d.status, 'approved');
  assertEquals(d.reason.includes('6,5') || d.reason.includes('6.5'), true);
});

Deno.test('fraction scale input is treated as a high score (0.65 -> 6.5)', () => {
  const d = decideApproval({ ...base(), score: 0.65, threshold: 6.5 });
  assertEquals(d.status, null);
});

Deno.test('pending + score 2.0 overall NO-GO without hard stop -> unchanged, danger', () => {
  const d = decideApproval({ ...base(), currentStatus: 'pending_approval', score: 2.0, overallNoGo: true });
  assertEquals(d.status, null);
  assertEquals(d.severity, 'danger');
  assertEquals(d.reason, 'Siste vurdering anbefaler NO-GO (AI-score 2/10) — godkjenner må ta stilling');
});

Deno.test('approved + score 3.0 overall NO-GO -> unchanged, danger', () => {
  const d = decideApproval({ ...base(), currentStatus: 'approved', score: 3.0, overallNoGo: true });
  assertEquals(d.status, null);
  assertEquals(d.severity, 'danger');
  assertEquals(d.reason, 'Oppdraget er godkjent, men siste vurdering anbefaler NO-GO (AI-score 3/10)');
});

Deno.test('not_approved + overall NO-GO never auto-approves (EN text)', () => {
  const d = decideApproval({ ...base(), lang: 'en', score: 9, threshold: 1, overallNoGo: true });
  assertEquals(d.status, null);
  assertEquals(d.severity, 'danger');
  assertEquals(d.reason.startsWith('The latest assessment recommends NO-GO (AI score 9/10)'), true);
});

Deno.test('auto + SORA envelope deviation -> pending_approval, not danger', () => {
  const d = decideApproval({ ...base(), soraEnvelopeDeviation: true });
  assertEquals(d.status, 'pending_approval');
  assertEquals(d.severity, 'warning');
  assertEquals(d.reason, 'Utenfor SORA-rammene – krever manuell godkjenning');
});

Deno.test('approved + SORA envelope deviation -> stays approved', () => {
  const d = decideApproval({ ...base(), currentStatus: 'approved', soraEnvelopeDeviation: true });
  assertEquals(d.status, null);
  assertEquals(d.severity, 'info');
});

Deno.test('no SORA envelope deviation -> unchanged auto-approval', () => {
  assertEquals(decideApproval({ ...base(), soraEnvelopeDeviation: false }).status, 'approved');
});
