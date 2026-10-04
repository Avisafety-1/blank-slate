import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { countMissionObservers, daysUntilOslo, effectiveObserverCount, osloDateString, osloIsoWithOffset } from './missionContext.ts';

Deno.test('Oslo date rolls over at local midnight (summer time)', () => {
  assertEquals(osloDateString(new Date('2026-10-03T21:59:00Z')), '2026-10-03');
  assertEquals(osloDateString(new Date('2026-10-03T22:01:00Z')), '2026-10-04');
});

Deno.test('Oslo date rolls over at local midnight (winter time)', () => {
  assertEquals(osloDateString(new Date('2026-12-01T22:59:00Z')), '2026-12-01');
  assertEquals(osloDateString(new Date('2026-12-01T23:01:00Z')), '2026-12-02');
});

Deno.test('daysUntil uses Oslo calendar days around midnight', () => {
  const today = osloDateString(new Date('2026-10-03T22:30:00Z'))!; // 00:30 Oslo on 4 Oct
  assertEquals(today, '2026-10-04');
  assertEquals(daysUntilOslo(today, '2026-10-10'), 6);
  assertEquals(daysUntilOslo(today, '2026-10-04'), 0);
  assertEquals(daysUntilOslo(today, '2026-10-01'), -3);
  assertEquals(daysUntilOslo(today, '2026-10-04T21:30:00Z'), 0);
  assertEquals(daysUntilOslo(today, '2026-10-04T22:30:00Z'), 1);
  assertEquals(daysUntilOslo(today, null), null);
});

Deno.test('ISO timestamp carries Oslo offset', () => {
  assertEquals(osloIsoWithOffset(new Date('2026-10-04T07:06:00Z')), '2026-10-04T09:06:00+02:00');
  assertEquals(osloIsoWithOffset(new Date('2026-12-04T07:06:00Z')), '2026-12-04T08:06:00+01:00');
});

Deno.test('observer roles are counted and split', () => {
  const r = countMissionObservers(['Pilot', 'Luftromsobservatør', 'Bakkeobservatør', 'Observer', null]);
  assertEquals(r, { airspace: 1, ground: 1, total: 3 });
  assertEquals(effectiveObserverCount(0, r.total), 3);
  assertEquals(effectiveObserverCount(undefined, 0), 0);
  assertEquals(effectiveObserverCount('2', 1), 2);
});
