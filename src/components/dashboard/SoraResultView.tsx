import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Shield, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { SAIL_MATRIX, deriveSail } from "@/lib/soraSail";

interface ContainmentCriterion {
  criterion: string;
  requirement: string;
  assurance: string;
}

interface OsoRequirement {
  oso: string;
  description: string;
  robustness: string;
  category: string;
}

interface SailLookup {
  fgrc_used: number;
  arc_used: string;
  fgrc_adjustments?: string;
  result: string;
}

interface ContainmentData {
  robustness_level: string;
  reasoning: string;
  criteria: ContainmentCriterion[];
  fts_required: boolean;
  fts_note?: string;
  tethered?: boolean;
}

interface SoraData {
  environment?: string;
  conops_summary?: string;
  igrc?: number;
  ground_mitigations?: string;
  fgrc?: number;
  arc_initial?: string;
  airspace_mitigations?: string;
  arc_residual?: string;
  sail?: string;
  sail_lookup?: SailLookup;
  containment?: ContainmentData;
  oso_requirements?: OsoRequirement[];
  residual_risk_level?: string;
  residual_risk_comment?: string;
  operational_limits?: string;
  overall_score?: number;
  recommendation?: string;
  summary?: string;
}

interface SoraResultViewProps {
  data: SoraData;
}

const riskColor = (level?: string) => {
  if (!level) return "secondary";
  const l = level.toLowerCase();
  if (l === "lav" || l === "low") return "default";
  if (l === "moderat" || l === "moderate") return "secondary";
  return "destructive";
};

const Field = ({ label, value }: { label: string; value?: string | number | null }) => (
  <div className="space-y-1">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <p className="text-sm">{value ?? "—"}</p>
  </div>
);

const robustnessColor = (level: string) => {
  switch (level) {
    case "NR": return "bg-muted text-muted-foreground";
    case "L": return "bg-green-500/20 text-green-700 dark:text-green-300";
    case "M": return "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300";
    case "H": return "bg-red-500/20 text-red-700 dark:text-red-300";
    default: return "bg-muted text-muted-foreground";
  }
};

const robustnessLabel = (level: string, t: (key: string) => string) => {
  switch (level) {
    case "NR": return t("sora.resultView.robustnessNotRequired");
    case "L": return t("sora.resultView.robustnessLow");
    case "M": return t("sora.resultView.robustnessMedium");
    case "H": return t("sora.resultView.robustnessHigh");
    default: return level;
  }
};

const containmentRobustnessColor = (level: string) => {
  const l = level.toLowerCase();
  if (l === "low") return "bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30";
  if (l === "medium") return "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/30";
  if (l === "high") return "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30";
  return "bg-muted text-muted-foreground";
};


const SailMatrixTable = ({ lookup }: { lookup?: SailLookup }) => {
  const fgrcRows = ["≤2", "3", "4", "5", "6", "7"];
  const arcCols = ["a", "b", "c", "d"];

  const activeRow = lookup ? (lookup.fgrc_used <= 2 ? "≤2" : String(Math.min(lookup.fgrc_used, 7))) : null;
  const activeCol = lookup?.arc_used?.toLowerCase().replace("arc-", "") || null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="border border-border p-1.5 bg-muted text-left">fGRC \ ARC</th>
            {arcCols.map(c => (
              <th key={c} className={cn("border border-border p-1.5 text-center uppercase", activeCol === c && "bg-primary/10 font-bold")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fgrcRows.map(row => (
            <tr key={row}>
              <td className={cn("border border-border p-1.5 font-medium bg-muted", activeRow === row && "bg-primary/10 font-bold")}>
                {row}
              </td>
              {arcCols.map(col => {
                const isActive = activeRow === row && activeCol === col;
                return (
                  <td key={col} className={cn(
                    "border border-border p-1.5 text-center",
                    isActive && "bg-primary text-primary-foreground font-bold ring-2 ring-primary ring-offset-1"
                  )}>
                    {SAIL_MATRIX[row][col]}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const deriveSailFromLookup = (lookup?: SailLookup): string | null =>
  lookup ? deriveSail(lookup.fgrc_used, lookup.arc_used) : null;

export const SoraResultView = ({ data }: SoraResultViewProps) => {
  const { t } = useTranslation();
  const matrixSail = deriveSailFromLookup(data.sail_lookup);
  const effectiveSail = matrixSail ? `SAIL ${matrixSail}` : data.sail;
  const effectiveLookupResult = matrixSail ?? data.sail_lookup?.result;

  return (
    <div className="space-y-4">
      {data.summary && (
        <div className="p-4 rounded-lg bg-muted/50">
          <p className="text-sm">{data.summary}</p>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {effectiveSail && <Badge variant="outline">{effectiveSail}</Badge>}
        {data.residual_risk_level && (
          <Badge variant={riskColor(data.residual_risk_level)}>
            {t("sora.resultView.residualRiskBadge", { level: data.residual_risk_level })}
          </Badge>
        )}
        {data.recommendation && (
          <Badge variant={data.recommendation === "go" ? "default" : data.recommendation === "caution" ? "secondary" : "destructive"}>
            {data.recommendation.toUpperCase()}
          </Badge>
        )}
        {data.containment && (
          <Badge className={cn("border", containmentRobustnessColor(data.containment.robustness_level))}>
            {t("sora.resultView.containmentBadge", { level: data.containment.robustness_level })}
          </Badge>
        )}
      </div>

      <Accordion type="multiple" defaultValue={["env", "grc", "arc", "sail"]} className="w-full">
        <AccordionItem value="env">
          <AccordionTrigger>{t("sora.resultView.envTitle")}</AccordionTrigger>
          <AccordionContent className="space-y-3 pt-2">
            <Field label={t("sora.resultView.envLabel")} value={data.environment} />
            <Field label={t("sora.resultView.conopsLabel")} value={data.conops_summary} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="grc">
          <AccordionTrigger>{t("sora.resultView.grcTitle")}</AccordionTrigger>
          <AccordionContent className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <Field label={t("sora.resultView.igrcLabel")} value={data.igrc} />
              <Field label={t("sora.resultView.fgrcLabel")} value={data.fgrc} />
            </div>
            <Field label={t("sora.resultView.groundMitigationsLabel")} value={data.ground_mitigations} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="arc">
          <AccordionTrigger>{t("sora.resultView.arcTitle")}</AccordionTrigger>
          <AccordionContent className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <Field label={t("sora.resultView.arcInitialLabel")} value={data.arc_initial} />
              <Field label={t("sora.resultView.arcResidualLabel")} value={data.arc_residual} />
            </div>
            <Field label={t("sora.resultView.airspaceMitigationsLabel")} value={data.airspace_mitigations} />
          </AccordionContent>
        </AccordionItem>

        {/* SAIL Lookup - Step 7 */}
        <AccordionItem value="sail">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              {t("sora.resultView.sailStepTitle")}
              {effectiveSail && <Badge variant="outline" className="text-[10px]">{effectiveSail}</Badge>}
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-2">
            <SailMatrixTable lookup={data.sail_lookup} />
            {data.sail_lookup && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-4">
                  <Field label={t("sora.resultView.fgrcUsedLabel")} value={data.sail_lookup.fgrc_used} />
                  <Field label={t("sora.resultView.arcUsedLabel")} value={data.sail_lookup.arc_used?.toUpperCase()} />
                </div>
                {data.sail_lookup.fgrc_adjustments && (
                  <Field label={t("sora.resultView.adjustmentsLabel")} value={data.sail_lookup.fgrc_adjustments} />
                )}
                <Field label={t("sora.resultView.sailResultLabel")} value={effectiveLookupResult} />
              </div>
            )}
            {!data.sail_lookup && (
              <div className="grid grid-cols-2 gap-4">
                <Field label={t("sora.resultView.sailLevelLabel")} value={effectiveSail} />
                <Field label={t("sora.resultView.residualRiskLabel")} value={data.residual_risk_level} />
              </div>
            )}
            <Field label={t("sora.resultView.residualRiskCommentLabel")} value={data.residual_risk_comment} />
            <Field label={t("sora.resultView.operationalLimitsLabel")} value={data.operational_limits} />
          </AccordionContent>
        </AccordionItem>

        {/* Containment - Step 8 */}
        {data.containment && (
          <AccordionItem value="containment">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                {t("sora.resultView.containmentStepTitle")}
                <Badge className={cn("text-[10px] border", containmentRobustnessColor(data.containment.robustness_level))}>
                  {data.containment.robustness_level}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              <Field label={t("sora.resultView.reasoningLabel")} value={data.containment.reasoning} />

              {data.containment.criteria && data.containment.criteria.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">{t("sora.resultView.criteriaLabel")}</p>
                  <div className="space-y-3">
                    {data.containment.criteria.map((c, i) => (
                      <div key={i} className="p-3 rounded-lg bg-muted/30 border space-y-1">
                        <p className="text-xs font-semibold">{c.criterion}</p>
                        <p className="text-xs">{c.requirement}</p>
                        <p className="text-[10px] text-muted-foreground italic">{t("sora.resultView.documentationLabel", { value: c.assurance })}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.containment.fts_required && (
                <div className="p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-yellow-700 dark:text-yellow-300">{t("sora.resultView.ftsRequiredTitle")}</p>
                      {data.containment.fts_note && (
                        <p className="text-[10px] text-muted-foreground mt-1">{data.containment.fts_note}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {data.containment.tethered && (
                <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20">
                  <p className="text-xs text-blue-700 dark:text-blue-300">{t("sora.resultView.tetheredNote")}</p>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        )}

        {/* OSO Requirements - Step 9 */}
        {data.oso_requirements && data.oso_requirements.length > 0 && (
          <AccordionItem value="oso">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4" />
                {t("sora.resultView.osoStepTitle")}
                <Badge variant="outline" className="text-[10px]">{t("sora.resultView.osoCountBadge", { count: data.oso_requirements.length })}</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-2">
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="border border-border p-1.5 bg-muted text-left">{t("sora.resultView.osoTableOso")}</th>
                      <th className="border border-border p-1.5 bg-muted text-left">{t("sora.resultView.osoTableDescription")}</th>
                      <th className="border border-border p-1.5 bg-muted text-center">{t("sora.resultView.osoTableRobustness")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.oso_requirements.map((oso, i) => (
                      <tr key={i}>
                        <td className="border border-border p-1.5 font-medium whitespace-nowrap">{oso.oso}</td>
                        <td className="border border-border p-1.5">{oso.description}</td>
                        <td className="border border-border p-1.5 text-center">
                          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold", robustnessColor(oso.robustness))}>
                            {oso.robustness} — {robustnessLabel(oso.robustness, t)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
};
