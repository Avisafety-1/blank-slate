import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, CircleSlash, Info } from "lucide-react";
import { computeAutoMitigations, totalAutoReduction } from "@/lib/soraAutoMitigations";

interface AutoMitigationsPreviewProps {
  observerCount: number;
  assignedEquipment?: Array<{ navn?: string | null; type?: string | null; beskrivelse?: string | null }>;
}

export const AutoMitigationsPreview = ({ observerCount, assignedEquipment = [] }: AutoMitigationsPreviewProps) => {
  const { t } = useTranslation();
  const mitigations = computeAutoMitigations({ observerCount, assignedEquipment });
  const total = totalAutoReduction(mitigations);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium text-muted-foreground">
          {t('riskAssessment.autoMitigations.title', 'Mitigeringer som blir tatt med')}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          {t('riskAssessment.autoMitigations.description', 'Disse reduksjonene krediteres automatisk i den ferdige risikovurderingen. Du kan overstyre dem manuelt i resultatet.')}
        </p>
      </div>

      <div className="rounded-lg border divide-y">
        {mitigations.map((m) => (
          <div key={m.key} className="p-3 flex items-start gap-3">
            {m.applicable ? (
              <ShieldCheck className="w-4 h-4 mt-0.5 text-green-600 shrink-0" />
            ) : (
              <CircleSlash className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">
                  {t(`riskAssessment.autoMitigations.labels.${m.key}`)}
                </span>
                {m.applicable ? (
                  <Badge variant="outline" className="text-[10px] border-green-500/40 text-green-700">
                    {t(`riskAssessment.autoMitigations.robustness.${(m.robustness || 'None').toLowerCase()}`)} · {m.reduction}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    {t('riskAssessment.autoMitigations.notCredited', 'Ikke kreditert')}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t(`riskAssessment.autoMitigations.reasons.${m.reasonKey}`, m.reasonParams as any)}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5 shrink-0" />
        <span>
          {t('riskAssessment.autoMitigations.total', 'Samlet automatisk GRC-reduksjon: {{total}}', { total })}
        </span>
      </div>
    </div>
  );
};
