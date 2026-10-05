// Resolves flight height and VLOS/BVLOS from pilot inputs with the mission
// (NOTAM fields) as fallback. Never falls back to 0 m.

export const FT_TO_M = 0.3048;
export const DEFAULT_FLIGHT_HEIGHT_M = 120;

export interface MissionFlightFields {
  notam_max_agl_ft?: number | string | null;
  notam_operation_type?: string | null;
}

export interface ResolvedFlightInputs {
  heightM: number;
  heightSource: 'pilot' | 'notam' | 'default';
  isVlos: boolean;
  vlosSource: 'pilot' | 'notam' | 'default';
  note: string | null;
}

const positive = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const missionHeightM = (mission: MissionFlightFields | null | undefined): number | null => {
  const ft = positive(mission?.notam_max_agl_ft);
  return ft === null ? null : Math.round(ft * FT_TO_M);
};

export const missionIsVlos = (mission: MissionFlightFields | null | undefined): boolean | null => {
  const t = String(mission?.notam_operation_type ?? '').trim().toUpperCase();
  if (!t) return null;
  return t !== 'BVLOS';
};

export const resolveFlightInputs = (
  pilotInputs: { flightHeight?: unknown; isVlos?: unknown } | null | undefined,
  mission: MissionFlightFields | null | undefined,
  lang: 'no' | 'en' = 'no',
): ResolvedFlightInputs => {
  const pilotHeight = positive(pilotInputs?.flightHeight);
  const notamHeight = missionHeightM(mission);
  let heightM: number;
  let heightSource: ResolvedFlightInputs['heightSource'];
  let note: string | null = null;
  if (pilotHeight !== null) { heightM = pilotHeight; heightSource = 'pilot'; }
  else if (notamHeight !== null) { heightM = notamHeight; heightSource = 'notam'; }
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
  else {
    const fromMission = missionIsVlos(mission);
    if (fromMission !== null) { isVlos = fromMission; vlosSource = 'notam'; }
    else { isVlos = true; vlosSource = 'default'; }
  }

  return { heightM, heightSource, isVlos, vlosSource, note };
};
