// Internal go_decision codes are stored in Norwegian regardless of language.
// The UI translates them (CONDITIONAL / NOT ASSESSED) via i18n.
export const DECISION_CODES = ['GO', 'BETINGET', 'NO-GO', 'IKKE VURDERT'] as const;
export type DecisionCode = typeof DECISION_CODES[number];

export const normalizeDecisionCode = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const v = value.trim().toUpperCase().replace(/[_\s]+/g, ' ');
  if (v === 'CONDITIONAL' || v === 'CAUTION' || v === 'BETINGET') return 'BETINGET';
  if (v === 'NOT ASSESSED' || v === 'IKKE VURDERT') return 'IKKE VURDERT';
  if (v === 'NO GO' || v === 'NO-GO' || v === 'NOGO') return 'NO-GO';
  if (v === 'GO') return 'GO';
  return value;
};

/** Normalizes categories[*].go_decision in place to the internal codes. */
export const normalizeCategoryDecisions = (analysis: any): void => {
  const cats = analysis?.categories;
  if (!cats || typeof cats !== 'object') return;
  for (const cat of Object.values(cats) as any[]) {
    if (cat && typeof cat === 'object' && 'go_decision' in cat) cat.go_decision = normalizeDecisionCode(cat.go_decision);
  }
};
