import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertOctagon,
  Building2,
  Users,
  Plane,
  FileText,
  Activity,
  AlertTriangle,
  ShieldAlert,
  ClipboardCheck,
  Package,
  Gauge,
} from "lucide-react";
import { toast } from "sonner";
import { useAuditOverview, useAuditReviews } from "../hooks/useAuditData";

type SectionKey =
  | "company"
  | "personnel"
  | "fleet"
  | "documents"
  | "activity"
  | "findings"
  | "incidents"
  | "reviews"
  | "score";

const SECTION_ICONS: Record<SectionKey, typeof Package> = {
  company: Building2,
  personnel: Users,
  fleet: Plane,
  documents: FileText,
  activity: Activity,
  findings: AlertTriangle,
  incidents: ShieldAlert,
  reviews: ClipboardCheck,
  score: Gauge,
};

export const InspectionPackageTab = () => {
  const { t } = useTranslation();
  const overview = useAuditOverview();
  const reviews = useAuditReviews();
  const critical = overview.kpis?.criticalFindings ?? 0;

  const sections: { key: SectionKey; count: number }[] = [
    { key: "company", count: 1 },
    { key: "personnel", count: overview.kpis?.activePilots ?? 0 },
    { key: "fleet", count: overview.kpis?.activeDrones ?? 0 },
    { key: "documents", count: overview.documents.length },
    { key: "activity", count: overview.kpis?.flights12mo ?? 0 },
    { key: "findings", count: overview.kpis?.openFindings ?? 0 },
    { key: "incidents", count: overview.kpis?.incidents12mo ?? 0 },
    { key: "reviews", count: (reviews.data ?? []).length },
    { key: "score", count: overview.evaluation?.overall ?? 0 },
  ];

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
            {sections.map(({ key, count }) => {
              const Icon = SECTION_ICONS[key];
              return (
                <li
                  key={key}
                  className="flex items-center gap-3 rounded-md border p-3 text-sm"
                >
                  <Icon className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="flex-1 min-w-0 truncate">
                    {t(`audit.package.section.${key}`)}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {key === "score" ? `${count}%` : t("audit.package.sectionCount", { count })}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};
