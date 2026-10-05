// Resolves flight height and VLOS/BVLOS from pilot inputs with the mission
// (NOTAM fields) as fallback. Never falls back to 0 m.

export const DEFAULT_FLIGHT_HEIGHT_M = 120;

// Flyhøyde kommer fra pilotens input eller ruteplanleggeren (meter).
// NOTAM-feltene brukes IKKE i risikovurderingen.
export interface MissionFlightFields {
  route?: { soraSettings?: { flightAltitude?: number | string | null } | null } | null;
}

export interface ResolvedFlightInputs {
  heightM: number;
  heightSource: 'pilot' | 'route' | 'default';
  isVlos: boolean;
  vlosSource: 'pilot' | 'default';
  note: string | null;
}

const positive = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const routeHeightM = (mission: MissionFlightFields | null | undefined): number | null =>
  positive((mission?.route as any)?.soraSettings?.flightAltitude);

export const resolveFlightInputs = (
  pilotInputs: { flightHeight?: unknown; isVlos?: unknown } | null | undefined,
  mission: MissionFlightFields | null | undefined,
  lang: 'no' | 'en' = 'no',
): ResolvedFlightInputs => {
  const pilotHeight = positive(pilotInputs?.flightHeight);
  const routeHeight = routeHeightM(mission);
  let heightM: number;
  let heightSource: ResolvedFlightInputs['heightSource'];
  let note: string | null = null;
  if (pilotHeight !== null) { heightM = pilotHeight; heightSource = 'pilot'; }
  else if (routeHeight !== null) { heightM = routeHeight; heightSource = 'route'; }
  else {
    heightM = DEFAULT_FLIGHT_HEIGHT_M;
    heightSource = 'default';
    note = lang === 'en'
      ? 'Flight height not provided — 120 m assumed'
      : 'Flyhøyde ikke oppgitt — 120 m lagt til grunn';
  }

  let isVlos: boolean;
  let vlosSource: ResolvedFlightInputs['vlosSource'];
  if (typeof pilotInputs?.isVlos === 'boolean') { isVlos = pilotInputs.isVlos; vlosSource = 'pilot'; }
  else { isVlos = true; vlosSource = 'default'; }

  return { heightM, heightSource, isVlos, vlosSource, note };
};
