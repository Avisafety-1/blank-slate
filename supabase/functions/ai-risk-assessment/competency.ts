// Deterministic, lenient ("godtroende") pilot competency check.
// Rank ladder: 1 = A1/A3, 2 = A2, 3 = STS-01, 4 = STS-02 (higher covers lower).
// The engine NEVER produces "missing" from data it cannot interpret — it then
// returns "undetermined" and the AI assesses as before (never as a hard stop).

export type CompetencyCode = 'A1A3' | 'A2' | 'STS01' | 'STS02';
export type CompetencyStatus = 'ok' | 'missing' | 'undetermined';

export interface CompetencyRow {
  profile_id?: string | null;
  type?: string | null;
  navn?: string | null;
  beskrivelse?: string | null;
  utloper_dato?: string | null;
}

export const RANK: Record<CompetencyCode, number> = { A1A3: 1, A2: 2, STS01: 3, STS02: 4 };
const LABEL: Record<number, string> = { 1: 'A1/A3', 2: 'A2', 3: 'STS-01', 4: 'STS-02' };
export const rankLabel = (rank: number | null): string | null => (rank ? LABEL[rank] ?? null : null);

const FORMAL_TYPES = ['sertifikat', 'lisens', 'godkjenning', 'kompetanse', 'utdanning'];

const isExpired = (row: CompetencyRow, now: Date) =>
  !!row.utloper_dato && new Date(row.utloper_dato).getTime() <= now.getTime();

/** Extract recognised rank codes from free text. */
export const classifyCompetency = (text: string): CompetencyCode[] => {
  const t = ` ${text.toUpperCase().replace(/[‐-―]/g, '-')} `;
  const codes = new Set<CompetencyCode>();
  if (/STS[\s-]*0?2\b/.test(t)) codes.add('STS02');
  if (/STS[\s-]*0?1\b/.test(t)) codes.add('STS01');
  if (/\bSTS\b(?![\s-]*0?[12]\b)/.test(t)) codes.add('STS01');
  if (/\bA\s*2\b/.test(t)) codes.add('A2');
  if (/\bA\s*1\s*[\/,&+ ]?\s*(?:OG\s*|AND\s*)?A?\s*3\b/.test(t) || /\bA1\b/.test(t) || /\bA3\b/.test(t)) codes.add('A1A3');
  return [...codes];
};

const OPERATOR_APPROVAL_RE = /\bRO\s*[123]\b|\bRO[123]\s*\/\s*RO?[123]\b|\bLT\b|operat[øo]r\s*-?\s*godkjenning|driftstillatelse|operational authori[sz]ation|\bLUC\b/i;

export const isOperatorApproval = (row: CompetencyRow) =>
  OPERATOR_APPROVAL_RE.test(`${row.navn ?? ''} ${row.beskrivelse ?? ''}`);

const isIgnoredType = (row: CompetencyRow) => {
  const type = (row.type ?? '').toLowerCase();
  return type.includes('tour') || type.includes('veiledet');
};

export interface CompetencyInput {
  rows: CompetencyRow[];
  pilotIds: string[];
  droneClass: string | null | undefined;
  proximityToPeople: string | null | undefined;
  isVlos: boolean;
  now?: Date;
}

export interface CompetencyAssessment {
  status: CompetencyStatus;
  droneClass: string | null;
  nearPeople: boolean;
  requiredRank: number | null;
  requiredLabel: string | null;
  pilotRank: number | null;
  pilotLabel: string | null;
  coveredBy: 'personal' | 'operator_approval' | null;
  operatorApproval: string | null;
  recognised: { name: string; code: string; expires: string | null }[];
  expired: { name: string; expired: string | null }[];
  ignored: string[];
  unclassified: string[];
  reason: string | null; // plain, language-specific via buildCompetencyReason
  undeterminedWhy: string | null;
}

export const requiredRank = (droneClass: string | null, nearPeople: boolean, isVlos: boolean): number | null => {
  if (!isVlos) return 4;
  switch (droneClass) {
    case 'C0': case 'C1': case 'C3': case 'C4': return 1;
    case 'C2': return nearPeople ? 2 : 1;
    default: return null;
  }
};

export const evaluateCompetency = (input: CompetencyInput): CompetencyAssessment => {
  const now = input.now ?? new Date();
  const droneClass = (input.droneClass ?? '').trim().toUpperCase() || null;
  const nearPeople = input.proximityToPeople === 'populated' || input.proximityToPeople === 'gathering';
  const pilotSet = new Set(input.pilotIds);
  const rows = input.rows.filter((r) => !r.profile_id || pilotSet.size === 0 || pilotSet.has(r.profile_id));

  const recognised: CompetencyAssessment['recognised'] = [];
  const expired: CompetencyAssessment['expired'] = [];
  const ignored: string[] = [];
  const unclassified: string[] = [];
  let operatorApproval: string | null = null;
  const rankByPilot = new Map<string, number>();

  for (const row of rows) {
    const name = (row.navn ?? '').trim() || '—';
    if (isIgnoredType(row)) { ignored.push(name); continue; }
    if (isOperatorApproval(row)) {
      if (isExpired(row, now)) expired.push({ name, expired: row.utloper_dato ?? null });
      else operatorApproval = operatorApproval ?? name;
      continue;
    }
    const codes = classifyCompetency(`${row.navn ?? ''} ${row.beskrivelse ?? ''}`);
    const type = (row.type ?? '').toLowerCase();
    const formal = FORMAL_TYPES.some((f) => type.includes(f)) || type.includes('kurs');
    if (codes.length === 0 || !formal) {
      if (type.includes('kurs')) ignored.push(name); else unclassified.push(name);
      continue;
    }
    if (isExpired(row, now)) { expired.push({ name, expired: row.utloper_dato ?? null }); continue; }
    const best = Math.max(...codes.map((c) => RANK[c]));
    recognised.push({ name, code: LABEL[best], expires: row.utloper_dato ?? null });
    const key = row.profile_id ?? '_';
    rankByPilot.set(key, Math.max(rankByPilot.get(key) ?? 0, best));
  }

  const pilotRank = rankByPilot.size ? Math.max(...rankByPilot.values()) : null;
  const req = requiredRank(droneClass, nearPeople, input.isVlos);
  const base = {
    droneClass, nearPeople, requiredRank: req, requiredLabel: rankLabel(req),
    pilotRank, pilotLabel: rankLabel(pilotRank), operatorApproval,
    recognised, expired, ignored, unclassified,
  };

  if (req === null) {
    return { ...base, status: 'undetermined', coveredBy: null, reason: null,
      undeterminedWhy: droneClass ? `unsupported_class:${droneClass}` : 'missing_class' };
  }
  if (pilotRank !== null && pilotRank >= req) {
    return { ...base, status: 'ok', coveredBy: 'personal', reason: null, undeterminedWhy: null };
  }
  if (!input.isVlos && operatorApproval) {
    return { ...base, status: 'ok', coveredBy: 'operator_approval', reason: null, undeterminedWhy: null };
  }
  // Never fail on data we could not interpret.
  if (unclassified.length > 0) {
    return { ...base, status: 'undetermined', coveredBy: null, reason: null, undeterminedWhy: 'unclassified_rows' };
  }
  return { ...base, status: 'missing', coveredBy: null, reason: null, undeterminedWhy: null };
};

export const buildCompetencyReason = (a: CompetencyAssessment, lang: 'no' | 'en'): string | null => {
  if (a.status !== 'missing') return null;
  const en = lang === 'en';
  const has = a.pilotLabel
    ? (en ? `the pilot only has ${a.pilotLabel}` : `piloten har kun ${a.pilotLabel}`)
    : (en ? 'the pilot has no valid recognised drone certificate' : 'piloten har ikke gyldig gjenkjent droneførerbevis');
  const noOp = en ? 'and no operator approval covers the operation' : 'og ingen operatørgodkjenning dekker operasjonen';
  if (a.requiredRank === 4) {
    return en
      ? `The operation is BVLOS, which requires STS-02; ${has}, ${noOp}`
      : `Operasjonen er BVLOS, som krever STS-02; ${has}, ${noOp}`;
  }
  if (a.requiredRank === 2) {
    return en
      ? `The drone is C2 and flown near uninvolved people, which requires A2; ${has}, ${noOp}`
      : `Dronen er C2 og flys nær uinvolverte, som krever A2; ${has}, ${noOp}`;
  }
  return en
    ? `The drone is ${a.droneClass}, which requires at least A1/A3; ${has}`
    : `Dronen er ${a.droneClass}, som krever minst A1/A3; ${has}`;
};
