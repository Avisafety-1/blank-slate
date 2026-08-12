import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { Shield, ChevronDown, ChevronUp, Radar, Eye, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { densityOptions, getAecRow, parseAecNumber, normalizeArc, residualArcForDensity } from "@/lib/soraAirRisk";

interface AirRiskAnalysis {
  aec?: string;
  aec_reasoning?: string;
  aec_environment?: string;
  aec_density_rating?: number;
  initial_arc?: string;
  strategic_mitigations_applied?: string[];
  strategic_mitigations_not_applied?: string[];
  residual_arc?: string;
  tmpr_level?: string;
  tmpr_requirements?: {
    detect?: string;
    decide?: string;
    command?: string;
    execute?: string;
    feedback_loop?: string;
  };
  detection_recommendations?: string[];
  vlos_exemption?: boolean;
  traffic_types_to_consider?: string[];
  arc_reduction_reasoning?: string;
  arc_manual_override?: boolean;
  manual_density_rating?: number | null;
  arc_a_atypical?: boolean;
  arc_reduction_justification?: string | null;
  aec_declared_atypical?: boolean;
  /** Snapshot of the system-derived values before an atypical/segregated declaration */
  aec_base?: string | null;
  aec_environment_base?: string | null;
  initial_arc_base?: string | null;
}

interface AirRiskAnalysisSectionProps {
  data: AirRiskAnalysis;
  editable?: boolean;
  onChange?: (updated: AirRiskAnalysis) => void;
}


const arcColor = (arc?: string) => {
  const letter = String(arc ?? '').toLowerCase().match(/arc-?\s*([abcd])/)?.[1];
  if (!letter) return 'bg-muted text-muted-foreground';
  if (letter === 'a') return 'bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30';
  if (letter === 'b') return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/30';
  if (letter === 'c') return 'bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30';
  return 'bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30';
};

const tmprBadgeColor = (level?: string) => {
  if (!level) return 'secondary';
  const l = level.toLowerCase();
  if (l === 'none') return 'default' as const;
  if (l === 'low') return 'default' as const;
  if (l === 'medium') return 'secondary' as const;
  if (l === 'high') return 'destructive' as const;
  return 'secondary' as const;
};

export const AirRiskAnalysisSection = ({ data, editable, onChange }: AirRiskAnalysisSectionProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (!data || (!data.aec && !data.initial_arc)) return null;

  const declaredAtypical = data.arc_a_atypical === true;
  const rawAecNum = parseAecNumber(data.aec);
  const rawRow = getAecRow(rawAecNum);
  const storedInitialArc = normalizeArc(data.initial_arc);

  /**
   * AEC 12 (atypical/segregated) can never be derived by the system — it must be
   * declared by the operator. AEC 11 is >FL600. If a stored/AI analysis claims either
   * without a declaration, or its AEC does not match the stored iARC, the AEC is
   * inconsistent and must not be presented as authoritative.
   */
  const aecInconsistent =
    !declaredAtypical &&
    rawAecNum != null &&
    (rawAecNum === 12 || (rawRow != null && storedInitialArc != null && rawRow.arc !== storedInitialArc));

  const effectiveAec = declaredAtypical ? 12 : aecInconsistent ? null : rawAecNum;
  const aecRow = getAecRow(effectiveAec);
  const initialArc = declaredAtypical ? 'ARC-a' : (aecRow?.arc ?? storedInitialArc ?? data.initial_arc);
  const densityChoices = densityOptions(effectiveAec);
  const hasReductionOptions = densityChoices.some((d) => d.residualArc);
  const arcChanged = normalizeArc(initialArc) !== normalizeArc(data.residual_arc);

  const applyChange = (patch: Partial<AirRiskAnalysis>) => {
    if (!onChange) return;
    const next: AirRiskAnalysis = { ...data, ...patch };

    if (patch.arc_a_atypical === true) {
      // Declaring atypical/segregated airspace redefines the AEC itself (Annex C, AEC 12).
      next.aec_base = data.aec_base ?? data.aec ?? null;
      next.aec_environment_base = data.aec_environment_base ?? data.aec_environment ?? null;
      next.initial_arc_base = data.initial_arc_base ?? data.initial_arc ?? null;
      next.aec = 'AEC 12';
      next.aec_environment = t('riskAssessment.air.aec12Environment', 'OPS i atypisk/segregert luftrom (erklært av operatør)');
      next.aec_density_rating = 1;
      next.initial_arc = 'ARC-a';
      next.aec_declared_atypical = true;
      next.manual_density_rating = null;
    } else if (patch.arc_a_atypical === false) {
      next.aec = data.aec_base ?? data.aec;
      next.aec_environment = data.aec_environment_base ?? data.aec_environment;
      next.initial_arc = data.initial_arc_base ?? data.initial_arc;
      next.aec_density_rating = getAecRow(next.aec)?.density ?? data.aec_density_rating;
      next.aec_base = null;
      next.aec_environment_base = null;
      next.initial_arc_base = null;
      next.aec_declared_atypical = false;
    }

    const base = next.arc_a_atypical
      ? 'ARC-a'
      : (getAecRow(next.aec)?.arc ?? normalizeArc(next.initial_arc) ?? initialArc);
    const reduced = next.arc_a_atypical
      ? 'ARC-a'
      : residualArcForDensity(next.aec, next.manual_density_rating ?? null);
    next.arc_manual_override = Boolean(next.arc_a_atypical || next.manual_density_rating != null);
    next.residual_arc = (next.arc_manual_override ? (reduced ?? base) : base) ?? undefined;
    onChange(next);
  };

  const selectDensity = (density: number) => {
    if (data.manual_density_rating === density) {
      applyChange({ manual_density_rating: null });
    } else {
      applyChange({ manual_density_rating: density });
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="p-3 rounded-lg bg-card border overflow-hidden">
        <CollapsibleTrigger className="flex items-center justify-between w-full text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <Radar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="font-medium text-sm">{t('riskAssessment.air.title', 'Luftrisikoanalyse (ARC/TMPR)')}</span>
            {data.residual_arc && (
              <span className={cn("px-2 py-0.5 rounded text-xs font-semibold border", arcColor(data.residual_arc))}>
                {data.residual_arc}
              </span>
            )}
            {data.tmpr_level && (
              <Badge variant={tmprBadgeColor(data.tmpr_level)} className="text-[10px]">
                TMPR: {data.tmpr_level}
              </Badge>
            )}
            {data.vlos_exemption && (
              <Badge variant="outline" className="text-[10px]">VLOS</Badge>
            )}
            {data.arc_manual_override && (
              <Badge variant="outline" className="text-[10px] border-orange-500/30 text-orange-700 dark:text-orange-300 bg-orange-500/10">
                {t('riskAssessment.ground.manualOverrideShort', 'Overstyrt')}
              </Badge>
            )}
          </div>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3 space-y-3">
          {/* AEC */}
          {data.aec && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('riskAssessment.air.encounterCategory', 'Air Encounter Category')}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium">{data.aec}</p>
                {(data.aec_density_rating ?? aecRow?.density) != null && (
                  <Badge variant="secondary" className="text-[10px]">
                    {t('riskAssessment.air.densityRating', 'Tetthetsrating')}: {data.aec_density_rating ?? aecRow?.density}
                  </Badge>
                )}
              </div>
              {(data.aec_environment || aecRow?.environment) && (
                <p className="text-xs text-muted-foreground">{data.aec_environment || aecRow?.environment}</p>
              )}
              {data.aec_reasoning && (
                <p className="text-xs text-muted-foreground">{data.aec_reasoning}</p>
              )}
            </div>
          )}

          {/* ARC progression */}
          {initialArc && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('riskAssessment.air.arc', 'Air Risk Class (ARC)')}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn("px-2 py-0.5 rounded text-xs font-semibold border", arcColor(initialArc))}>
                  iARC: {initialArc}
                </span>
                {arcChanged && (
                  <>
                    <span className="text-muted-foreground text-xs">→</span>
                    <span className={cn("px-2 py-0.5 rounded text-xs font-semibold border", arcColor(data.residual_arc))}>
                      {t('riskAssessment.air.residual', 'Residual')}: {data.residual_arc}
                    </span>
                  </>
                )}
                {!arcChanged && (
                  <span className="text-xs text-muted-foreground">{t('riskAssessment.air.noReduction', '(ingen reduksjon)')}</span>
                )}
              </div>
              {data.arc_reduction_reasoning && arcChanged && (
                <p className="text-xs text-muted-foreground mt-1">{data.arc_reduction_reasoning}</p>
              )}
            </div>
          )}

          {/* Manual ARC reduction (Annex C, Table 2) */}
          {editable && (
            <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t('riskAssessment.air.manualReductionTitle', 'Manuell ARC-reduksjon (Annex C, tabell 2)')}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t('riskAssessment.air.manualReductionHelp', 'Velg hvilken lokal lufttrafikktetthet du kan dokumentere. Referansemiljøet er alltid AEC 10 (<500 ft AGL over landlig område). Kun nivåer som SORA-tabellen tillater for denne AEC-en kan velges.')}
              </p>

              {hasReductionOptions ? (
                <div className="flex items-center gap-1 flex-wrap">
                  {densityChoices.map(({ density, residualArc }) => {
                    const disabled = !residualArc || data.arc_a_atypical === true;
                    const selected = data.manual_density_rating === density && !data.arc_a_atypical;
                    return (
                      <button
                        key={density}
                        type="button"
                        disabled={disabled}
                        onClick={() => selectDensity(density)}
                        className={cn(
                          "px-2 py-0.5 rounded border text-[10px] font-medium transition-colors",
                          selected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground border-border hover:bg-muted",
                          disabled && "opacity-40 cursor-not-allowed hover:bg-background",
                        )}
                      >
                        {t('riskAssessment.air.density', 'Tetthet')} {density}{' '}
                        <span className="opacity-70">{residualArc ? `→ ${residualArc}` : 'N/A'}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground flex items-start gap-1">
                  <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  {t('riskAssessment.air.noTableReduction', 'Denne AEC-en kan ikke reduseres via tabell 2. Reduksjon er kun mulig til ARC-a via atypisk/segregert luftrom.')}
                </p>
              )}

              <div className="flex items-start gap-2 pt-1">
                <Switch
                  checked={data.arc_a_atypical === true}
                  onCheckedChange={(checked) =>
                    applyChange({ arc_a_atypical: checked, manual_density_rating: checked ? null : data.manual_density_rating })
                  }
                  className="mt-0.5 flex-shrink-0 scale-90"
                  aria-label={t('riskAssessment.air.atypicalLabel', 'Atypisk/segregert luftrom (ARC-a)')}
                />
                <div className="min-w-0">
                  <span className="text-xs font-medium">{t('riskAssessment.air.atypicalLabel', 'Atypisk/segregert luftrom (ARC-a)')}</span>
                  <p className="text-[11px] text-muted-foreground">
                    {t('riskAssessment.air.atypicalHelp', 'Krever at alle krav til atypisk/segregert luftrom i Annex G, seksjon 3.20(d) er oppfylt og dokumentert.')}
                  </p>
                </div>
              </div>

              {(data.arc_manual_override || data.arc_a_atypical) && (
                <div className="space-y-1">
                  <p className="text-[11px] font-medium">{t('riskAssessment.air.justificationLabel', 'Dokumentasjon av lokal tetthet')}</p>
                  <Textarea
                    value={data.arc_reduction_justification ?? ''}
                    onChange={(e) => applyChange({ arc_reduction_justification: e.target.value })}
                    placeholder={t('riskAssessment.air.justificationPlaceholder', 'Beskriv grunnlaget for lavere lokal trafikktetthet (f.eks. avgrenset område, tidspunkt, kort eksponering, NOTAM, elektronisk synlighet).')}
                    className="text-xs min-h-[70px]"
                  />
                  <p className="text-[11px] text-orange-700 dark:text-orange-300 flex items-start gap-1">
                    <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    {t('riskAssessment.air.authorityNote', 'Reduksjon av ARC må dokumenteres og godkjennes av Luftfartstilsynet før den kan legges til grunn.')}
                  </p>
                </div>
              )}
            </div>
          )}

          {!editable && data.arc_reduction_justification && (
            <p className="text-xs text-muted-foreground italic">{data.arc_reduction_justification}</p>
          )}


          {/* Strategic mitigations */}
          {(data.strategic_mitigations_applied?.length || 0) > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('riskAssessment.air.strategicMitigations', 'Strategiske mitigeringer')}</p>
              {data.strategic_mitigations_applied!.map((m, i) => (
                <p key={i} className="text-xs text-green-600 dark:text-green-400 flex items-start gap-1">
                  <CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>{m}</span>
                </p>
              ))}
              {data.strategic_mitigations_not_applied?.map((m, i) => (
                <p key={`na-${i}`} className="text-xs text-muted-foreground flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>{m}</span>
                </p>
              ))}
            </div>
          )}

          {/* TMPR */}
          {data.tmpr_level && data.tmpr_requirements && !data.vlos_exemption && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t('riskAssessment.air.tmprRequirements', 'TMPR-krav')} ({data.tmpr_level})
              </p>
              <div className="grid gap-1 text-xs">
                {Object.entries(data.tmpr_requirements).map(([key, val]) => {
                  if (!val) return null;
                  const labels: Record<string, string> = {
                    detect: 'Detect',
                    decide: 'Decide',
                    command: 'Command',
                    execute: 'Execute',
                    feedback_loop: 'Feedback Loop',
                  };
                  return (
                    <div key={key} className="flex gap-2">
                      <span className="font-medium text-muted-foreground w-20 flex-shrink-0">{labels[key] || key}</span>
                      <span>{val}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {data.vlos_exemption && (
            <p className="text-xs text-muted-foreground italic flex items-start gap-1">
              <Eye className="w-3 h-3 mt-0.5 flex-shrink-0" />
              {t('riskAssessment.air.vlosNote', 'VLOS-operasjon — visuell kontakt med dronen er akseptabel taktisk mitigering for alle ARC-klasser.')}
            </p>
          )}

          {/* Detection recommendations */}
          {(data.detection_recommendations?.length || 0) > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('riskAssessment.air.detectionSystems', 'Anbefalte deteksjonssystemer')}</p>
              <ul className="text-xs space-y-0.5">
                {data.detection_recommendations!.map((r, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <Shield className="w-3 h-3 mt-0.5 flex-shrink-0 text-primary" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Traffic types */}
          {(data.traffic_types_to_consider?.length || 0) > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('riskAssessment.air.trafficTypes', 'Trafikktyper å vurdere')}</p>
              <div className="flex flex-wrap gap-1">
                {data.traffic_types_to_consider!.map((tt, i) => (
                  <Badge key={i} variant="outline" className="text-[10px]">{tt}</Badge>
                ))}
              </div>
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};
