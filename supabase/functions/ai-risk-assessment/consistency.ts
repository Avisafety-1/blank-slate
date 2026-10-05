// Consistency of what the user sees: code decides GO/NO-GO, AI only describes.

export const CATEGORY_KEYS = ['weather', 'airspace', 'pilot_experience', 'mission_complexity', 'equipment'] as const;

export const HARD_STOP_CATEGORY_MAX = 3.0;
export const HARD_STOP_OVERALL_MAX = 4.9;

/**
 * - Category with a hard stop → NO-GO, score ≤ 3.0.
 * - Category the AI marked NO-GO without a hard stop → BETINGET (concerns kept).
 * - overall_score ≤ 4.9 when any hard stop is active.
 */
export const enforceConsistency = (
  analysis: any,
  hardStopCategories: Set<string> | string[],
  hardStopTriggered: boolean,
): any => {
  const stops = hardStopCategories instanceof Set ? hardStopCategories : new Set(hardStopCategories);
  const categories = analysis?.categories;
  if (categories && typeof categories === 'object') {
    for (const key of Object.keys(categories)) {
      const cat = categories[key];
      if (!cat || typeof cat !== 'object') continue;
      if (stops.has(key)) {
        cat.go_decision = 'NO-GO';
        const score = Number(cat.score);
        cat.score = Number.isFinite(score) ? Math.min(score, HARD_STOP_CATEGORY_MAX) : HARD_STOP_CATEGORY_MAX;
      } else if (cat.go_decision === 'NO-GO') {
        cat.go_decision = 'BETINGET';
      }
    }
  }
  if (hardStopTriggered) {
    const overall = Number(analysis.overall_score);
    analysis.overall_score = Number.isFinite(overall) ? Math.min(overall, HARD_STOP_OVERALL_MAX) : HARD_STOP_OVERALL_MAX;
  }
  return analysis;
};

const fmtScore = (score: unknown, lang: 'no' | 'en'): string => {
  const n = Number(score);
  if (!Number.isFinite(n)) return '–';
  const s = (Math.round(n * 10) / 10).toFixed(1);
  return lang === 'en' ? s : s.replace('.', ',');
};

export const buildDecisionSentence = (input: {
  recommendation: string | null | undefined;
  overallScore: unknown;
  hardStopReason: string | null | undefined;
  hardStopTriggered: boolean;
  lang: 'no' | 'en';
}): string => {
  const en = input.lang === 'en';
  const label = en ? 'Recommendation' : 'Anbefaling';
  const score = fmtScore(input.overallScore, input.lang);
  if (input.hardStopTriggered) {
    const reason = String(input.hardStopReason || '').trim().replace(/[.!?]+$/u, '');
    return `${label}: NO-GO — hard stop${reason ? `: ${reason}` : ''}.`;
  }
  if (input.recommendation === 'no-go') return `${label}: NO-GO (${en ? 'AI score' : 'AI-score'} ${score}/10).`;
  if (input.recommendation === 'caution') return `${label}: ${en ? 'Caution' : 'Forsiktighet'} (${en ? 'AI score' : 'AI-score'} ${score}/10).`;
  return `${label}: GO (${en ? 'AI score' : 'AI-score'} ${score}/10).`;
};

const DECISION_PREFIX = /^\s*(?:Anbefaling|Recommendation)\s*:[^.]*(?:\.[^.]*?)?\.\s*/iu;

/** Prepend the fixed decision sentence; replaces an earlier one if present. */
export const withDecisionSentence = (summary: unknown, sentence: string): string => {
  const rest = typeof summary === 'string' ? summary.replace(DECISION_PREFIX, '').trim() : '';
  return rest ? `${sentence} ${rest}` : sentence;
};
