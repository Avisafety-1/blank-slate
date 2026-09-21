import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { deriveHardStops, joinHardStopReasons, preserveAuthoritativeHardStop, removeHardStopClaims } from './hardStops.ts';

const base = {
  lang: 'no' as const,
  skipWeather: false,
  weatherCurrent: { wind_speed: 4, wind_gust: 6, temperature: 12, precipitation: 0 },
  weatherLimits: { maxWindSpeedMs: 10, maxWindGustMs: 15, minTempC: -10, maxTempC: 40 },
  equipmentReason: null,
  assignedPilotCount: 1,
  validCompetencyCount: 1,
  daysSinceLastFlight: 5,
  maxPilotInactivityDays: 30,
  flightHeightM: 120,
  maxFlightAltitudeM: 120,
  isVlos: true,
  allowBvlos: false,
  allowNightFlight: true,
  requireCivilTwilight: false,
  civilTwilightViolation: false,
  populationDensity: 100,
  maxPopulationDensity: 500,
  observerCount: 1,
  requireObserver: true,
};

Deno.test('returns only the active pilot stop', () => {
  const reasons = deriveHardStops({ ...base, validCompetencyCount: 0 });
  assertEquals(reasons.map((reason) => reason.code), ['pilot_competency']);
  assertEquals(joinHardStopReasons(reasons), 'Tildelt pilot mangler gyldig registrert kompetanse.');
});

Deno.test('keeps multiple active stops without airspace diagnostics', () => {
  const reasons = deriveHardStops({
    ...base,
    weatherCurrent: { ...base.weatherCurrent, wind_speed: 14 },
    isVlos: false,
    observerCount: 0,
  });
  assertEquals(reasons.map((reason) => reason.code), ['weather_wind', 'bvlos', 'observer']);
  assertEquals(joinHardStopReasons(reasons)?.includes('luftrom'), false);
});

Deno.test('does not create a stop when all measured conditions pass', () => {
  assertEquals(deriveHardStops(base), []);
  assertEquals(joinHardStopReasons([]), null);
});

Deno.test('skipped weather cannot create a weather stop', () => {
  const reasons = deriveHardStops({
    ...base,
    skipWeather: true,
    weatherCurrent: { wind_speed: 40, wind_gust: 50, temperature: 50 },
  });
  assertEquals(reasons, []);
});

Deno.test('missing measurements do not create guessed stops', () => {
  const reasons = deriveHardStops({
    ...base,
    weatherCurrent: null,
    daysSinceLastFlight: null,
    populationDensity: null,
    maxFlightAltitudeM: null,
  });
  assertEquals(reasons, []);
});

Deno.test('null weather fields are treated as missing, not zero', () => {
  const reasons = deriveHardStops({
    ...base,
    weatherCurrent: { wind_speed: null, wind_gust: null, temperature: null, precipitation: null },
  });
  assertEquals(reasons, []);
});

Deno.test('removes model hard-stop claims from the narrative summary', () => {
  assertEquals(
    removeHardStopClaims('Oppdraget har flere tiltak. Ingen 5 km-soner. HARD STOP fordi luftrommet er kontrollert. Resten må verifiseres.'),
    'Oppdraget har flere tiltak. Ingen 5 km-soner. Resten må verifiseres.',
  );
});

Deno.test('SORA reassessment preserves the authoritative initial hard stop', () => {
  assertEquals(
    preserveAuthoritativeHardStop(true, 'Tildelt pilot mangler gyldig registrert kompetanse.'),
    { hard_stop_triggered: true, hard_stop_reason: 'Tildelt pilot mangler gyldig registrert kompetanse.' },
  );
});

Deno.test('SORA reassessment cannot invent a hard stop', () => {
  assertEquals(
    preserveAuthoritativeHardStop(false, 'AI hevdet et nytt stopp'),
    { hard_stop_triggered: false, hard_stop_reason: null },
  );
});