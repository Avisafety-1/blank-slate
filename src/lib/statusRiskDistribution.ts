export type RiskAssessmentCategory = "go" | "caution" | "no-go" | "not-assessed";

export interface MissionRiskAssessmentSummary {
  mission_id: string;
  overall_score: number | string | null;
  recommendation: string | null;
  created_at: string;
}

export interface RiskDistributionItem {
  key: RiskAssessmentCategory;
  name: string;
  scoreRange: string;
  value: number;
}

const categoryForAssessment = (
  assessment: MissionRiskAssessmentSummary | undefined,
): RiskAssessmentCategory => {
  if (!assessment) return "not-assessed";
  if (assessment.recommendation?.toLowerCase() === "no-go") return "no-go";

  const score = Number(assessment.overall_score);
  if (!Number.isFinite(score)) return "not-assessed";
  if (score >= 7) return "go";
  if (score >= 5) return "caution";
  return "no-go";
};

export const buildFlownMissionRiskDistribution = (
  missionIds: string[],
  assessments: MissionRiskAssessmentSummary[],
  labels: Record<RiskAssessmentCategory, { name: string; scoreRange: string }>,
): RiskDistributionItem[] => {
  const latestByMission = new Map<string, MissionRiskAssessmentSummary>();
  assessments.forEach((assessment) => {
    if (!latestByMission.has(assessment.mission_id)) {
      latestByMission.set(assessment.mission_id, assessment);
    }
  });

  const counts: Record<RiskAssessmentCategory, number> = {
    go: 0,
    caution: 0,
    "no-go": 0,
    "not-assessed": 0,
  };
  new Set(missionIds).forEach((missionId) => {
    counts[categoryForAssessment(latestByMission.get(missionId))] += 1;
  });

  return (["go", "caution", "no-go", "not-assessed"] as RiskAssessmentCategory[]).map((key) => ({
    key,
    name: labels[key].name,
    scoreRange: labels[key].scoreRange,
    value: counts[key],
  }));
};