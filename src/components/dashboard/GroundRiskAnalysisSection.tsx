import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { Shield, ChevronDown, ChevronUp, Layers, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface MitigationEntry {
  applicable: boolean;
  robustness?: string | null;
  reduction: number;
  reasoning?: string;
}

interface GroundRiskAnalysis {
  characteristic_dimension?: string;
  max_speed_category?: string;
  drone_weight_kg?: number;
  population_density_band?: string;
  population_density_description?: string;
  population_density_value?: number;
  population_density_calculation?: string;
  population_density_average?: number;
  population_density_driver?: string;
  population_density_source?: string;
  population_density_footprint?: string;
  ssb_grid_population?: number;
  ssb_grid_resolution_m?: number;
  igrc?: number;
  igrc_reasoning?: string;
  mitigations?: {
    m1a_sheltering?: MitigationEntry;
    m1b_operational_restrictions?: MitigationEntry;
    m1c_ground_observation?: MitigationEntry;
    m2_impact_reduction?: MitigationEntry;
  };
  total_reduction?: number;
  fgrc?: number;
  fgrc_reasoning?: string;
  controlled_ground_area?: boolean;
  controlled_ground_minimum?: number;
  grc_calculation_method?: string;
  igrc_table_basis?: string;
  mitigations_manual_override?: boolean;
}

interface GroundRiskAnalysisSectionProps {
  data: GroundRiskAnalysis;
  editable?: boolean;
  onChange?: (updated: GroundRiskAnalysis) => void;
}

// SORA robustness matrix — null = N/A (not selectable for that mitigation)
export type RobustnessLevel = "None" | "Low" | "Medium" | "High";
export const ROBUSTNESS_LEVELS: RobustnessLevel[] = ["None", "Low", "Medium", "High"];
export const MITIGATION_MATRIX: Record<string, Record<RobustnessLevel, number | null>> = {
  m1a_sheltering: { None: 0, Low: -1, Medium: -2, High: null },
  m1b_operational_restrictions: { None: 0, Low: null, Medium: null, High: null },
  m1c_ground_observation: { None: 0, Low: -1, Medium: null, High: null },
  m2_impact_reduction: { None: 0, Low: null, Medium: -1, High: -2 },
};

const normalizeRobustness = (value?: string | null): RobustnessLevel => {
  const v = String(value ?? "").toLowerCase();
  if (v.startsWith("high") || v.startsWith("høy")) return "High";
  if (v.startsWith("med")) return "Medium";
  if (v.startsWith("low") || v.startsWith("lav")) return "Low";
  return "None";
};

export const recomputeGroundRisk = (data: GroundRiskAnalysis): GroundRiskAnalysis => {
  const mitigations = data.mitigations || {};
  let total = 0;
  for (const [key, m] of Object.entries(mitigations) as [string, MitigationEntry | undefined][]) {
    if (!m || !m.applicable) continue;
    const level = normalizeRobustness(m.robustness);
    const reduction = MITIGATION_MATRIX[key]?.[level] ?? 0;
    total += reduction;
  }
  const igrc = data.igrc ?? 0;
  const floor = data.controlled_ground_minimum ?? 1;
  const fgrc = Math.max(floor, igrc + total);
  return { ...data, total_reduction: fgrc - igrc, fgrc };
};


const grcColor = (grc?: number) => {
  if (grc == null) return 'bg-muted text-muted-foreground';
  if (grc <= 3) return 'bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30';
  if (grc <= 6) return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/30';
  return 'bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30';
};

const useMitigationLabels = () => {
  const { t } = useTranslation();
  return {
    m1a_sheltering: t('riskAssessment.ground.m1a', 'M1(A) Skjerming'),
    m1b_operational_restrictions: t('riskAssessment.ground.m1b', 'M1(B) Operasjonelle restriksjoner'),
    m1c_ground_observation: t('riskAssessment.ground.m1c', 'M1(C) Bakkeobservasjon'),
    m2_impact_reduction: t('riskAssessment.ground.m2', 'M2 Redusert treffenergi'),
  } as Record<string, string>;
};

const formatNumber = (value: number, decimals = 0) =>
  value.toLocaleString("nb-NO", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });

export const GroundRiskAnalysisSection = ({ data }: GroundRiskAnalysisSectionProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const mitigationLabels = useMitigationLabels();

  if (!data || (data.igrc == null && data.fgrc == null)) return null;

  const grcChanged = data.igrc != null && data.fgrc != null && data.igrc !== data.fgrc;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="p-3 rounded-lg bg-card border overflow-hidden">
        <CollapsibleTrigger className="flex items-center justify-between w-full text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <Layers className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="font-medium text-sm">{t('riskAssessment.ground.title', 'Bakkerisikoanalyse (iGRC/fGRC)')}</span>
            {data.fgrc != null && (
              <span className={cn("px-2 py-0.5 rounded text-xs font-semibold border", grcColor(data.fgrc))}>
                fGRC: {data.fgrc}
              </span>
            )}
            {data.controlled_ground_area && (
              <Badge variant="outline" className="text-[10px]">{t('riskAssessment.ground.controlled', 'Kontrollert')}</Badge>
            )}
            {data.grc_calculation_method && (
              <Badge variant="secondary" className="text-[10px]">{t('riskAssessment.ground.systemCalculated', 'Systemberegnet')}</Badge>
            )}
          </div>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3 space-y-3">
          {/* Drone specs & population */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {data.characteristic_dimension && (
              <div>
                <span className="text-muted-foreground">{t('riskAssessment.ground.dimension', 'Dimensjon')}:</span>{' '}
                <span className="font-medium">{data.characteristic_dimension}</span>
              </div>
            )}
            {data.max_speed_category && (
              <div>
                <span className="text-muted-foreground">{t('riskAssessment.ground.maxSpeed', 'Maks hastighet')}:</span>{' '}
                <span className="font-medium">{data.max_speed_category}</span>
              </div>
            )}
            {data.drone_weight_kg != null && (
              <div>
                <span className="text-muted-foreground">{t('riskAssessment.ground.mtow', 'MTOW')}:</span>{' '}
                <span className="font-medium">{data.drone_weight_kg} kg</span>
              </div>
            )}
            {data.population_density_value != null && (
              <div className="col-span-2">
                <span className="text-muted-foreground">{t('riskAssessment.ground.population', 'Befolkning')}:</span>{' '}
                <span className="font-medium">{formatNumber(data.population_density_value)} /km²</span>
              </div>
            )}
          </div>

          {data.population_density_band && (
            <p className="text-xs text-muted-foreground italic">{data.population_density_band}{data.population_density_description ? ` — ${data.population_density_description}` : ''}</p>
          )}

          {(data.population_density_calculation || data.population_density_source || data.population_density_driver) && (
            <div className="rounded-md border border-border bg-muted/40 p-2 text-xs space-y-1">
              <p className="font-medium text-foreground">{t('riskAssessment.ground.ssbCalcTitle', 'SSB befolkningstetthet – beregning')}</p>
              {data.population_density_source && <p className="text-muted-foreground">{t('riskAssessment.ground.dataSource', 'Datakilde')}: {data.population_density_source}</p>}
              {data.population_density_footprint && <p className="text-muted-foreground">{t('riskAssessment.ground.footprint', 'Fotavtrykk')}: {data.population_density_footprint}</p>}
              {data.population_density_calculation && <p className="text-foreground">{t('riskAssessment.ground.calculation', 'Beregning')}: {data.population_density_calculation}</p>}
              {data.population_density_average != null && <p className="text-muted-foreground">{t('riskAssessment.ground.footprintAverage', 'Gjennomsnitt i fotavtrykk')}: {formatNumber(data.population_density_average, 1)} pers/km²</p>}
              {data.population_density_driver && <p className="text-muted-foreground">{t('riskAssessment.ground.routeDriver', 'Dimensjonerende del av ruten')}: {data.population_density_driver}</p>}
            </div>
          )}

          {/* iGRC → fGRC progression */}
          {data.igrc != null && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('riskAssessment.ground.grc', 'Ground Risk Class (GRC)')}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn("px-2 py-0.5 rounded text-xs font-semibold border", grcColor(data.igrc))}>
                  iGRC: {data.igrc}
                </span>
                {grcChanged && (
                  <>
                    <span className="text-muted-foreground text-xs">→</span>
                    <span className={cn("px-2 py-0.5 rounded text-xs font-semibold border", grcColor(data.fgrc))}>
                      fGRC: {data.fgrc}
                    </span>
                    {data.total_reduction != null && (
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">({data.total_reduction})</span>
                    )}
                  </>
                )}
                {!grcChanged && (
                  <span className="text-xs text-muted-foreground">{t('riskAssessment.ground.noReduction', '(ingen reduksjon)')}</span>
                )}
              </div>
              {data.igrc_reasoning && (
                <p className="text-xs text-muted-foreground mt-1">{data.igrc_reasoning}</p>
              )}
              {(data.grc_calculation_method || data.igrc_table_basis) && (
                <div className="rounded-md border border-border bg-muted/40 p-2 text-xs space-y-1 mt-2">
                  {data.grc_calculation_method && <p className="font-medium text-foreground">{data.grc_calculation_method}</p>}
                  {data.igrc_table_basis && <p className="text-muted-foreground">{t('riskAssessment.ground.tableBasis', 'Tabellgrunnlag')}: {data.igrc_table_basis}</p>}
                  {data.total_reduction != null && <p className="text-muted-foreground">{t('riskAssessment.ground.documentedReduction', 'Dokumentert reduksjon')}: {data.total_reduction}</p>}
                  {data.fgrc != null && <p className="text-muted-foreground">{t('riskAssessment.ground.finalFgrc', 'Endelig fGRC')}: {data.fgrc}</p>}
                </div>
              )}
            </div>
          )}

          {/* Mitigations table */}
          {data.mitigations && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('riskAssessment.ground.mitigations', 'Mitigeringer')}</p>
              <div className="space-y-1.5">
                {Object.entries(data.mitigations).map(([key, m]) => {
                  if (!m) return null;
                  return (
                    <div key={key} className="flex items-start gap-1.5 text-xs">
                      {m.applicable ? (
                        <CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0 text-green-600 dark:text-green-400" />
                      ) : (
                        <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <span className={cn("font-medium", m.applicable ? "text-foreground" : "text-muted-foreground")}>
                          {mitigationLabels[key] || key}
                        </span>
                        {m.applicable && m.robustness && (
                          <Badge variant="outline" className="ml-1.5 text-[9px] py-0">{m.robustness}</Badge>
                        )}
                        {m.applicable && m.reduction !== 0 && (
                          <span className="ml-1.5 text-green-600 dark:text-green-400 font-medium">({m.reduction})</span>
                        )}
                        {m.reasoning && (
                          <p className="text-muted-foreground mt-0.5 break-words">{m.reasoning}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* fGRC reasoning */}
          {data.fgrc_reasoning && grcChanged && (
            <p className="text-xs text-muted-foreground italic">{data.fgrc_reasoning}</p>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};
