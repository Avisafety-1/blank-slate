import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { countBatteries, describeBatteries } from './batteryCount.ts';
import { deriveFogAdvisory } from './fog.ts';
import { buildSystemDecisions } from './systemDecisions.ts';
import { buildDecisionSentence, enforceConsistency, withDecisionSentence } from './consistency.ts';

const hardStopInput = {
  lang: 'no' as const,
  skipWeather: false,
  weatherCurrent: { wind_speed: 4, wind_gust: 6, temperature: 12, fog_area_fraction: 0, symbol: 'cloudy' },
  weatherLimits: { maxWindSpeedMs: 10, maxWindGustMs: 15, minTempC: -10, maxTempC: 40 },
  equipmentReason: null,
  assignedPilotCount: 1,
  competencyReason: null,
  daysSinceLastFlight: 5,
  maxPilotInactivityDays: 30,
  flightHeightM: 100,
  maxFlightAltitudeM: 120,
  isVlos: true,
  allowBvlos: false,
  allowNightFlight: true,
  requireCivilTwilight: false,
  civilTwilightViolation: false,
  populationDensity: 100,
  maxPopulationDensity: 500,
  observerCount: 1,
  requireObserver: false,
};

const bat = (id: string, navn = `Batteri ${id}`) => ({ id, navn, type: 'Batteri' });

const baseInput = {
  hardStopInput,
  requireBackupBattery: true,
  missionEquipment: [bat('a'), bat('b')],
  primaryDroneLinkedEquipment: [],
  maxVisibilityKm: 3,
  groundRisk: { igrc: 4, fgrc: 3, outside_sora: false },
  airRisk: { aec: 'AEC 10', initial_arc: 'ARC-b', residual_arc: 'ARC-b' },
  alos: { alosMaxM: 500 },
  equipment: { primaryDroneStatus: 'Grønn', redItems: [], yellowItems: [], linkedOnlyNotes: [] },
  dataAvailability: { population: true, airspace: true, weather: true },
  airspace: { inside5km: false, insideControlled: false, requiresNinox: false, atcConfirmed: false },
};

Deno.test('battery count: 0, 1, 2 and dedupe', () => {
  assertEquals(countBatteries([], []).count, 0);
  assertEquals(countBatteries([bat('a')], []).count, 1);
  assertEquals(countBatteries([bat('a')], [bat('b')]).count, 2);
  const same = countBatteries([bat('a')], [bat('a')]);
  assertEquals(same.count, 1);
  assertEquals(same.batteries[0].sources, ['mission', 'drone']);
  assertEquals(countBatteries([{ id: 'x', navn: 'Kamera', type: 'Kamera' }], []).count, 0);
  assertEquals(countBatteries([{ id: 'y', navn: 'TB65', type: 'battery' }], []).count, 1);
  assert(describeBatteries(same.batteries, 'no').includes('valgt på oppdraget, koblet til dronen'));
});

Deno.test('backup battery hard stop below 2 batteries', () => {
  for (const [eq, expectStop] of [[[], true], [[bat('a')], true], [[bat('a'), bat('b')], false]] as const) {
    const d = buildSystemDecisions({ ...baseInput, missionEquipment: [...eq] });
    assertEquals(d.hardStops.some((r) => r.code === 'backup_battery'), expectStop);
  }
  const d = buildSystemDecisions({ ...baseInput, missionEquipment: [bat('a')], primaryDroneLinkedEquipment: [bat('a')] });
  assertEquals(d.hardStopReason, 'Selskapet krever reservebatteri, men oppdraget har bare 1 batteri(er).');
  assertEquals(d.hardStopCategories, ['equipment']);
});

Deno.test('backup battery not required → no stop', () => {
  const d = buildSystemDecisions({ ...baseInput, requireBackupBattery: false, missionEquipment: [] });
  assertEquals(d.hardStopTriggered, false);
});

Deno.test('fog advisory by fraction or symbol, never a hard stop', () => {
  assertEquals(deriveFogAdvisory({ skipWeather: false, current: { fog_area_fraction: 10, symbol: 'cloudy' }, maxVisibilityKm: 3, lang: 'no' }), null);
  assertEquals(deriveFogAdvisory({ skipWeather: false, current: { fog_area_fraction: 60 }, maxVisibilityKm: 3, lang: 'no' })?.text,
    'Tåke meldt — kontroller sikt mot selskapets grense (3 km) før flyging');
  assertEquals(deriveFogAdvisory({ skipWeather: false, current: { fog_area_fraction: null, symbol: 'fog' }, maxVisibilityKm: null, lang: 'no' })?.text,
    'Tåke meldt — kontroller sikt mot selskapets grense før flyging');
  assertEquals(deriveFogAdvisory({ skipWeather: true, current: { symbol: 'fog' }, maxVisibilityKm: 3, lang: 'no' }), null);
  const d = buildSystemDecisions({ ...baseInput, hardStopInput: { ...hardStopInput, weatherCurrent: { ...hardStopInput.weatherCurrent, fog_area_fraction: 80 } } });
  assert(d.fog !== null);
  assertEquals(d.hardStopTriggered, false);
});

Deno.test('SAIL from fGRC and residual ARC; fGRC 8 → certified', () => {
  assertEquals(buildSystemDecisions(baseInput).sail, 'SAIL II');
  const d = buildSystemDecisions({ ...baseInput, groundRisk: { igrc: 9, fgrc: 8, outside_sora: false } });
  assertEquals(d.sail, null);
  assertEquals(d.certifiedCategory, true);
});

Deno.test('wind hard stop flows through system decisions', () => {
  const d = buildSystemDecisions({ ...baseInput, hardStopInput: { ...hardStopInput, weatherCurrent: { ...hardStopInput.weatherCurrent, wind_speed: 14 } } });
  assertEquals(d.hardStopCategories, ['weather']);
});

Deno.test('consistency: hard stop category ≤ 3, overall ≤ 4.9, AI NO-GO without stop → BETINGET', () => {
  const a = enforceConsistency({
    overall_score: 7.2,
    categories: {
      weather: { score: 8, go_decision: 'GO' },
      airspace: { score: 4, go_decision: 'NO-GO', concerns: ['x'] },
    },
  }, new Set(['weather']), true);
  assertEquals(a.categories.weather, { score: 3, go_decision: 'NO-GO' });
  assertEquals(a.categories.airspace.go_decision, 'BETINGET');
  assertEquals(a.categories.airspace.concerns, ['x']);
  assertEquals(a.overall_score, 4.9);
  const b = enforceConsistency({ overall_score: 7, categories: {} }, [], false);
  assertEquals(b.overall_score, 7);
});

Deno.test('summary starts with fixed decision sentence', () => {
  const s1 = buildDecisionSentence({ recommendation: 'no-go', overallScore: 2, hardStopReason: 'Vind for høy.', hardStopTriggered: true, lang: 'no' });
  assertEquals(s1, 'Anbefaling: NO-GO — hard stop: Vind for høy.');
  assertEquals(buildDecisionSentence({ recommendation: 'caution', overallScore: 6.25, hardStopReason: null, hardStopTriggered: false, lang: 'no' }),
    'Anbefaling: Forsiktighet (AI-score 6,3/10).');
  assertEquals(buildDecisionSentence({ recommendation: 'go', overallScore: 8, hardStopReason: null, hardStopTriggered: false, lang: 'en' }),
    'Recommendation: GO (AI score 8.0/10).');
  const summary = withDecisionSentence('Oppdraget er enkelt.', s1);
  assert(summary.startsWith(s1));
  assertEquals(withDecisionSentence(summary, s1), summary);
});
