// Evaluates a CONFIRMED SORA document profile against deterministic mission facts.
// Pure: the profile only gives default ground mitigations inside its envelope.
// Deviations are information/recommendation — never a hard stop or NO-GO —
// but they block automatic approval (see ai-risk-assessment/approval.ts).
import {
  applyGroundMitigations,
  lookupSail,
  MITIGATION_MATRIX,
  type ManualMitigations,
  type MitigationKey,
} from './soraGroundRisk.ts';
import type { SoraProfile } from './soraProfile.ts';

type Lang = 'no' | 'en';

export type SoraDeviationCode =
  | 'DRONE_NOT_COVERED'
  | 'HEIGHT_EXCEEDED'
  | 'DENSITY_EXCEEDED'
  | 'DISTANCE_EXCEEDED'
  | 'ARC_EXCEEDED'
  | 'FGRC_EXCEEDED'
  | 'SAIL_EXCEEDED'
  | 'ADJACENT_DENSITY_EXCEEDED'
  | 'OPERATION_TYPE_EXCEEDED';

export interface SoraDeviation {
  code: SoraDeviationCode;
  text: string;
  actual: string | number | null;
  limit: string | number | null;
}

export interface AppliedMitigation {
  key: MitigationKey;
  robustness: string;
  reduction: number;
  text: string;
}

export interface SoraProfileFacts {
  lang: Lang;
  drones: { id: string; model: string | null; weightKg: number | null }[];
  heightM: number | null;
  /** From flightInputs.isVlos: true = VLOS, false = BVLOS; null/undefined = unknown. */
  isVlos?: boolean | null;
  /** Max population density used for iGRC; null when unknown. */
  densityPerKm2: number | null;
  m1cEligible: boolean;
  equipmentIds: string[];
  igrc: number | null;
  controlledMinimum: number | null;
  residualArc: string | null;
  /** AEC manually declared/overridden for the mission (e.g. 12 atypical); null when derived. */
  declaredAec?: number | null;
  /** Max distance from the first route point; null without a route. */
  maxRouteDistanceM: number | null;
  /** Average density in the adjacent area; null without documentation. */
  adjacentAvgDensity: number | null;
  manual?: ManualMitigations;
  autoM1c?: number;
}

export interface SoraProfileEvaluation {
  state: 'within_envelope' | 'outside_envelope';
  deviations: SoraDeviation[];
  appliedMitigations: AppliedMitigation[];
  /** Reductions per key credited from the profile (for applyGroundMitigations). */
  profileReductions: Partial<Record<MitigationKey, number>>;
  notes: string[];
  fgrc: number | null;
  sail: string | null;
}

const BLOCKING: SoraDeviationCode[] = ['DRONE_NOT_COVERED', 'HEIGHT_EXCEEDED', 'DENSITY_EXCEEDED', 'OPERATION_TYPE_EXCEEDED'];
// Profile operation type covers every type at or below its rank.
const OP_RANK: Record<string, number> = { VLOS: 0, EVLOS: 1, BVLOS: 2 };
const SAILS = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const arcLetter = (v: unknown): string | null => {
  const m = String(v ?? '').match(/arc[\s-]*([a-d])/i) ?? String(v ?? '').match(/^\s*([a-d])\s*$/i);
  return m ? m[1].toLowerCase() : null;
};
const sailIndex = (v: unknown): number => {
  const m = String(v ?? '').toUpperCase().match(/\b(VI|IV|V|III|II|I)\b/);
  return m ? SAILS.indexOf(m[1]) : -1;
};
const fin = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const LABELS: Record<MitigationKey, string> = {
  m1a_sheltering: 'M1(A)',
  m1b_operational_restrictions: 'M1(B)',
  m1c_ground_observation: 'M1(C)',
  m2_impact_reduction: 'M2',
};

export const evaluateSoraProfile = (profile: SoraProfile, facts: SoraProfileFacts): SoraProfileEvaluation => {
  const en = facts.lang === 'en';
  const deviations: SoraDeviation[] = [];
  const notes: string[] = [];
  const unchecked = (what: string) => notes.push(en ? `${what} could not be checked.` : `${what} kunne ikke kontrolleres.`);
  const add = (code: SoraDeviationCode, no: string, enText: string, actual: string | number | null, limit: string | number | null) =>
    deviations.push({ code, text: en ? enText : no, actual, limit });
  const env = profile.envelope ?? ({} as SoraProfile['envelope']);
  const aircraft = Array.isArray(profile.aircraft) ? profile.aircraft : [];
  const rowFor = (droneId: string) => aircraft.find((a) => Array.isArray(a.droneIds) && a.droneIds.includes(droneId));

  // a) Envelope. Coverage is decided ONLY by droneIds (no text matching).
  if (facts.drones.length === 0) unchecked(en ? 'Drone coverage (no drone on the mission)' : 'Dronedekning (ingen drone på oppdraget)');
  for (const d of facts.drones) {
    if (!rowFor(d.id)) {
      const label = d.model ?? 'Drone';
      add('DRONE_NOT_COVERED', `${label} er ikke dekket av SORA-profilen`, `${label} is not covered by the SORA profile`, label, null);
    }
  }
  const profOp = env.operationType ?? null;
  const missionOp = facts.isVlos === true ? 'VLOS' : facts.isVlos === false ? 'BVLOS' : null;
  if (!profOp || !missionOp) unchecked(en ? 'Operation type (VLOS/EVLOS/BVLOS)' : 'Operasjonstype (VLOS/EVLOS/BVLOS)');
  else if (OP_RANK[missionOp] > OP_RANK[profOp]) add('OPERATION_TYPE_EXCEEDED', `${missionOp}-flyging er ikke dekket av ${profOp}-SORA-en`, `${missionOp} flight is not covered by the ${profOp} SORA`, missionOp, profOp);
  else if (profOp === 'BVLOS' && missionOp === 'VLOS') notes.push(en ? 'VLOS flight is covered by the BVLOS SORA.' : 'VLOS-flyging er dekket av BVLOS-SORA-en.');
  const maxH = fin(env.maxHeightM);
  if (maxH === null || facts.heightM === null) unchecked(en ? 'Flight height' : 'Flyhøyde');
  else if (facts.heightM > maxH) add('HEIGHT_EXCEEDED', `Flyhøyde ${facts.heightM} m er over SORA-rammen ${maxH} m`, `Flight height ${facts.heightM} m exceeds the SORA limit ${maxH} m`, facts.heightM, maxH);

  const maxD = fin(env.maxPopulationDensity);
  if (maxD === null || facts.densityPerKm2 === null) unchecked(en ? 'Population density' : 'Befolkningstetthet');
  else if (facts.densityPerKm2 >= maxD) add('DENSITY_EXCEEDED', `Befolkningstetthet ${facts.densityPerKm2}/km² er ikke under SORA-rammen < ${maxD}/km²`, `Population density ${facts.densityPerKm2}/km² is not below the SORA limit < ${maxD}/km²`, facts.densityPerKm2, maxD);

  const maxDist = fin(env.maxDistanceFromPilotM);
  if (maxDist === null || facts.maxRouteDistanceM === null) unchecked(en ? 'Distance from pilot (no route or no limit)' : 'Avstand fra pilot (ingen rute eller ingen grense)');
  else if (facts.maxRouteDistanceM > maxDist) add('DISTANCE_EXCEEDED', `Ruten går ${Math.round(facts.maxRouteDistanceM)} m fra startpunktet, over SORA-rammen ${maxDist} m`, `The route reaches ${Math.round(facts.maxRouteDistanceM)} m from the start point, above the SORA limit ${maxDist} m`, Math.round(facts.maxRouteDistanceM), maxDist);

  const maxAdj = fin(profile.containment?.maxAdjacentDensity);
  if (maxAdj === null || facts.adjacentAvgDensity === null) unchecked(en ? 'Adjacent area density' : 'Tetthet i tilstøtende område');
  else if (facts.adjacentAvgDensity > maxAdj) add('ADJACENT_DENSITY_EXCEEDED', `Snittetthet i tilstøtende område ${Math.round(facts.adjacentAvgDensity)}/km² er over SORA-rammen ${maxAdj}/km²`, `Average adjacent-area density ${Math.round(facts.adjacentAvgDensity)}/km² exceeds the SORA limit ${maxAdj}/km²`, Math.round(facts.adjacentAvgDensity), maxAdj);

  // b) Reductions — only inside the envelope.
  const blocked = deviations.some((d) => BLOCKING.includes(d.code));
  const profileReductions: Partial<Record<MitigationKey, number>> = {};
  const appliedMitigations: AppliedMitigation[] = [];
  if (blocked) {
    notes.push(en ? 'Outside the SORA envelope — no reductions credited from the profile.' : 'Utenfor SORA-rammene — ingen reduksjoner kreditert fra profilen.');
  } else {
    const m = profile.ground?.mitigations;
    const credit = (key: MitigationKey, robustness: string | null | undefined) => {
      const r = robustness ?? null;
      if (!r || r === 'None') return;
      const reduction = MITIGATION_MATRIX[key][r];
      if (reduction == null || reduction === 0) return;
      profileReductions[key] = reduction;
      appliedMitigations.push({ key, robustness: r, reduction, text: `${LABELS[key]} ${r} ${reduction} ${en ? 'from SORA' : 'fra SORA'}` });
    };
    if (m?.m1a?.robustness && m.m1a.robustness !== 'None') {
      const weights = facts.drones.map((d) => fin(rowFor(d.id)?.mtomKg) ?? fin(d.weightKg));
      if (weights.length === 0 || weights.some((w) => w === null)) {
        notes.push(en ? 'M1(A) not credited: MTOM unknown for a drone on the mission.' : 'M1(A) ikke kreditert: MTOM ukjent for en drone på oppdraget.');
      } else if (weights.every((w) => (w as number) < 25)) credit('m1a_sheltering', m.m1a.robustness);
      else notes.push(en ? 'M1(A) not credited: MTOM is 25 kg or more.' : 'M1(A) ikke kreditert: MTOM er 25 kg eller mer.');
    }
    credit('m1b_operational_restrictions', m?.m1b?.robustness);
    if (m?.m1c?.robustness && m.m1c.robustness !== 'None') {
      if (m.m1c.requiresObserver === false || facts.m1cEligible) credit('m1c_ground_observation', m.m1c.robustness);
      else notes.push(en ? 'M1(C) requires an observer — not credited.' : 'M1(C) forutsetter observatør – ikke kreditert.');
    }
    if (m?.m2?.robustness && m.m2.robustness !== 'None') {
      const ids = Array.isArray(m.m2.equipmentIds) ? m.m2.equipmentIds : [];
      if (ids.some((id) => facts.equipmentIds.includes(id))) credit('m2_impact_reduction', m.m2.robustness);
      else notes.push(en ? 'M2 not credited: the required equipment is not on the mission.' : 'M2 ikke kreditert: påkrevd utstyr er ikke registrert på oppdraget.');
    }
  }

  // fGRC/SAIL with the final reductions (manual > profile > auto-M1C).
  const { fgrc } = applyGroundMitigations({
    igrc: facts.igrc,
    controlledMinimum: facts.controlledMinimum,
    manual: facts.manual,
    profile: profileReductions,
    autoM1c: facts.autoM1c ?? 0,
  });
  const arc = arcLetter(facts.residualArc);
  const sailRes = lookupSail(fgrc, arc);

  const profArc = arcLetter(profile.air?.residualArc);
  if (!arc || !profArc) unchecked('ARC');
  else if (arc > profArc) add('ARC_EXCEEDED', `Residual ARC-${arc} er over SORA-profilens ARC-${profArc}`, `Residual ARC-${arc} exceeds the SORA profile's ARC-${profArc}`, `ARC-${arc}`, `ARC-${profArc}`);

  const profAec = fin(profile.air?.aec);
  const decl = fin(facts.declaredAec);
  if (decl !== null && profAec !== null && decl !== profAec) {
    notes.push(en
      ? `Air risk is based on declared AEC ${decl}, while the SORA profile assumes AEC ${profAec} – check that the declaration is covered by the SORA.`
      : `Luftrisiko bygger på erklært AEC ${decl}, mens SORA-profilen forutsetter AEC ${profAec} – kontroller at erklæringen er dekket av SORA-en.`);
  }

  const profFgrc = fin(profile.ground?.fgrc);
  if (fgrc === null || profFgrc === null) unchecked('fGRC');
  else if (fgrc > profFgrc) add('FGRC_EXCEEDED', `fGRC ${fgrc} er over SORA-profilens ${profFgrc}`, `fGRC ${fgrc} exceeds the SORA profile's ${profFgrc}`, fgrc, profFgrc);

  const profSail = sailIndex(profile.sail);
  const calcSail = sailIndex(sailRes.sail);
  if (profSail < 0 || calcSail < 0) unchecked('SAIL');
  else if (calcSail > profSail) add('SAIL_EXCEEDED', `SAIL ${SAILS[calcSail]} er over SORA-profilens SAIL ${SAILS[profSail]}`, `SAIL ${SAILS[calcSail]} exceeds the SORA profile's SAIL ${SAILS[profSail]}`, SAILS[calcSail], SAILS[profSail]);

  return {
    state: deviations.length > 0 ? 'outside_envelope' : 'within_envelope',
    deviations,
    appliedMitigations,
    profileReductions,
    notes,
    fgrc,
    sail: sailRes.sail,
  };
};

/** Max planar distance (m) from the first route point; null without ≥ 2 points. */
export const maxDistanceFromFirstPoint = (coords: { lat: number; lng: number }[] | null | undefined): number | null => {
  const pts = (coords ?? []).filter((c) => Number.isFinite(c?.lat) && Number.isFinite(c?.lng));
  if (pts.length < 2) return null;
  const [a] = pts;
  let max = 0;
  for (const b of pts) {
    const avgLat = ((a.lat + b.lat) / 2) * Math.PI / 180;
    const dx = (b.lng - a.lng) * 111320 * Math.cos(avgLat);
    const dy = (b.lat - a.lat) * 111320;
    max = Math.max(max, Math.sqrt(dx * dx + dy * dy));
  }
  return max;
};

/** A stored profile is only usable when confirmed, current and in the document's company. */
export const isProfileUsable = (
  row: { status?: string | null; source_file_url?: string | null; company_id?: string | null } | null,
  doc: { fil_url?: string | null; company_id?: string | null } | null,
): boolean =>
  !!row && !!doc && row.status === 'confirmed' && !!doc.fil_url &&
  row.source_file_url === doc.fil_url && row.company_id === doc.company_id;
