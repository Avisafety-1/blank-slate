import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ShieldCheck, CircleSlash, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeAutoMitigations, totalAutoReduction } from "@/lib/soraAutoMitigations";

interface AutoMitigationsPreviewProps {
  observerCount: number;
  assignedEquipment?: Array<{ navn?: string | null; type?: string | null; beskrivelse?: string | null }>;
  atypicalSegregated?: boolean;
}

export const AutoMitigationsPreview = ({ observerCount, assignedEquipment = [], atypicalSegregated = false }: AutoMitigationsPreviewProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const mitigations = computeAutoMitigations({ observerCount, assignedEquipment });
  const total = totalAutoReduction(mitigations);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border">
      <CollapsibleTrigger className="w-full flex items-center justify-between gap-2 p-3 text-left hover:bg-muted/50 transition-colors rounded-lg">
        <div className="min-w-0">
          <span className="text-sm font-medium">
            {t('riskAssessment.autoMitigations.title', 'Mitigeringer som blir tatt med')}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant="outline"
            className={cn(
              "text-[11px] font-semibold",
              total < 0 ? "border-green-500/40 text-green-700" : "text-muted-foreground",
            )}
          >
            {total}
          </Badge>
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <p className="px-3 pb-2 text-xs text-muted-foreground">
          {t('riskAssessment.autoMitigations.description', 'Disse reduksjonene krediteres automatisk i den ferdige risikovurderingen. Du kan overstyre dem manuelt i resultatet.')}
        </p>
        <div className="border-t divide-y">
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
                      {m.reduction}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t(`riskAssessment.autoMitigations.reasons.${m.reasonKey}`, { ...(m.reasonParams || {}) }) as string}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
