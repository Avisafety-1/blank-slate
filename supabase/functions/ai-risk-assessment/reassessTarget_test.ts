import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { checkReassessTarget } from './reassessTarget.ts';

const rows = [
  { id: 'sora2', mission_id: 'm', created_at: '2026-10-03T10:00:00Z', sora_output: {} },
  { id: 'new', mission_id: 'm', created_at: '2026-10-02T10:00:00Z', sora_output: null },
  { id: 'old', mission_id: 'm', created_at: '2026-10-01T10:00:00Z', sora_output: null },
  { id: 'soraOld', mission_id: 'm', created_at: '2026-10-01T12:00:00Z', sora_output: {} },
];

Deno.test('latest base assessment is allowed', () => {
  assertEquals(checkReassessTarget(rows, 'new', 'm').ok, true);
});
Deno.test('SORA row built on the latest base is allowed', () => {
  assertEquals(checkReassessTarget(rows, 'sora2', 'm').ok, true);
});
Deno.test('older assessment is rejected', () => {
  const r = checkReassessTarget(rows, 'old', 'm');
  assertEquals(r.ok ? null : r.reason, 'not_latest');
  const r2 = checkReassessTarget(rows, 'soraOld', 'm');
  assertEquals(r2.ok ? null : r2.reason, 'not_latest');
});
Deno.test('missing id / other mission rejected', () => {
  assertEquals(checkReassessTarget(rows, null, 'm').ok, false);
  assertEquals(checkReassessTarget(rows, 'new', 'x').ok, false);
});
