import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import { StatusPill } from "../components/StatusPill";
import { useAuditDocuments } from "../hooks/useAuditData";
import { checkToPill, checkLabelKey } from "../utils/statusMapping";
import type { DocumentComplianceClass, DocumentComplianceRelevance } from "../types";
import { cn } from "@/lib/utils";

const CLASS_ORDER: DocumentComplianceClass[] = ["compliance", "operational", "mission", "other"];

const relevanceClass: Record<DocumentComplianceRelevance, string> = {
  required: "bg-status-red/15 text-status-red border-status-red/30",
  recommended: "bg-status-yellow/15 text-status-yellow border-status-yellow/30",
  optional: "bg-muted text-muted-foreground border-border",
};

export const DocumentationTab = () => {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError, error } = useAuditDocuments();
  const [activeClass, setActiveClass] = useState<DocumentComplianceClass>("compliance");

  const bucketCounts = useMemo(() => {
    const c: Record<DocumentComplianceClass, number> = { compliance: 0, operational: 0, mission: 0, other: 0 };
    for (const d of data ?? []) c[d.complianceClass]++;
    return c;
  }, [data]);

  const filtered = useMemo(
    () => (data ?? []).filter((d) => d.complianceClass === activeClass),
    [data, activeClass],
  );

  if (isLoading) return <Skeleton className="h-40" />;
  if (isError) return <p className="text-sm text-status-red">{t("audit.states.error")}: {error?.message}</p>;

  return (
    <div className="space-y-4">
      <Tabs value={activeClass} onValueChange={(v) => setActiveClass(v as DocumentComplianceClass)}>
        <TabsList className="h-auto flex flex-wrap gap-1 p-1.5 bg-secondary">
          {CLASS_ORDER.map((k) => (
            <TabsTrigger key={k} value={k} className="gap-2 text-xs sm:text-sm">
              {t(`audit.documents.class.${k}`)}
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{bucketCounts[k]}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground text-center">
            {t("audit.documents.emptyClass")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((d) => (
            <Card key={d.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="truncate">{d.title}</span>
                  </span>
                  <StatusPill status={checkToPill[d.status]} labelOverride={t(checkLabelKey[d.status])} />
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="outline"
                    className={cn("text-[11px] px-1.5 py-0.5", relevanceClass[d.complianceRelevance])}
                  >
                    {t(`audit.documents.relevance.${d.complianceRelevance}`)}
                  </Badge>
                </div>
                <div className="text-muted-foreground">{t("audit.documents.category")}</div>
                <div>{d.category}</div>
                <div className="text-muted-foreground mt-2">{t("audit.documents.nextReview")}</div>
                <div>{d.nextReview ? new Date(d.nextReview).toLocaleDateString(i18n.language) : "—"}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
