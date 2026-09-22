import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { deriveIpPrecipitationObservation } from './ipPrecipitation.ts';

Deno.test('skipped weather also skips IP assessment', () => {
  assertEquals(deriveIpPrecipitationObservation({ lang: 'no', skipped: true, precipitation: 4, ipRating: 'IP55', sourceStatus: 'documented' }), null);
});

Deno.test('no precipitation reports documented rating without a concern', () => {
  const result = deriveIpPrecipitationObservation({ lang: 'no', skipped: false, precipitation: 0, ipRating: 'IP55', sourceStatus: 'documented' });
  assert(result?.actualCondition.includes('IP55'));
  assertEquals(result?.concern, null);
});

Deno.test('unknown rating is informational alongside existing precipitation warning', () => {
  const result = deriveIpPrecipitationObservation({ lang: 'no', skipped: false, precipitation: 0.7, precipitationMax: 1.1, periodHours: 3, sourceStatus: 'not_documented' });
  assert(result?.actualCondition.includes('Ikke dokumentert'));
  assert(result?.concern?.includes('utløser ikke hard stop'));
});

Deno.test('documented rating retains manufacturer limitation without inventing a threshold', () => {
  const result = deriveIpPrecipitationObservation({ lang: 'en', skipped: false, precipitation: 3, precipitationMin: 1, precipitationMax: 3, periodHours: 2, ipRating: 'IP55', sourceStatus: 'documented', manufacturerLimitation: 'The rating excludes propulsion.' });
  assert(result?.actualCondition.includes('1–3 mm/t'));
  assert(result?.concern?.includes('excludes propulsion'));
  assert(result?.concern?.includes('does not create a hard stop'));
});

Deno.test('precipitation never produces a hard-stop field', () => {
  const result = deriveIpPrecipitationObservation({ lang: 'en', skipped: false, precipitation: 100, ipRating: 'IP43', sourceStatus: 'documented' });
  assertEquals(Object.hasOwn(result ?? {}, 'hardStop'), false);
});