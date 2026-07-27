import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ComplianceEvaluation, ComplianceCategoryKey } from "../types";

interface Props {
  evaluation: ComplianceEvaluation | null;
  onSelect?: (key: ComplianceCategoryKey) => void;
}

const CATEGORY_ORDER: ComplianceCategoryKey[] = [
  "competence",
  "documentation",
  "fleet",
  "operations",
  "safety",
];

const CATEGORY_LABEL_KEY: Record<ComplianceCategoryKey, string> = {
  competence: "audit.tabs.competency",
  documentation: "audit.tabs.documentation",
  fleet: "audit.tabs.fleet",
  operations: "audit.tabs.operations",
  safety: "audit.tabs.safety",
};

function scoreColor(score: number | null): string {
  if (score === null) return "stroke-muted-foreground";
  if (score >= 85) return "stroke-status-green";
  if (score >= 65) return "stroke-status-yellow";
  return "stroke-status-red";
}

function MiniRing({ score }: { score: number | null }) {
  const size = 72;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = score ?? 0;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} className="stroke-muted" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          className={scoreColor(score)}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={score === null ? circumference : offset}
          style={{ transition: "stroke-dashoffset 500ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-semibold">{score === null ? "—" : `${score}%`}</span>
      </div>
    </div>
  );
}

export const CategoryScoreGrid = ({ evaluation, onSelect }: Props) => {
  const { t } = useTranslation();
  if (!evaluation) return null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {CATEGORY_ORDER.map((key) => {
            const cat = evaluation.categories[key];
            const openIssues = cat.critical + cat.warnings;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelect?.(key)}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-3 rounded-lg text-center",
                  "hover:bg-muted/60 transition-colors",
                  onSelect && "cursor-pointer",
                )}
              >
                <MiniRing score={cat.score} />
                <div className="text-sm font-medium mt-1">{t(CATEGORY_LABEL_KEY[key])}</div>
                <div className="text-xs text-muted-foreground">
                  {openIssues > 0
                    ? t("audit.categoryScore.openIssues", { count: openIssues })
                    : t("audit.categoryScore.noIssues")}
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
