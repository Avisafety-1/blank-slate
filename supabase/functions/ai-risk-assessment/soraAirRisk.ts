// SORA Annex C — Air Risk (AEC / ARC) tables. Deno copy of src/lib/soraAirRisk.ts.

export type ArcLevel = "ARC-a" | "ARC-b" | "ARC-c" | "ARC-d";

export interface AecRow {
  aec: number;
  density: number;
  arc: ArcLevel;
  environment: string;
  environmentNo: string;
}

export const AEC_TABLE: AecRow[] = [
  { aec: 1, density: 5, arc: "ARC-d", environment: "Airport/heliport environment in Class B, C or D airspace", environmentNo: "Flyplass-/heliportmiljø i klasse B, C eller D" },
  { aec: 6, density: 3, arc: "ARC-c", environment: "Airport/heliport environment in Class E, F or G airspace", environmentNo: "Flyplass-/heliportmiljø i klasse E, F eller G" },
  { aec: 2, density: 5, arc: "ARC-d", environment: "OPS >500ft AGL but <FL600 in a Mode-S Veil or TMZ", environmentNo: ">500 ft AGL, <FL600, Mode-S Veil eller TMZ" },
  { aec: 3, density: 5, arc: "ARC-d", environment: "OPS >500ft AGL but <FL600 in controlled airspace", environmentNo: ">500 ft AGL, <FL600, kontrollert luftrom" },
  { aec: 4, density: 3, arc: "ARC-c", environment: "OPS >500ft AGL but <FL600 in uncontrolled airspace over urban area", environmentNo: ">500 ft AGL, <FL600, ukontrollert luftrom over urbant område" },
  { aec: 5, density: 2, arc: "ARC-c", environment: "OPS >500ft AGL but <FL600 in uncontrolled airspace over rural area", environmentNo: ">500 ft AGL, <FL600, ukontrollert luftrom over landlig område" },
  { aec: 7, density: 3, arc: "ARC-c", environment: "OPS <500ft AGL in a Mode-S Veil or TMZ", environmentNo: "<500 ft AGL, Mode-S Veil eller TMZ" },
  { aec: 8, density: 3, arc: "ARC-c", environment: "OPS <500ft AGL in controlled airspace", environmentNo: "<500 ft AGL, kontrollert luftrom" },
  { aec: 9, density: 2, arc: "ARC-c", environment: "OPS <500ft AGL in uncontrolled airspace over urban area", environmentNo: "<500 ft AGL, ukontrollert luftrom over urbant område" },
  { aec: 10, density: 1, arc: "ARC-b", environment: "OPS <500ft AGL in uncontrolled airspace over rural area", environmentNo: "<500 ft AGL, ukontrollert luftrom over landlig område" },
  { aec: 11, density: 1, arc: "ARC-b", environment: "OPS >FL600", environmentNo: "Operasjoner over FL600" },
  { aec: 12, density: 1, arc: "ARC-a", environment: "OPS in Atypical/Segregated airspace", environmentNo: "Atypisk/segregert luftrom" },
];

export const getAecRow = (aec?: number | string | null): AecRow | null => {
  const n = typeof aec === "number" ? aec : parseInt(String(aec ?? "").replace(/[^0-9]/g, ""), 10);
  if (!Number.isFinite(n)) return null;
  return AEC_TABLE.find((r) => r.aec === n) ?? null;
};

export interface ArcReductionOption {
  demonstratedDensities: number[];
  residualArc: ArcLevel;
}

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
  10: [],
  11: [],
  12: [],
};

export const residualArcForDensity = (
  aec?: string | number | null,
  density?: number | null,
): ArcLevel | null => {
  const row = getAecRow(aec);
  if (!row || density == null) return null;
  const option = (ARC_REDUCTION_TABLE[row.aec] ?? []).find((o) => o.demonstratedDensities.includes(density));
  return option ? option.residualArc : null;
};

export const FL600_M = 18288;
export const FT500_M = 152.4;

export interface AecInput {
  flightHeightM?: number | null;
  insideControlledAirspace?: boolean | null;
  airportEnvironment?: boolean | null;
  airportAirspaceClass?: "B" | "C" | "D" | "E" | "F" | "G" | null;
  modeSVeilOrTmz?: boolean | null;
  urban?: boolean | null;
  atypicalSegregated?: boolean | null;
}

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
