import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { Target, Info } from "lucide-react";
import { deriveSail } from "@/lib/soraSail";

interface PreliminaryConclusionProps {
  residualArc?: string | null;
  initialArc?: string | null;
  fgrc?: number | null;
  manualOverride?: boolean;
}

const ValueBadge = ({ label, value, tone }: { label: string; value: string; tone: string }) => (
  <div className="flex-1 min-w-[110px] p-3 rounded-lg border bg-card">
    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className={cn("text-lg font-bold mt-0.5", tone)}>{value}</p>
  </div>
);

export const PreliminaryConclusionSection = ({
  residualArc,
  initialArc,
  fgrc,
  manualOverride,
}: PreliminaryConclusionProps) => {
  const { t } = useTranslation();

  const arc = residualArc || initialArc || null;
  const hasFgrc = typeof fgrc === "number" && Number.isFinite(fgrc);
  const sail = hasFgrc && arc ? deriveSail(fgrc as number, arc) : null;

  if (!arc && !hasFgrc) return null;

  const arcReduced = !!initialArc && !!residualArc && initialArc !== residualArc;

  return (
    <div className="p-4 rounded-lg border bg-card space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Target className="w-4 h-4 text-primary" />
        <h4 className="font-medium text-sm sm:text-base">
          {t("riskAssessment.preliminaryConclusion.title", "Foreløpig konklusjon")}
        </h4>
        {manualOverride && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
            {t("riskAssessment.manualOverrideShort", "Overstyrt")}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <ValueBadge
          label={t("riskAssessment.preliminaryConclusion.arcLabel", "ARC (residual)")}
          value={arc ? arc.toUpperCase() : "–"}
          tone="text-foreground"
        />
        <ValueBadge
          label={t("riskAssessment.preliminaryConclusion.fgrcLabel", "fGRC")}
          value={hasFgrc ? String(fgrc) : "–"}
          tone="text-foreground"
        />
        <ValueBadge
          label={t("riskAssessment.preliminaryConclusion.sailLabel", "SAIL")}
          value={sail ? `SAIL ${sail}` : "–"}
          tone="text-primary"
        />
      </div>

      {arcReduced && (
        <p className="text-xs text-muted-foreground">
          {t("riskAssessment.preliminaryConclusion.arcReduced", "Initiell ARC")}: {String(initialArc).toUpperCase()}
        </p>
      )}

      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <span>
          {t(
            "riskAssessment.preliminaryConclusion.note",
            "Foreløpig konklusjon. Mitigeringene under bakkerisikoanalysen kan endres manuelt, og SAIL oppdateres automatisk."
          )}
        </span>
      </p>
    </div>
  );
};
