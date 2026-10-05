import { AlertTriangle, Shield } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export interface ContainmentSystemDecision {
  required: string;
  source: "map" | "missing" | "not_applicable";
  operationCategory?: "open" | "specific" | null;
  operationReasons?: string[];
  mapSail?: string | null;
  assessmentSail?: string | null;
  calculatedAt?: string | null;
  adjacentRadiusM?: number | null;
  avgDensity?: number | null;
  outOfScope?: boolean;
  warning?: boolean;
  note?: string | null;
}

export const ContainmentSourceBox = ({ data, showReasons = false }: { data: ContainmentSystemDecision; showReasons?: boolean }) => {
  const { t, i18n } = useTranslation();
  if (data.source === "not_applicable" || data.required === "Ikke relevant") {
    return <p className="text-xs text-muted-foreground">{t("sora.containment.notApplicableLine")}</p>;
  }
  const missing = data.required === "Ikke beregnet";
  const warn = missing || data.warning || data.outOfScope;
  const date = data.calculatedAt
    ? new Date(data.calculatedAt).toLocaleString(i18n.language?.startsWith("en") ? "en-GB" : "nb-NO", { dateStyle: "short", timeStyle: "short" })
    : null;
  const required = missing
    ? t("sora.containment.notCalculated")
    : data.outOfScope
      ? t("sora.containment.outOfScope")
      : data.required;

  return (
    <div className={cn("p-3 rounded-lg border space-y-1", warn ? "border-yellow-500/40 bg-yellow-500/5" : "bg-muted/30")}>
      <div className="flex items-center gap-2">
        {warn ? <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" /> : <Shield className="w-4 h-4" />}
        <p className="text-sm font-medium">{t("sora.containment.required", { level: required })}</p>
      </div>
      {data.source === "map" && date && (
        <p className="text-xs text-muted-foreground">{t("sora.containment.sourceMap", { date })}</p>
      )}
      {data.source === "map" && (data.adjacentRadiusM != null || data.avgDensity != null) && (
        <p className="text-xs text-muted-foreground">
          {t("sora.containment.adjacentFacts", {
            radius: data.adjacentRadiusM != null ? Math.round(data.adjacentRadiusM) : "—",
            density: data.avgDensity != null ? Math.round(data.avgDensity) : "—",
          })}
        </p>
      )}
      {showReasons && data.operationReasons && data.operationReasons.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("sora.containment.specificReasons", { reasons: data.operationReasons.join(", ") })}
        </p>
      )}
      {data.note && <p className="text-xs">{data.note}</p>}
    </div>
  );
};
