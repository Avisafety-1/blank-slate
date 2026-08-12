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

type Tone = "green" | "lime" | "yellow" | "orange" | "pink" | "red" | "neutral";

const TONE_STYLES: Record<Tone, string> = {
  green: "bg-emerald-500/12 border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
  lime: "bg-lime-500/12 border-lime-500/40 text-lime-700 dark:text-lime-300",
  yellow: "bg-yellow-400/15 border-yellow-500/40 text-yellow-700 dark:text-yellow-300",
  orange: "bg-orange-500/12 border-orange-500/40 text-orange-700 dark:text-orange-300",
  pink: "bg-pink-500/12 border-pink-500/40 text-pink-700 dark:text-pink-300",
  red: "bg-red-500/12 border-red-500/40 text-red-700 dark:text-red-300",
  neutral: "bg-muted/50 border-border text-muted-foreground",
};

const arcTone = (arc: string | null): Tone => {
  const a = (arc || "").toLowerCase().replace("arc-", "").trim();
  if (a === "a") return "green";
  if (a === "b") return "lime";
  if (a === "c") return "orange";
  if (a === "d") return "red";
  return "neutral";
};

const fgrcTone = (v: number | null): Tone => {
  if (v === null) return "neutral";
  if (v <= 2) return "green";
  if (v === 3) return "lime";
  if (v === 4) return "yellow";
  if (v === 5) return "orange";
  if (v === 6) return "pink";
  return "red";
};

const sailTone = (s: string | null): Tone => {
  switch (s) {
    case "I":
      return "green";
    case "II":
      return "lime";
    case "III":
      return "yellow";
    case "IV":
      return "orange";
    case "V":
      return "pink";
    case "VI":
      return "red";
    default:
      return "neutral";
  }
};

const ValueBadge = ({ label, value, tone }: { label: string; value: string; tone: Tone }) => (
  <div className={cn("flex-1 min-w-[92px] px-3 py-2 rounded-lg border text-center", TONE_STYLES[tone])}>
    <p className="text-[10px] uppercase tracking-wide opacity-80 leading-tight">{label}</p>
    <p className="text-xl font-bold leading-tight tabular-nums">{value}</p>
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
    <div className="p-3 rounded-lg border bg-card space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Target className="w-4 h-4 text-primary" />
        <h4 className="font-medium text-sm">
          {t("riskAssessment.preliminaryConclusion.title", "Foreløpig konklusjon")}
        </h4>
        {manualOverride && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
            {t("riskAssessment.manualOverrideShort", "Overstyrt")}
          </span>
        )}
        {arcReduced && (
          <span className="text-[11px] text-muted-foreground ml-auto">
            {t("riskAssessment.preliminaryConclusion.arcReduced", "Initiell ARC")}:{" "}
            {String(initialArc).toUpperCase()}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <ValueBadge
          label={t("riskAssessment.preliminaryConclusion.arcLabel", "ARC (residual)")}
          value={arc ? arc.toUpperCase() : "–"}
          tone={arcTone(arc)}
        />
        <ValueBadge
          label={t("riskAssessment.preliminaryConclusion.fgrcLabel", "fGRC")}
          value={hasFgrc ? String(fgrc) : "–"}
          tone={fgrcTone(hasFgrc ? (fgrc as number) : null)}
        />
        <ValueBadge
          label={t("riskAssessment.preliminaryConclusion.sailLabel", "SAIL")}
          value={sail ? `SAIL ${sail}` : "–"}
          tone={sailTone(sail)}
        />
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 mt-px flex-shrink-0" />
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
