import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  action: string;
  reason: string;
}

interface RiskRecommendationsProps {
  recommendations: Recommendation[];
  goConditions: string[];
}

export const RiskRecommendations = ({ recommendations, goConditions }: RiskRecommendationsProps) => {
  const { t } = useTranslation();

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'border-red-500/30 bg-red-500/10';
      case 'medium':
        return 'border-yellow-500/30 bg-yellow-500/10';
      case 'low':
        return 'border-blue-500/30 bg-blue-500/10';
      default:
        return 'border-muted bg-muted/50';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'medium':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'low':
        return <Info className="w-4 h-4 text-blue-500" />;
      default:
        return <Info className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high':
        return t('riskAssessment.priority.high', 'Høy prioritet');
      case 'medium':
        return t('riskAssessment.priority.medium', 'Medium prioritet');
      case 'low':
        return t('riskAssessment.priority.low', 'Lav prioritet');
      default:
        return priority;
    }
  };

  return (
    <div className="space-y-4">
      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">
            {t('riskAssessment.recommendations', 'Anbefalte tiltak')}
          </h4>
          <div className="space-y-2">
            {recommendations.map((rec, index) => (
              <div 
                key={index}
                className={cn("p-3 rounded-lg border", getPriorityStyle(rec.priority))}
              >
                <div className="flex items-start gap-2">
                  {getPriorityIcon(rec.priority)}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium uppercase opacity-70">
                        {getPriorityLabel(rec.priority)}
                      </span>
                    </div>
                    <p className="text-sm font-medium">{rec.action}</p>
                    <p className="text-xs text-muted-foreground mt-1">{rec.reason}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Go Conditions */}
      {goConditions.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">
            {t('riskAssessment.goConditions', 'Betingelser for flyging')}
          </h4>
          <div className="p-3 rounded-lg border border-green-500/30 bg-green-500/10">
            <ul className="space-y-1">
              {goConditions.map((condition, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>{condition}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
