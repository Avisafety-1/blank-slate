// SORA document profile: shared schema, sanitizer and deterministic consistency check.
// Used by the app (via src/lib/soraProfile.ts) and the extract-sora-profile edge function.
// Tables are imported from ai-risk-assessment so numbers never drift.
import { computeIgrc, MITIGATION_MATRIX, lookupSail, type MitigationKey } from '../ai-risk-assessment/soraGroundRisk.ts';
import { getAecRow } from '../ai-risk-assessment/soraAirRisk.ts';

export type Robustness = 'None' | 'Low' | 'Medium' | 'High';
export const ROBUSTNESS: Robustness[] = ['None', 'Low', 'Medium', 'High'];
export const OPERATION_TYPES = ['VLOS', 'EVLOS', 'BVLOS'] as const;
export const ARC_LEVELS = ['ARC-a', 'ARC-b', 'ARC-c', 'ARC-d'] as const;
export const SAIL_LEVELS = ['I', 'II', 'III', 'IV', 'V', 'VI'] as const;

export interface SoraMitigation {
  robustness: Robustness | null;
  reduction: number | null;
  conditionText: string | null;
}
export interface SoraAircraft {
  manufacturer: string | null;
  model: string | null;
  type: string | null;
  maxDimensionM: number | null;
  maxSpeedMps: number | null;
  mtomKg: number | null;
}
export interface SoraProfile {
  soraVersion: string | null;
  soraType: 'generic' | 'specific' | null;
  operatingArea: string | null;
  envelope: {
    maxHeightM: number | null;
    maxSpeedMps: number | null;
    /** Upper limit of the population band, i.e. "< X people/km²". */
    maxPopulationDensity: number | null;
    operationType: 'VLOS' | 'EVLOS' | 'BVLOS' | null;
    maxDistanceFromPilotM: number | null;
    controlledGroundArea: boolean | null;
  };
  aircraft: SoraAircraft[];
  ground: {
    igrc: number | null;
    fgrc: number | null;
    mitigations: {
      m1a: SoraMitigation;
      m1b: SoraMitigation;
      m1c: SoraMitigation & { requiresObserver: boolean | null };
      m2: SoraMitigation & { requiredEquipmentText: string | null };
    };
  };
  air: {
    scenario: string | null;
    initialArc: string | null;
    aec: number | null;
    strategicReductions: string[];
    residualArc: string | null;
    tmpr: Robustness | null;
  };
  sail: string | null;
  containment: {
    robustness: Robustness | null;
    adjacentAreaKm: number | null;
    maxAdjacentDensity: number | null;
    shelterApplicable: boolean | null;
    maxAssembly: string | null;
  };
  buffers: { cvHorizontalM: number | null; cvVerticalM: number | null; groundRiskBufferM: number | null };
  oso: { id: string; robustness: Robustness | null }[];
  pages: Record<string, number>;
}

export interface ConsistencyIssue {
  field: string;
  documentValue: string | number | null;
  calculated: string | number | null;
}

const emptyMitigation = (): SoraMitigation => ({ robustness: null, reduction: null, conditionText: null });

export const emptyAircraft = (): SoraAircraft => ({
  manufacturer: null, model: null, type: null, maxDimensionM: null, maxSpeedMps: null, mtomKg: null,
});

export const emptySoraProfile = (): SoraProfile => ({
  soraVersion: null,
  soraType: null,
  operatingArea: null,
  envelope: {
    maxHeightM: null, maxSpeedMps: null, maxPopulationDensity: null,
    operationType: null, maxDistanceFromPilotM: null, controlledGroundArea: null,
  },
  aircraft: [],
  ground: {
    igrc: null,
    fgrc: null,
    mitigations: {
      m1a: emptyMitigation(),
      m1b: emptyMitigation(),
      m1c: { ...emptyMitigation(), requiresObserver: true },
      m2: { ...emptyMitigation(), requiredEquipmentText: null },
    },
  },
  air: { scenario: null, initialArc: null, aec: null, strategicReductions: [], residualArc: null, tmpr: null },
  sail: null,
  containment: { robustness: null, adjacentAreaKm: null, maxAdjacentDensity: null, shelterApplicable: null, maxAssembly: null },
  buffers: { cvHorizontalM: null, cvVerticalM: null, groundRiskBufferM: null },
  oso: [],
  pages: {},
});

// ---------- sanitizing (AI output and stored JSON are untrusted) ----------

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.').replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown, max = 2000): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : null);
const oneOf = <T extends string>(v: unknown, values: readonly T[]): T | null => {
  const s = str(v);
  if (!s) return null;
  return values.find((x) => x.toLowerCase() === s.toLowerCase()) ?? null;
};
export const normalizeArc = (v: unknown): string | null => {
  const m = String(v ?? '').match(/(?:arc[\s-]*)?([a-d])\b/i);
  return m ? `ARC-${m[1].toLowerCase()}` : null;
};
export const normalizeSail = (v: unknown): string | null => {
  const s = String(v ?? '').toUpperCase().replace(/SAIL/, '').trim();
  const roman = SAIL_LEVELS.find((x) => x === s);
  if (roman) return roman;
  const n = parseInt(s, 10);
  return n >= 1 && n <= 6 ? SAIL_LEVELS[n - 1] : null;
};
const mitigation = (v: any): SoraMitigation => ({
  robustness: oneOf(v?.robustness, ROBUSTNESS),
  reduction: num(v?.reduction),
  conditionText: str(v?.conditionText),
});

export const sanitizeSoraProfile = (raw: any): SoraProfile => {
  const p = raw && typeof raw === 'object' ? raw : {};
  const e = p.envelope ?? {};
  const g = p.ground ?? {};
  const m = g.mitigations ?? {};
  const a = p.air ?? {};
  const c = p.containment ?? {};
  const b = p.buffers ?? {};
  const pages: Record<string, number> = {};
  if (p.pages && typeof p.pages === 'object') {
    for (const [k, v] of Object.entries(p.pages)) {
      const n = num(v);
      if (n !== null && n >= 1 && n <= 1000 && k.length < 120) pages[k] = Math.round(n);
    }
  }
  return {
    soraVersion: str(p.soraVersion, 40),
    soraType: oneOf(p.soraType, ['generic', 'specific'] as const),
    operatingArea: str(p.operatingArea),
    envelope: {
      maxHeightM: num(e.maxHeightM),
      maxSpeedMps: num(e.maxSpeedMps),
      maxPopulationDensity: num(e.maxPopulationDensity),
      operationType: oneOf(e.operationType, OPERATION_TYPES),
      maxDistanceFromPilotM: num(e.maxDistanceFromPilotM),
      controlledGroundArea: bool(e.controlledGroundArea),
    },
    aircraft: (Array.isArray(p.aircraft) ? p.aircraft : []).slice(0, 30).map((d: any) => ({
      manufacturer: str(d?.manufacturer, 120),
      model: str(d?.model, 120),
      type: str(d?.type, 120),
      maxDimensionM: num(d?.maxDimensionM),
      maxSpeedMps: num(d?.maxSpeedMps),
      mtomKg: num(d?.mtomKg),
    })),
    ground: {
      igrc: num(g.igrc),
      fgrc: num(g.fgrc),
      mitigations: {
        m1a: mitigation(m.m1a),
        m1b: mitigation(m.m1b),
        m1c: { ...mitigation(m.m1c), requiresObserver: bool(m.m1c?.requiresObserver) ?? true },
        m2: { ...mitigation(m.m2), requiredEquipmentText: str(m.m2?.requiredEquipmentText) },
      },
    },
    air: {
      scenario: str(a.scenario),
      initialArc: normalizeArc(a.initialArc),
      aec: num(a.aec),
      strategicReductions: (Array.isArray(a.strategicReductions) ? a.strategicReductions : [])
        .map((s: unknown) => str(s, 500)).filter(Boolean).slice(0, 30) as string[],
      residualArc: normalizeArc(a.residualArc),
      tmpr: oneOf(a.tmpr, ROBUSTNESS),
    },
    sail: normalizeSail(p.sail),
    containment: {
      robustness: oneOf(c.robustness, ROBUSTNESS),
      adjacentAreaKm: num(c.adjacentAreaKm),
      maxAdjacentDensity: num(c.maxAdjacentDensity),
      shelterApplicable: bool(c.shelterApplicable),
      maxAssembly: str(c.maxAssembly, 200),
    },
    buffers: {
      cvHorizontalM: num(b.cvHorizontalM),
      cvVerticalM: num(b.cvVerticalM),
      groundRiskBufferM: num(b.groundRiskBufferM),
    },
    oso: (Array.isArray(p.oso) ? p.oso : []).slice(0, 40)
      .map((o: any) => ({ id: str(o?.id, 20) ?? '', robustness: oneOf(o?.robustness, ROBUSTNESS) }))
      .filter((o: { id: string }) => o.id),
    pages,
  };
};

// ---------- deterministic consistency check ----------

const MITIGATION_KEYS: Record<'m1a' | 'm1b' | 'm1c' | 'm2', MitigationKey> = {
  m1a: 'm1a_sheltering',
  m1b: 'm1b_operational_restrictions',
  m1c: 'm1c_ground_observation',
  m2: 'm2_impact_reduction',
};

const TMPR_BY_ARC: Record<string, Robustness> = { 'ARC-a': 'None', 'ARC-b': 'Low', 'ARC-c': 'Medium', 'ARC-d': 'High' };

/** Reductions are always negative; documents may write "1" or "-1". */
const asReduction = (n: number | null) => (n === null ? null : -Math.abs(n));

export const checkSoraProfileConsistency = (profile: SoraProfile): ConsistencyIssue[] => {
  const issues: ConsistencyIssue[] = [];
  const g = profile.ground;

  // a) iGRC for the strictest drone (largest dimension / speed) and max population band.
  const dims = profile.aircraft.map((d) => d.maxDimensionM).filter((n): n is number => n !== null);
  const speeds = profile.aircraft.map((d) => d.maxSpeedMps).filter((n): n is number => n !== null);
  const weights = profile.aircraft.map((d) => d.mtomKg).filter((n): n is number => n !== null);
  const density = profile.envelope.maxPopulationDensity;
  const controlled = profile.envelope.controlledGroundArea === true;
  let calcIgrc: number | null = null;
  let controlledMinimum: number | null = null;
  if (dims.length > 0 && speeds.length > 0 && (density !== null || controlled)) {
    const result = computeIgrc({
      dimensionM: Math.max(...dims),
      speedMps: Math.max(...speeds),
      weightKg: weights.length === profile.aircraft.length && weights.length > 0 ? Math.max(...weights) : null,
      // The profile stores the band's upper limit ("< X"); evaluate just inside that band.
      densityPerKm2: Math.max(0, (density ?? 0) - 0.001),
      controlled,
    });
    calcIgrc = result.igrc;
    controlledMinimum = result.controlledMinimum;
    if (g.igrc !== null && calcIgrc !== null && g.igrc !== calcIgrc) {
      issues.push({ field: 'ground.igrc', documentValue: g.igrc, calculated: calcIgrc });
    }
  }

  // b) Reduction per mitigation must match the robustness matrix; fGRC = max(floor, iGRC + sum).
  let sum = 0;
  let allKnown = true;
  for (const [short, key] of Object.entries(MITIGATION_KEYS) as [keyof typeof MITIGATION_KEYS, MitigationKey][]) {
    const mit = g.mitigations[short];
    const docReduction = asReduction(mit.reduction);
    if (mit.robustness) {
      const expected = MITIGATION_MATRIX[key][mit.robustness];
      if (expected === null) {
        issues.push({ field: `ground.mitigations.${short}.robustness`, documentValue: mit.robustness, calculated: null });
        allKnown = false;
      } else {
        if (docReduction !== null && docReduction !== expected) {
          issues.push({ field: `ground.mitigations.${short}.reduction`, documentValue: docReduction, calculated: expected });
        }
        sum += expected;
      }
    } else if (docReduction !== null && docReduction !== 0) {
      sum += docReduction;
    }
  }
  const baseIgrc = g.igrc ?? calcIgrc;
  if (allKnown && baseIgrc !== null && g.fgrc !== null) {
    const expectedFgrc = Math.max(controlledMinimum ?? 1, baseIgrc + sum);
    if (expectedFgrc !== g.fgrc) issues.push({ field: 'ground.fgrc', documentValue: g.fgrc, calculated: expectedFgrc });
  }

  // e) Initial ARC must match the AEC.
  const aecRow = getAecRow(profile.air.aec);
  if (aecRow && profile.air.initialArc && aecRow.arc !== profile.air.initialArc) {
    issues.push({ field: 'air.initialArc', documentValue: profile.air.initialArc, calculated: aecRow.arc });
  }

  // c) SAIL from fGRC and residual ARC.
  const residual = profile.air.residualArc;
  if (g.fgrc !== null && residual && profile.sail) {
    const { sail, certified } = lookupSail(g.fgrc, residual.slice(-1));
    const calc = certified ? 'certified' : sail;
    if (calc && calc !== profile.sail) issues.push({ field: 'sail', documentValue: profile.sail, calculated: calc });
  }

  // d) TMPR must fit the residual ARC.
  if (residual && profile.air.tmpr) {
    const expected = TMPR_BY_ARC[residual];
    if (expected && expected !== profile.air.tmpr) {
      issues.push({ field: 'air.tmpr', documentValue: profile.air.tmpr, calculated: expected });
    }
  }

  return issues;
};
