export type MitigationKey =
  | 'm1a_sheltering'
  | 'm1b_operational_restrictions'
  | 'm1c_ground_observation'
  | 'm2_impact_reduction';

export type Robustness = 'None' | 'Low' | 'Medium' | 'High';

/** SORA robustness matrix (null = N/A for that mitigation) */
export const MITIGATION_MATRIX: Record<MitigationKey, Record<Robustness, number | null>> = {
  m1a_sheltering: { None: 0, Low: -1, Medium: -2, High: null },
  m1b_operational_restrictions: { None: 0, Low: null, Medium: null, High: null },
  m1c_ground_observation: { None: 0, Low: -1, Medium: null, High: null },
  m2_impact_reduction: { None: 0, Low: null, Medium: -1, High: -2 },
};

export interface AutoMitigation {
  key: MitigationKey;
  applicable: boolean;
  robustness: Robustness | null;
  reduction: number;
  /** i18n key suffix under riskAssessment.autoMitigations.reasons */
  reasonKey: string;
  reasonParams?: Record<string, string | number>;
}

export interface AutoMitigationInput {
  observerCount: number;
  assignedEquipment?: Array<{ navn?: string | null; type?: string | null; beskrivelse?: string | null }>;
}

export const findParachuteEvidence = (
  assignedEquipment: AutoMitigationInput['assignedEquipment'] = [],
) => {
  const match = (assignedEquipment || []).find((e) => {
    const text = `${e?.navn ?? ''} ${e?.type ?? ''} ${e?.beskrivelse ?? ''}`.toLowerCase();
    return /fallskjerm|parachute|moc\s*2512|dvr|design verification/.test(text);
  });
  if (!match) return null;
  const text = `${match?.navn ?? ''} ${match?.type ?? ''} ${match?.beskrivelse ?? ''}`.toLowerCase();
  const robustness: Robustness = /dvr|design verification/.test(text) ? 'High' : 'Medium';
  return {
    name: match?.navn ?? match?.type ?? '',
    robustness,
    reduction: MITIGATION_MATRIX.m2_impact_reduction[robustness] ?? 0,
  };
};

/**
 * Deterministic, automatically credited SORA ground-risk mitigations.
 * The same rules run in the ai-risk-assessment edge function so the
 * preview on the input tab always matches the produced assessment.
 */
export const computeAutoMitigations = ({
  observerCount,
  assignedEquipment = [],
}: AutoMitigationInput): AutoMitigation[] => {
  const observers = Number.isFinite(observerCount) ? Math.max(0, Math.trunc(observerCount)) : 0;
  const parachute = findParachuteEvidence(assignedEquipment);

  return [
    {
      key: 'm1a_sheltering',
      applicable: false,
      robustness: null,
      reduction: 0,
      reasonKey: 'm1aNone',
    },
    {
      key: 'm1b_operational_restrictions',
      applicable: false,
      robustness: null,
      reduction: 0,
      reasonKey: 'm1bNone',
    },
    observers > 0
      ? {
          key: 'm1c_ground_observation' as MitigationKey,
          applicable: true,
          robustness: 'Low' as Robustness,
          reduction: -1,
          reasonKey: 'm1cObservers',
          reasonParams: { count: observers },
        }
      : {
          key: 'm1c_ground_observation' as MitigationKey,
          applicable: false,
          robustness: null,
          reduction: 0,
          reasonKey: 'm1cNone',
        },
    parachute
      ? {
          key: 'm2_impact_reduction' as MitigationKey,
          applicable: true,
          robustness: parachute.robustness,
          reduction: parachute.reduction,
          reasonKey: 'm2Equipment',
          reasonParams: { equipment: parachute.name },
        }
      : {
          key: 'm2_impact_reduction' as MitigationKey,
          applicable: false,
          robustness: null,
          reduction: 0,
          reasonKey: 'm2None',
        },
  ];
};

export const totalAutoReduction = (mitigations: AutoMitigation[]) =>
  mitigations.reduce((sum, m) => sum + m.reduction, 0);
