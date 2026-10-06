// Pure approval decision logic. decideApproval is the single source of truth
// for how an AI risk assessment changes the mission approval status.

export type ApprovalStatus = 'approved' | 'not_approved' | 'pending_approval';
export type ApprovalSeverity = 'info' | 'warning' | 'danger';

export interface DataAvailability {
  population: boolean;
  airspace: boolean;
  weather: boolean;
}

export interface ApprovalDecisionInput {
  lang: 'no' | 'en';
  currentStatus: ApprovalStatus | string | null;
  score: number | null;
  threshold: number;
  autoApprovalOn: boolean;
  hardStopTriggered: boolean;
  hardStopReason: string | null;
  noGoCategories: string[];
  /** Overall recommendation is NO-GO (e.g. score < 5) — treated like a NO-GO category. */
  overallNoGo?: boolean;
  weatherAssessed: boolean;
  dataAvailability: DataAvailability;
  assessmentSaved: boolean;
  canWrite: boolean;
  /** A confirmed SORA profile has envelope deviations: never auto-approve (never a hard stop or NO-GO). */
  soraEnvelopeDeviation?: boolean;
}

export interface ApprovalDecision {
  /** null = status unchanged */
  status: 'approved' | 'not_approved' | 'pending_approval' | null;
  reason: string;
  severity: ApprovalSeverity;
}

const noGoLabels: Record<string, { no: string; en: string }> = {
  weather: { no: 'vær', en: 'weather' },
  airspace: { no: 'luftrom', en: 'airspace' },
  pilot_experience: { no: 'piloterfaring', en: 'pilot experience' },
  mission_complexity: { no: 'oppdragskompleksitet', en: 'mission complexity' },
  equipment: { no: 'utstyr', en: 'equipment' },
};

const dataLabels: Record<keyof DataAvailability, { no: string; en: string }> = {
  population: { no: 'befolkningsdata', en: 'population data' },
  airspace: { no: 'luftromsdata', en: 'airspace data' },
  weather: { no: 'værdata', en: 'weather data' },
};

const noGoLabel = (key: string, lang: 'no' | 'en') => noGoLabels[key]?.[lang] ?? key;

const noGoText = (keys: string[], lang: 'no' | 'en') =>
  keys.map((k) => noGoLabel(k, lang)).join(lang === 'no' ? ' og ' : ' and ');

const fmtScore = (n: number) =>
  (Number.isInteger(n) ? String(n) : n.toFixed(1));

const scoreBelowThresholdReason = (input: ApprovalDecisionInput) => {
  const en = input.lang === 'en';
  const score = input.score === null ? null : fmtScore(input.score);
  const threshold = fmtScore(input.threshold);
  return en
    ? `AI score ${score ?? 'unavailable'} is below the approval threshold ${threshold} — waiting for manual approval.`
    : `AI-score ${score ?? 'ikke tilgjengelig'} er under godkjenningsterskelen ${threshold} — venter på manuell godkjenning.`;
};

const missingDataReason = (input: ApprovalDecisionInput) => {
  const en = input.lang === 'en';
  const missing = (Object.keys(input.dataAvailability) as Array<keyof DataAvailability>)
    .filter((k) => !input.dataAvailability[k]);
  const items = missing.map((k) => dataLabels[k][en ? 'en' : 'no']).join(en ? ', ' : ', ');
  return en
    ? `Data basis incomplete: ${items} missing — waiting for manual approval.`
    : `Datagrunnlag mangler: ${items} mangler — venter på manuell godkjenning.`;
};

const weatherNotAssessedReason = (input: ApprovalDecisionInput) =>
  input.lang === 'en'
    ? 'Weather has not been assessed — waiting for manual approval.'
    : 'Vær er ikke vurdert — venter på manuell godkjenning.';

const notSavedReason = (input: ApprovalDecisionInput) =>
  input.lang === 'en'
    ? 'The assessment could not be saved — waiting for manual approval.'
    : 'Vurderingen kunne ikke lagres — venter på manuell godkjenning.';

const noAccessReason = (input: ApprovalDecisionInput) =>
  input.lang === 'en'
    ? 'You do not have permission to change the approval status.'
    : 'Du har ikke tilgang til å endre godkjenningsstatus.';

const autoOffReason = (input: ApprovalDecisionInput) =>
  input.lang === 'en'
    ? 'Automatic approval is off — the decision stays with the mission approver.'
    : 'Automatisk godkjenning er av — beslutningen ligger hos godkjenneren.';

const autoApprovedReason = (input: ApprovalDecisionInput) => {
  const score = input.score === null ? '' : fmtScore(input.score);
  return input.lang === 'en'
    ? `Automatic approval: AI score ${score} meets the approval threshold ${fmtScore(input.threshold)}.`
    : `Automatisk godkjenning: AI-score ${score} oppfyller godkjenningsterskelen ${fmtScore(input.threshold)}.`;
};

/** Returns every unmet approval requirement (before write access) as a decision, or null when all are met. */
const unmetRequirement = (input: ApprovalDecisionInput): ApprovalDecision | null => {
  if (!input.weatherAssessed) {
    return { status: null, severity: 'warning', reason: weatherNotAssessedReason(input) };
  }
  const missing = (Object.keys(input.dataAvailability) as Array<keyof DataAvailability>)
    .filter((k) => !input.dataAvailability[k]);
  if (missing.length > 0) {
    return { status: null, severity: 'warning', reason: missingDataReason(input) };
  }
  if (!input.assessmentSaved) {
    return { status: null, severity: 'warning', reason: notSavedReason(input) };
  }
  return null;
};

const hardStopReasonText = (input: ApprovalDecisionInput) =>
  (input.hardStopReason || '').trim() ||
  (input.lang === 'en' ? 'hard stop' : 'hard stop');

/**
 * The approval decision for one completed risk assessment.
 * status = null means the mission approval status is not changed.
 */
/** Danger decision for hard stop / NO-GO, or null when none applies. */
const dangerDecision = (
  input: ApprovalDecisionInput,
  mode: 'approved' | 'approver' | 'plain',
): ApprovalDecision | null => {
  const en = input.lang === 'en';
  const suffix = mode === 'approver'
    ? (en ? ' — the mission approver must decide.' : ' — godkjenner må ta stilling.')
    : '';
  let core: string | null = null;
  if (input.hardStopTriggered === true) {
    core = en ? `has a hard stop: ${hardStopReasonText(input)}` : `har hard stop: ${hardStopReasonText(input)}`;
  } else if (input.noGoCategories.length > 0) {
    core = en
      ? `has NO-GO in ${noGoText(input.noGoCategories, 'en')}`
      : `har NO-GO i ${noGoText(input.noGoCategories, 'no')}`;
  } else if (input.overallNoGo === true) {
    const score = input.score === null ? (en ? 'unavailable' : 'ikke tilgjengelig') : fmtScore(input.score);
    core = en ? `recommends NO-GO (AI score ${score}/10)` : `anbefaler NO-GO (AI-score ${score}/10)`;
    if (mode !== 'approved') {
      return {
        status: null,
        severity: 'danger',
        reason: en
          ? `The latest assessment ${core} — the mission approver must decide`
          : `Siste vurdering ${core} — godkjenner må ta stilling`,
      };
    }
  }
  if (!core) return null;
  return {
    status: null,
    severity: 'danger',
    reason: mode === 'approved'
      ? (en ? `The mission is approved, but the latest assessment ${core}` : `Oppdraget er godkjent, men siste vurdering ${core}`)
      : (en ? `The latest assessment ${core}${suffix}` : `Siste vurdering ${core}${suffix}`),
  };
};

/**
 * The approval decision for one completed risk assessment.
 * status = null means the mission approval status is not changed.
 */
export const decideApproval = (input: ApprovalDecisionInput): ApprovalDecision => {
  const en = input.lang === 'en';
  const status = (input.currentStatus || 'not_approved') as string;
  const scoreOk = input.score !== null && input.score >= input.threshold;

  // Approved missions are never changed by an assessment.
  if (status === 'approved') {
    const danger = dangerDecision(input, 'approved');
    if (danger) return danger;
    return {
      status: null,
      severity: 'info',
      reason: scoreOk
        ? en
          ? `Approved — the latest AI score ${fmtScore(input.score!)} meets the threshold ${fmtScore(input.threshold)}.`
          : `Godkjent — siste AI-score ${fmtScore(input.score!)} oppfyller terskelen ${fmtScore(input.threshold)}.`
        : en
          ? 'Approved — the latest assessment has no stop conditions.'
          : 'Godkjent — siste vurdering har ingen stopp.',
    };
  }

  const isApproverFlow = !input.autoApprovalOn || status === 'pending_approval';
  const danger = dangerDecision(input, isApproverFlow ? 'approver' : 'plain');
  if (danger) return danger;
  if (!scoreOk) {
    return { status: null, severity: 'info', reason: scoreBelowThresholdReason(input) };
  }
  // Automatic approval off: never change the status.
  if (!input.autoApprovalOn) {
    return { status: null, severity: 'info', reason: autoOffReason(input) };
  }
  const unmet = unmetRequirement(input);
  if (unmet) return unmet;
  if (!input.canWrite) {
    return { status: null, severity: 'warning', reason: noAccessReason(input) };
  }
  if (input.soraEnvelopeDeviation === true) {
    return {
      status: status === 'pending_approval' ? null : 'pending_approval',
      severity: 'warning',
      reason: en
        ? 'Outside the SORA envelope – requires manual approval'
        : 'Utenfor SORA-rammene – krever manuell godkjenning',
    };
  }
  return { status: 'approved', severity: 'info', reason: autoApprovedReason(input) };
};
