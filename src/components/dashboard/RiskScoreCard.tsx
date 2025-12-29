import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface CategoryScore {
  score: number;
  factors: string[];
  concerns: string[];
}

interface RiskScoreCardProps {
  overallScore: number;
  recommendation: 'go' | 'caution' | 'no-go';
  categories: {
    weather?: CategoryScore;
    airspace?: CategoryScore;
    pilot_experience?: CategoryScore;
    mission_complexity?: CategoryScore;
    equipment?: CategoryScore;
  };
}

export const RiskScoreCard = ({ overallScore, recommendation, categories }: RiskScoreCardProps) => {
  const { t } = useTranslation();

  const getScoreColor = (score: number) => {
    if (score >= 7) return 'bg-green-500';
    if (score >= 5) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getRecommendationStyle = (rec: string) => {
    switch (rec) {
      case 'go':
        return 'bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30';
      case 'caution':
        return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/30';
      case 'no-go':
        return 'bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getRecommendationText = (rec: string) => {
    switch (rec) {
      case 'go':
        return t('riskAssessment.goRecommendation', 'Anbefalt å fly');
      case 'caution':
        return t('riskAssessment.cautionRecommendation', 'Fly med forholdsregler');
      case 'no-go':
        return t('riskAssessment.noGoRecommendation', 'Ikke anbefalt');
      default:
        return rec;
    }
  };

  const categoryLabels: Record<string, string> = {
    weather: t('riskAssessment.categories.weather', 'Vær'),
    airspace: t('riskAssessment.categories.airspace', 'Luftrom'),
    pilot_experience: t('riskAssessment.categories.pilotExperience', 'Piloterfaring'),
    mission_complexity: t('riskAssessment.categories.missionComplexity', 'Oppdragskompleksitet'),
    equipment: t('riskAssessment.categories.equipment', 'Utstyr'),
  };

  return (
    <div className="space-y-4">
      {/* Overall Score */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-card border">
        <div>
          <p className="text-sm text-muted-foreground">{t('riskAssessment.overallScore', 'Samlet score')}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-3xl font-bold">{overallScore.toFixed(1)}</span>
            <span className="text-xl text-muted-foreground">/ 10</span>
          </div>
        </div>
        <div className={cn(
          "px-4 py-2 rounded-lg border font-medium",
          getRecommendationStyle(recommendation)
        )}>
          {getRecommendationText(recommendation)}
        </div>
      </div>

      {/* Category Scores */}
      <div className="space-y-3">
        {Object.entries(categories).map(([key, category]) => {
          if (!category) return null;
          return (
            <div key={key} className="p-3 rounded-lg bg-card border">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{categoryLabels[key] || key}</span>
                <span className="text-sm font-medium">{category.score.toFixed(1)}/10</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className={cn("h-full transition-all", getScoreColor(category.score))}
                  style={{ width: `${(category.score / 10) * 100}%` }}
                />
              </div>
              {(category.factors.length > 0 || category.concerns.length > 0) && (
                <div className="mt-2 space-y-1">
                  {category.factors.map((factor, i) => (
                    <p key={`factor-${i}`} className="text-xs text-green-600 dark:text-green-400">
                      ✓ {factor}
                    </p>
                  ))}
                  {category.concerns.map((concern, i) => (
                    <p key={`concern-${i}`} className="text-xs text-red-600 dark:text-red-400">
                      ⚠ {concern}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
