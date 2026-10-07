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

/** Prepend the fixed decision sentence (called once, after AI text is cleaned). */
export const withDecisionSentence = (summary: unknown, sentence: string): string => {
  const rest = typeof summary === 'string' ? summary.trim() : '';
  if (rest.startsWith(sentence)) return rest;
  return rest ? `${sentence} ${rest}` : sentence;
};

/** Open-category / C-class competency (A1/A3, A2, STS, C0–C6). */
export const OPEN_CATEGORY_COMPETENCY_RE = /\b(A1\s*\/\s*A3|A2|C[0-6](?:-klasse|-class)?|STS-0[12]|open category|åpen kategori|C-klasse|C-class)\b/i;

/** Competency/certification wording. */
const COMPETENCY_RE = /kompetanse|sertifikat|kompetansebevis|opplæring|eksamen|competenc|certificat|training|exam/i;

/** Never stripped: C2/C3 link (OSO#06), command-and-control, DJI Dock. */
const NEVER_STRIP_RE = /C[23][\s-]*link|command and control|kommando og kontroll|Dock/i;

/**
 * Specific category: drop recommendations that demand C-class/open-category
 * competency. A recommendation is removed only when it BOTH mentions
 * competency/certification AND an open-category/C-class marker, and does not
 * concern C2/C3 link, command-and-control or DJI Dock.
 */
export const stripOpenCategoryCompetency = (analysis: any): any => {
  if (!analysis || !Array.isArray(analysis.recommendations)) return analysis;
  analysis.recommendations = analysis.recommendations.filter((r: any) => {
    const text = typeof r === 'string' ? r : `${r?.action ?? ''} ${r?.risk_addressed ?? ''}`;
    if (NEVER_STRIP_RE.test(text)) return true;
    return !(COMPETENCY_RE.test(text) && OPEN_CATEGORY_COMPETENCY_RE.test(text));
  });
  return analysis;
};

const OPEN_RULES = {
  no: ['VLOS', 'Flyhøyde ≤ 120 m', 'Intet SORA-dokument valgt på oppdraget', 'Selskapet krever ikke SORA'],
  en: ['VLOS', 'Flight height ≤ 120 m', 'No SORA document selected on the mission', 'The company does not require SORA'],
};

/**
 * Overwrites the AI's operation-category text ("Begrunnelse" / "Regler for kategorien")
 * with text built only from classifyOperation(...).reasons, so the AI can never add
 * its own reasons or drone classes.
 */
export const applyOperationCategoryText = (
  analysis: any,
  classification: { category: 'open' | 'specific'; reasons: string[] } | null | undefined,
  lang: 'no' | 'en',
): any => {
  if (!analysis || !classification) return analysis;
  const en = lang === 'en';
  const specific = classification.category === 'specific';
  const reasons = [...classification.reasons];
  const prev = analysis.operation_classification && typeof analysis.operation_classification === 'object' ? analysis.operation_classification : {};
  analysis.operation_classification = {
    ...prev,
    requires_sora: specific,
    category: specific ? 'Specific' : 'Open',
    subcategory: specific ? 'SORA' : prev.subcategory,
    sts_applicable: null,
    reasoning: specific
      ? (en ? `Specific category because: ${reasons.join(', ')}.` : `Spesifikk kategori fordi: ${reasons.join(', ')}.`)
      : (en ? 'Open category: no condition requires the specific category.' : 'Åpen kategori: ingen forhold krever spesifikk kategori.'),
    open_category_rules: specific ? reasons : [...OPEN_RULES[en ? 'en' : 'no']],
  };
  return analysis;
};

/** Internal field names that must never appear in user-facing text. */
export const INTERNAL_FIELD_RE = /\b(isVlos|pilotInputs|systemDecisions|soraProfile|missionFacts|dataAvailability)\b/;
const BVLOS_RE = /\bBVLOS\b/i;

const splitSentences = (s: string): string[] => s.split(/(?<=[.!?])\s+/u).filter((x) => x.trim().length > 0);

const cleanText = (s: string, isVlos: boolean): string =>
  splitSentences(s).filter((x) => !INTERNAL_FIELD_RE.test(x) && !(isVlos && BVLOS_RE.test(x))).join(' ');

const textOfRec = (r: any): string => typeof r === 'string' ? r : `${r?.action ?? ''} ${r?.risk_addressed ?? ''}`;

/**
 * Removes sentences with internal field names and, for VLOS missions, any sentence
 * calling the mission BVLOS / BVLOS-like (SORA deviations never change the operation type).
 * Covers summary, category factors/concerns and recommendations.
 */
export const stripInternalAndOperationTypeText = (analysis: any, isVlos: boolean): any => {
  if (!analysis || typeof analysis !== 'object') return analysis;
  if (typeof analysis.summary === 'string') analysis.summary = cleanText(analysis.summary, isVlos);
  const cats = analysis.categories;
  if (cats && typeof cats === 'object') {
    for (const key of Object.keys(cats)) {
      const cat = cats[key];
      if (!cat || typeof cat !== 'object') continue;
      for (const field of ['factors', 'concerns']) {
        if (!Array.isArray(cat[field])) continue;
        cat[field] = cat[field]
          .map((x: unknown) => typeof x === 'string' ? cleanText(x, isVlos) : x)
          .filter((x: unknown) => typeof x !== 'string' || x.trim().length > 0);
      }
    }
  }
  if (Array.isArray(analysis.recommendations)) {
    analysis.recommendations = analysis.recommendations.filter((r: any) => {
      const t = textOfRec(r);
      return !INTERNAL_FIELD_RE.test(t) && !(isVlos && BVLOS_RE.test(t));
    });
  }
  return analysis;
};

export const LINKED_ONLY_EQUIPMENT_MIN = 8.0;

/**
 * Equipment linked to a drone but not selected on the mission never lowers the score:
 * with a green primary drone and only linked-only issues, equipment is ≥ 8.0 and GO.
 * Recommendations that only concern linked-only items get priority "low".
 */
export const applyLinkedOnlyEquipment = (
  analysis: any,
  input: { primaryDroneStatus: string | null; redItems: string[]; yellowItems: string[]; linkedOnlyTerms: string[] },
): any => {
  const terms = input.linkedOnlyTerms.map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 3);
  if (!analysis || terms.length === 0) return analysis;
  const green = /^(grønn|green)$/i.test(String(input.primaryDroneStatus ?? '').trim());
  if (green && input.redItems.length === 0 && input.yellowItems.length === 0) {
    const eq = analysis.categories?.equipment;
    if (eq && typeof eq === 'object') {
      const s = Number(eq.score);
      eq.score = Number.isFinite(s) ? Math.max(s, LINKED_ONLY_EQUIPMENT_MIN) : LINKED_ONLY_EQUIPMENT_MIN;
      eq.go_decision = 'GO';
    }
  }
  const others = [...input.redItems, ...input.yellowItems].map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 3);
  if (Array.isArray(analysis.recommendations)) {
    for (const r of analysis.recommendations) {
      if (!r || typeof r !== 'object') continue;
      const t = textOfRec(r).toLowerCase();
      if (terms.some((x) => t.includes(x)) && !others.some((x) => t.includes(x))) r.priority = 'low';
    }
  }
  return analysis;
};
