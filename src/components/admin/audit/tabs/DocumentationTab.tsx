import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText } from "lucide-react";
import { StatusPill } from "../components/StatusPill";
import { useAuditDocuments } from "../hooks/useAuditData";
import { checkToPill, checkLabelKey } from "../utils/statusMapping";

export const DocumentationTab = () => {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError, error } = useAuditDocuments();
  if (isLoading) return <Skeleton className="h-40" />;
  if (isError) return <p className="text-sm text-status-red">{t("audit.states.error")}: {error?.message}</p>;
  const docs = data ?? [];
  if (docs.length === 0) return <p className="text-sm text-muted-foreground">{t("audit.states.empty")}</p>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {docs.map((d) => (
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
            <div className="text-muted-foreground">{t("audit.documents.category")}</div>
            <div>{d.category}</div>
            <div className="text-muted-foreground mt-2">{t("audit.documents.nextReview")}</div>
            <div>{d.nextReview ? new Date(d.nextReview).toLocaleDateString(i18n.language) : "—"}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
