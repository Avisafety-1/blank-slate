import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileCheck2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SoraProfileDialog } from "@/components/sora/SoraProfileDialog";

export interface SoraProfileResult {
  profileId: string | null;
  documentId: string | null;
  confirmedAt: string | null;
  used: boolean;
  state: "within_envelope" | "outside_envelope";
  appliedMitigations: { key: string; robustness: string; reduction: number; text: string }[];
  deviations: { code: string; text: string }[];
  notes: string[];
  maxDistanceFromPilotM?: number | null;
}

export const SoraProfileResultSection = ({ data }: { data?: SoraProfileResult | null }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!data) return null;
  return (
    <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-xs font-medium text-blue-700 dark:text-blue-300 uppercase tracking-wide flex items-center gap-1.5">
          <FileCheck2 className="w-4 h-4" />
          {t("soraProfile.title")}
        </h4>
        {data.documentId && (
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setOpen(true)}>
            {t("riskAssessment.soraProfile.open")}
          </Button>
        )}
      </div>
      {data.used && typeof data.maxDistanceFromPilotM === "number" && (
        <p className="text-xs font-medium">{t("riskAssessment.soraProfile.maxDistance", { value: data.maxDistanceFromPilotM })}</p>
      )}
      {data.appliedMitigations.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t("riskAssessment.soraProfile.applied")}</p>
          <ul className="text-xs list-disc pl-4">
            {data.appliedMitigations.map((m) => (
              <li key={m.key}>{t("riskAssessment.soraProfile.appliedItem", { label: m.text.split(" ")[0], robustness: m.robustness, reduction: m.reduction })}</li>
            ))}
          </ul>
        </div>
      )}
      {data.deviations.length > 0 && (
        <div className="p-2 rounded-md border border-yellow-500/40 bg-yellow-500/10">
          <p className="text-xs font-medium text-yellow-700 dark:text-yellow-300 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            {t("riskAssessment.soraProfile.deviations")}
          </p>
          <ul className="text-xs list-disc pl-4 text-yellow-700 dark:text-yellow-300">
            {data.deviations.map((d, i) => <li key={`${d.code}-${i}`}>{d.text}</li>)}
          </ul>
        </div>
      )}
      {data.notes.length > 0 && (
        <ul className="text-xs text-muted-foreground list-disc pl-4">
          {data.notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
      {data.documentId && (
        <SoraProfileDialog documentId={data.documentId} open={open} onOpenChange={setOpen} />
      )}
    </div>
  );
};
