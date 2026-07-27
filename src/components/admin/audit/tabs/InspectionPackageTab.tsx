import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertOctagon, FileText, Package } from "lucide-react";
import { toast } from "sonner";
import { inspectionPackageContents } from "../data/mockAuditData";
import { useAuditOverview } from "../hooks/useAuditData";

export const InspectionPackageTab = () => {
  const { t } = useTranslation();
  const { kpis } = useAuditOverview();
  const critical = kpis?.criticalFindings ?? 0;

  return (
    <div className="space-y-6">
      {critical > 0 && (
        <Card className="border-l-4 border-status-red/60">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertOctagon className="w-5 h-5 text-status-red mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-status-red">
                {t("audit.package.criticalOpenTitle", { count: critical })}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("audit.package.criticalOpenBody")}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="w-4 h-4 text-primary" />
            {t("audit.package.header")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="text-sm text-muted-foreground max-w-xl">
            {t("audit.package.description")}
          </p>
          <Button size="lg" onClick={() => toast.info(t("audit.package.comingSoon"))}>
            {t("audit.package.generate")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("audit.package.contentsHeader")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {inspectionPackageContents.map((c) => (
              <li key={c} className="flex items-center gap-2 text-sm">
                <FileText className="w-4 h-4 text-muted-foreground" />
                {c}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};
