// SORA 2.5 intrinsic ground risk (iGRC), ground mitigations and SAIL lookup.
// Pure functions: the single source of truth for iGRC/fGRC/SAIL numbers.

export type Lang = 'no' | 'en';

/** Column limits: the column is the STRICTEST of dimension and speed class. */
export const DIMENSION_LIMITS_M = [1, 3, 8, 20, 40];
export const SPEED_LIMITS_MPS = [25, 35, 75, 120, 200];

/** Row 0 = controlled ground area, rows 1-6 = max population density bands. */
export const POPULATION_BAND_LIMITS = [5, 50, 500, 5000, 50000];

/** SORA 2.5 iGRC table (null = outside the specific category). */
export const IGRC_TABLE: (number | null)[][] = [
  [1, 1, 2, 3, 3],
  [2, 3, 4, 5, 6],
  [3, 4, 5, 6, 7],
  [4, 5, 6, 7, 8],
  [5, 6, 7, 8, 9],
  [6, 7, 8, 9, 10],
  [7, 8, null, null, null],
];

const limitIndex = (limits: number[], value: number): number | null => {
  const v = Number.isFinite(value) ? value : 0;
  const i = limits.findIndex((limit) => v <= limit);
  return i === -1 ? null : i;
};

/** Column index, or null when dimension > 40 m or speed > 200 m/s. */
export const columnIndex = (dimensionM: number, speedMps: number): number | null => {
  const d = limitIndex(DIMENSION_LIMITS_M, dimensionM);
  const s = limitIndex(SPEED_LIMITS_MPS, speedMps);
  if (d === null || s === null) return null;
  return Math.max(d, s);
};

/** Row index. Controlled ground area only when explicitly selected. */
export const populationRowIndex = (densityPerKm2: number, controlled: boolean): number => {
  if (controlled) return 0;
  const d = Number.isFinite(densityPerKm2) ? Math.max(0, densityPerKm2) : 0;
  const i = POPULATION_BAND_LIMITS.findIndex((limit) => d < limit);
  return i === -1 ? 6 : i + 1;
};

const BAND_LABELS: Record<Lang, string[]> = {
  no: [
    'Kontrollert bakkeområde',
    '< 5 personer/km²',
    '< 50 personer/km²',
    '< 500 personer/km²',
    '< 5 000 personer/km²',
    '< 50 000 personer/km²',
    '≥ 50 000 personer/km²',
  ],
  en: [
    'Controlled ground area',
    '< 5 people/km²',
    '< 50 people/km²',
    '< 500 people/km²',
    '< 5,000 people/km²',
    '< 50,000 people/km²',
    '≥ 50,000 people/km²',
  ],
};

export const populationBandLabel = (row: number, lang: Lang = 'no') =>
  BAND_LABELS[lang][Math.min(Math.max(row, 0), 6)];

export const columnLabel = (col: number | null, lang: Lang = 'no') =>
  col === null
    ? (lang === 'en' ? '> 40 m / > 200 m/s' : '> 40 m / > 200 m/s')
    : `≤ ${DIMENSION_LIMITS_M[col]} m / ≤ ${SPEED_LIMITS_MPS[col]} m/s`;

export interface IgrcInput {
  dimensionM: number;
  speedMps: number;
  weightKg: number | null;
  densityPerKm2: number;
  controlled: boolean;
}

export interface IgrcResult {
  igrc: number | null;
  column: number | null;
  row: number;
  /** iGRC of the controlled-ground row for the same column (M1 floor). */
  controlledMinimum: number | null;
  outsideSora: boolean;
}

export const computeIgrc = (input: IgrcInput): IgrcResult => {
  const column = columnIndex(input.dimensionM, input.speedMps);
  const row = populationRowIndex(input.densityPerKm2, input.controlled);
  if (column === null) {
    return { igrc: null, column, row, controlledMinimum: null, outsideSora: true };
  }
  const controlledMinimum = IGRC_TABLE[0][column];
  // ≤ 250 g and ≤ 25 m/s: iGRC 1 (not in the ≥ 50 000 band).
  if (input.weightKg !== null && input.weightKg <= 0.25 && input.speedMps <= 25 && row < 6) {
    return { igrc: 1, column, row, controlledMinimum: Math.min(1, controlledMinimum ?? 1), outsideSora: false };
  }
  const igrc = IGRC_TABLE[row][column];
  return { igrc, column, row, controlledMinimum, outsideSora: igrc === null };
};

// ---------- Ground mitigations ----------

export type MitigationKey =
  | 'm1a_sheltering'
  | 'm1b_operational_restrictions'
  | 'm1c_ground_observation'
  | 'm2_impact_reduction';

/** SORA robustness matrix (null = N/A for that mitigation). */
export const MITIGATION_MATRIX: Record<MitigationKey, Record<string, number | null>> = {
  m1a_sheltering: { None: 0, Low: -1, Medium: -2, High: null },
  m1b_operational_restrictions: { None: 0, Low: null, Medium: -1, High: -2 },
  m1c_ground_observation: { None: 0, Low: -1, Medium: null, High: null },
  m2_impact_reduction: { None: 0, Low: null, Medium: -1, High: -2 },
};

export const MITIGATION_KEYS = Object.keys(MITIGATION_MATRIX) as MitigationKey[];

export const normalizeRobustness = (value?: string | null): string => {
  const v = String(value ?? '').toLowerCase();
  if (v.startsWith('high') || v.startsWith('høy')) return 'High';
  if (v.startsWith('med')) return 'Medium';
  if (v.startsWith('low') || v.startsWith('lav')) return 'Low';
  return 'None';
};

export type ManualMitigations = Record<string, { applicable?: boolean; robustness?: string | null } | undefined> | null | undefined;

export const manualReduction = (manual: ManualMitigations, key: MitigationKey): number | null => {
  if (!manual || typeof manual !== 'object') return null;
  const entry = (manual as any)[key];
  if (!entry) return null;
  if (!entry.applicable) return 0;
  return MITIGATION_MATRIX[key][normalizeRobustness(entry.robustness)] ?? 0;
};

export interface MitigationResult {
  effective: Record<MitigationKey, number>;
  totalReduction: number;
  fgrc: number | null;
}

/**
 * Apply ground mitigations. Only M1(C) is credited automatically (observers);
 * M2 is never credited automatically — only via documented manual selection.
 * fGRC cannot fall below the controlled-ground-area value for the column.
 */
export const applyGroundMitigations = ({
  igrc,
  controlledMinimum,
  manual,
  profile,
  autoM1c = 0,
}: {
  igrc: number | null;
  controlledMinimum: number | null;
  manual?: ManualMitigations;
  /** Defaults from a confirmed SORA profile (inside its envelope). Priority: manual > profile > auto-M1C. */
  profile?: Partial<Record<MitigationKey, number>> | null;
  autoM1c?: number;
}): MitigationResult => {
  const pick = (key: MitigationKey, fallback: number) => manualReduction(manual, key) ?? profile?.[key] ?? fallback;
  const effective: Record<MitigationKey, number> = {
    m1a_sheltering: pick('m1a_sheltering', 0),
    m1b_operational_restrictions: pick('m1b_operational_restrictions', 0),
    m1c_ground_observation: pick('m1c_ground_observation', autoM1c),
    m2_impact_reduction: pick('m2_impact_reduction', 0),
  };
  const totalReduction = Object.values(effective).reduce((sum, r) => sum + r, 0);
  if (igrc === null) return { effective, totalReduction, fgrc: null };
  const fgrc = Math.max(controlledMinimum ?? 1, igrc + totalReduction);
  return { effective, totalReduction, fgrc };
};

/** Parachute/impact-reduction equipment registered on the mission — hint only. */
export const hasParachuteHint = (equipment: any[] = []) =>
  (equipment || []).some((e) =>
    /fallskjerm|parachute|moc\s*2512|dvr|design verification/i.test(
      `${e?.navn ?? ''} ${e?.type ?? ''} ${e?.beskrivelse ?? ''}`,
    ),
  );

// ---------- SAIL ----------

const SAIL_MATRIX: Record<string, Record<string, string>> = {
  '2': { a: 'I', b: 'II', c: 'IV', d: 'VI' },
  '3': { a: 'II', b: 'II', c: 'IV', d: 'VI' },
  '4': { a: 'III', b: 'III', c: 'IV', d: 'VI' },
  '5': { a: 'IV', b: 'IV', c: 'IV', d: 'VI' },
  '6': { a: 'V', b: 'V', c: 'V', d: 'VI' },
  '7': { a: 'VI', b: 'VI', c: 'VI', d: 'VI' },
};

export interface SailResult {
  sail: string | null;
  certified: boolean;
}

/** SAIL from fGRC and ARC letter (a-d). fGRC > 7 → certified category, no SAIL. */
export const lookupSail = (fgrc: number | null, arc: string | null): SailResult => {
  if (fgrc === null || !Number.isFinite(fgrc)) return { sail: null, certified: false };
  if (fgrc > 7) return { sail: null, certified: true };
  if (!arc) return { sail: null, certified: false };
  const row = fgrc <= 2 ? '2' : String(Math.round(fgrc));
  return { sail: SAIL_MATRIX[row]?.[arc] ?? null, certified: false };
};

export const certifiedCategoryText = (lang: Lang) =>
  lang === 'en'
    ? 'Certified category — not within specific/SORA'
    : 'Sertifisert kategori — ikke innenfor specific/SORA';

export const outsideSpecificText = (lang: Lang) =>
  lang === 'en'
    ? 'Outside the specific category (certified category)'
    : 'Utenfor specific-kategorien (sertifisert kategori)';
