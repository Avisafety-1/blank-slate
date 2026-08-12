/**
 * SORA Annex C — Air Risk (AEC / ARC) tables.
 *
 * Table 1: Operational Environment, AEC and initial ARC.
 * Table 2: Initial ARC reduction based on demonstrated local density.
 *
 * Reference: JARUS SORA Annex C v1.0, pages 12-13.
 */

export type ArcLevel = "ARC-a" | "ARC-b" | "ARC-c" | "ARC-d";

export interface AecRow {
  /** AEC number 1-12 */
  aec: number;
  /** Column A — initial generalised density rating (1-5) */
  density: number;
  /** Column B — initial ARC */
  arc: ArcLevel;
  /** Environment description (English, used as fallback) */
  environment: string;
}

/** Annex C, Table 1 */
export const AEC_TABLE: AecRow[] = [
  { aec: 1, density: 5, arc: "ARC-d", environment: "Airport/heliport environment in Class B, C or D airspace" },
  { aec: 6, density: 3, arc: "ARC-c", environment: "Airport/heliport environment in Class E airspace or in Class F or G" },
  { aec: 2, density: 5, arc: "ARC-d", environment: "OPS >500ft AGL but <FL600 in a Mode-S Veil or TMZ" },
  { aec: 3, density: 5, arc: "ARC-d", environment: "OPS >500ft AGL but <FL600 in controlled airspace" },
  { aec: 4, density: 3, arc: "ARC-c", environment: "OPS >500ft AGL but <FL600 in uncontrolled airspace over urban area" },
  { aec: 5, density: 2, arc: "ARC-c", environment: "OPS >500ft AGL but <FL600 in uncontrolled airspace over rural area" },
  { aec: 7, density: 3, arc: "ARC-c", environment: "OPS <500ft AGL in a Mode-S Veil or TMZ" },
  { aec: 8, density: 3, arc: "ARC-c", environment: "OPS <500ft AGL in controlled airspace" },
  { aec: 9, density: 2, arc: "ARC-c", environment: "OPS <500ft AGL in uncontrolled airspace over urban area" },
  { aec: 10, density: 1, arc: "ARC-b", environment: "OPS <500ft AGL in uncontrolled airspace over rural area" },
  { aec: 11, density: 1, arc: "ARC-b", environment: "OPS >FL600" },
  { aec: 12, density: 1, arc: "ARC-a", environment: "OPS in Atypical/Segregated airspace" },
];

export const getAecRow = (aec?: number | string | null): AecRow | null => {
  const n = typeof aec === "number" ? aec : parseInt(String(aec ?? "").replace(/[^0-9]/g, ""), 10);
  if (!Number.isFinite(n)) return null;
  return AEC_TABLE.find((r) => r.aec === n) ?? null;
};

export const parseAecNumber = (aec?: string | number | null): number | null => {
  const row = getAecRow(aec);
  return row ? row.aec : null;
};

export interface ArcReductionOption {
  /** Column C — density ratings that must be demonstrated */
  demonstratedDensities: number[];
  /** Column D — resulting residual ARC */
  residualArc: ArcLevel;
}

/** Annex C, Table 2 — allowed reductions per AEC */
export const ARC_REDUCTION_TABLE: Record<number, ArcReductionOption[]> = {
  1: [
    { demonstratedDensities: [4, 3], residualArc: "ARC-c" },
    { demonstratedDensities: [2, 1], residualArc: "ARC-b" },
  ],
  2: [
    { demonstratedDensities: [4, 3], residualArc: "ARC-c" },
    { demonstratedDensities: [2, 1], residualArc: "ARC-b" },
  ],
  3: [
    { demonstratedDensities: [3, 2], residualArc: "ARC-c" },
    { demonstratedDensities: [1], residualArc: "ARC-b" },
  ],
  4: [{ demonstratedDensities: [1], residualArc: "ARC-b" }],
  5: [{ demonstratedDensities: [1], residualArc: "ARC-b" }],
  6: [{ demonstratedDensities: [1], residualArc: "ARC-b" }],
  7: [{ demonstratedDensities: [1], residualArc: "ARC-b" }],
  8: [{ demonstratedDensities: [1], residualArc: "ARC-b" }],
  9: [{ demonstratedDensities: [1], residualArc: "ARC-b" }],
  // AEC 10 / 11: no table reduction — only ARC-a via Atypical/Segregated (Annex G 3.20(d))
  10: [],
  11: [],
  12: [],
};

export const allowedArcReductions = (aec?: string | number | null): ArcReductionOption[] => {
  const n = parseAecNumber(aec);
  if (n == null) return [];
  return ARC_REDUCTION_TABLE[n] ?? [];
};

/** Residual ARC resulting from a demonstrated density rating, or null if not allowed. */
export const residualArcForDensity = (
  aec?: string | number | null,
  density?: number | null
): ArcLevel | null => {
  if (density == null) return null;
  const option = allowedArcReductions(aec).find((o) => o.demonstratedDensities.includes(density));
  return option ? option.residualArc : null;
};

/** All density ratings (5..1) with whether they are selectable for this AEC. */
export const densityOptions = (
  aec?: string | number | null
): { density: number; residualArc: ArcLevel | null }[] =>
  [5, 4, 3, 2, 1].map((density) => ({ density, residualArc: residualArcForDensity(aec, density) }));

export const arcRank = (arc?: string | null): number => {
  const m = String(arc ?? "").toLowerCase().match(/arc-?\s*([abcd])/);
  if (!m) return -1;
  return { a: 0, b: 1, c: 2, d: 3 }[m[1] as "a" | "b" | "c" | "d"];
};

export const normalizeArc = (arc?: string | null): ArcLevel | null => {
  const s = String(arc ?? "").toLowerCase();
  // "ARC-c", "arc c", "ARCc" → c. Never match the "a" inside the word "arc".
  const m = s.match(/arc-?\s*([abcd])/) ?? s.match(/^\s*([abcd])\s*$/);
  return m ? (`ARC-${m[1]}` as ArcLevel) : null;
};

/**
 * Deterministic AEC assignment from operational facts (Annex C Table 1).
 * Heights are in metres AGL; 500 ft AGL ≈ 152 m.
 */
export interface AecInput {
  flightHeightM?: number | null;
  insideControlledAirspace?: boolean | null;
  airportEnvironment?: boolean | null;
  /** Airport/heliport environment airspace class, if known */
  airportAirspaceClass?: "B" | "C" | "D" | "E" | "F" | "G" | null;
  modeSVeilOrTmz?: boolean | null;
  urban?: boolean | null;
  atypicalSegregated?: boolean | null;
}

export const FL600_M = 18288; // FL600 ≈ 60 000 ft
export const FT500_M = 152.4;

export const deriveAec = (input: AecInput): AecRow => {
  const h = Number(input.flightHeightM ?? 0);

  if (input.atypicalSegregated) return getAecRow(12)!;
  if (Number.isFinite(h) && h > FL600_M) return getAecRow(11)!;

  if (input.airportEnvironment) {
    const cls = input.airportAirspaceClass ?? (input.insideControlledAirspace ? "D" : "G");
    return cls === "B" || cls === "C" || cls === "D" ? getAecRow(1)! : getAecRow(6)!;
  }

  const above500 = Number.isFinite(h) && h > FT500_M;
  if (above500) {
    if (input.modeSVeilOrTmz) return getAecRow(2)!;
    if (input.insideControlledAirspace) return getAecRow(3)!;
    return input.urban ? getAecRow(4)! : getAecRow(5)!;
  }

  if (input.modeSVeilOrTmz) return getAecRow(7)!;
  if (input.insideControlledAirspace) return getAecRow(8)!;
  return input.urban ? getAecRow(9)! : getAecRow(10)!;
};
