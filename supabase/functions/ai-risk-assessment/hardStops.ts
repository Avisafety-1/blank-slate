export type HardStopCategory = 'weather' | 'equipment' | 'pilot_experience' | 'mission_complexity';

export interface HardStopReason {
  code: string;
  category: HardStopCategory;
  text: string;
}

interface HardStopInput {
  lang: 'no' | 'en';
  skipWeather: boolean;
  weatherCurrent: Record<string, unknown> | null;
  weatherLimits: {
    maxWindSpeedMs: number;
    maxWindGustMs: number;
    minTempC: number;
    maxTempC: number;
  };
  equipmentReason?: string | null;
  assignedPilotCount: number;
  validCompetencyCount: number;
  daysSinceLastFlight: number | null;
  maxPilotInactivityDays: number | null;
  flightHeightM: number | null;
  maxFlightAltitudeM: number | null;
  isVlos: boolean;
  allowBvlos: boolean | null;
  allowNightFlight: boolean | null;
  requireCivilTwilight: boolean;
  civilTwilightViolation: boolean;
  populationDensity: number | null;
  maxPopulationDensity: number | null;
  observerCount: number;
  requireObserver: boolean;
}

const finite = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const format = (value: number): string => Number.isInteger(value) ? String(value) : value.toFixed(1);

export const deriveHardStops = (input: HardStopInput): HardStopReason[] => {
  const en = input.lang === 'en';
  const reasons: HardStopReason[] = [];
  const add = (code: string, category: HardStopCategory, no: string, english: string) => {
    reasons.push({ code, category, text: en ? english : no });
  };

  if (!input.skipWeather && input.weatherCurrent) {
    const wind = finite(input.weatherCurrent.wind_speed);
    const gust = finite(input.weatherCurrent.wind_gust);
    const temperature = finite(input.weatherCurrent.temperature);
    if (wind !== null && wind > input.weatherLimits.maxWindSpeedMs) {
      add('weather_wind', 'weather',
        `Middelvind ${format(wind)} m/s overstiger grensen på ${format(input.weatherLimits.maxWindSpeedMs)} m/s`,
        `Mean wind ${format(wind)} m/s exceeds the ${format(input.weatherLimits.maxWindSpeedMs)} m/s limit`);
    }
    if (gust !== null && gust > input.weatherLimits.maxWindGustMs) {
      add('weather_gust', 'weather',
        `Vindkast ${format(gust)} m/s overstiger grensen på ${format(input.weatherLimits.maxWindGustMs)} m/s`,
        `Wind gusts ${format(gust)} m/s exceed the ${format(input.weatherLimits.maxWindGustMs)} m/s limit`);
    }
    if (temperature !== null && temperature < input.weatherLimits.minTempC) {
      add('weather_temperature_low', 'weather',
        `Temperatur ${format(temperature)} °C er under grensen på ${format(input.weatherLimits.minTempC)} °C`,
        `Temperature ${format(temperature)} °C is below the ${format(input.weatherLimits.minTempC)} °C limit`);
    }
    if (temperature !== null && temperature > input.weatherLimits.maxTempC) {
      add('weather_temperature_high', 'weather',
        `Temperatur ${format(temperature)} °C overstiger grensen på ${format(input.weatherLimits.maxTempC)} °C`,
        `Temperature ${format(temperature)} °C exceeds the ${format(input.weatherLimits.maxTempC)} °C limit`);
    }
  }

  if (input.equipmentReason) {
    reasons.push({ code: 'equipment_red', category: 'equipment', text: input.equipmentReason });
  }

  if (input.assignedPilotCount === 0) {
    add('pilot_missing', 'pilot_experience', 'Ingen pilot er tildelt oppdraget', 'No pilot is assigned to the mission');
  } else if (input.validCompetencyCount === 0) {
    add('pilot_competency', 'pilot_experience', 'Tildelt pilot mangler gyldig registrert kompetanse', 'The assigned pilot has no valid registered competency');
  }

  if (
    input.daysSinceLastFlight !== null &&
    input.maxPilotInactivityDays !== null &&
    input.daysSinceLastFlight > input.maxPilotInactivityDays
  ) {
    add('pilot_inactivity', 'pilot_experience',
      `Piloten har ikke flydd på ${input.daysSinceLastFlight} dager; grensen er ${input.maxPilotInactivityDays} dager`,
      `The pilot has not flown for ${input.daysSinceLastFlight} days; the limit is ${input.maxPilotInactivityDays} days`);
  }

  if (
    input.flightHeightM !== null &&
    input.maxFlightAltitudeM !== null &&
    input.flightHeightM > input.maxFlightAltitudeM
  ) {
    add('altitude', 'mission_complexity',
      `Planlagt flygehøyde ${format(input.flightHeightM)} m AGL overstiger grensen på ${format(input.maxFlightAltitudeM)} m`,
      `Planned flight altitude ${format(input.flightHeightM)} m AGL exceeds the ${format(input.maxFlightAltitudeM)} m limit`);
  }

  if (!input.isVlos && input.allowBvlos === false) {
    add('bvlos', 'mission_complexity', 'Oppdraget er BVLOS, men selskapet tillater ikke BVLOS-flyging', 'The mission is BVLOS, but the company does not allow BVLOS flights');
  }

  if (input.civilTwilightViolation && input.allowNightFlight === false) {
    add('night_flight', 'mission_complexity', 'Oppdraget er planlagt utenfor sivil skumring, men selskapet tillater ikke nattflyging', 'The mission is scheduled outside civil twilight, but the company does not allow night flights');
  } else if (input.civilTwilightViolation && input.requireCivilTwilight) {
    add('civil_twilight', 'mission_complexity', 'Oppdraget er planlagt utenfor selskapets krav til sivil skumring', 'The mission is scheduled outside the company civil-twilight requirement');
  }

  if (
    input.populationDensity !== null &&
    input.maxPopulationDensity !== null &&
    input.populationDensity > input.maxPopulationDensity
  ) {
    add('population_density', 'mission_complexity',
      `Befolkningstetthet ${format(input.populationDensity)} personer/km² overstiger grensen på ${format(input.maxPopulationDensity)} personer/km²`,
      `Population density ${format(input.populationDensity)} people/km² exceeds the ${format(input.maxPopulationDensity)} people/km² limit`);
  }

  if (input.requireObserver && input.observerCount < 1) {
    add('observer', 'mission_complexity', 'Antall observatører er 0; selskapet krever minst én', 'The observer count is 0; the company requires at least one');
  }

  return reasons;
};

export const joinHardStopReasons = (reasons: HardStopReason[]): string | null =>
  reasons.length > 0 ? reasons.map((reason) => reason.text.replace(/[.!?]+$/u, '')).join('. ') + '.' : null;

export const removeHardStopClaims = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value
    .split(/(?<=[.!?])\s+/u)
    .filter((sentence) => !/\bhard[ -]?stop\b|\bno-go\b|\bikke anbefalt å fly\b|\bflight not recommended\b/iu.test(sentence))
    .join(' ')
    .trim();
};