import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { StatusPill } from "../components/StatusPill";
import { useAuditDocuments } from "../hooks/useAuditData";
import { checkToPill, checkLabelKey } from "../utils/statusMapping";
import { useNavigate } from "react-router-dom";
import { auditDeepLink } from "../utils/auditDeepLink";
import type { CheckResult } from "../types";

type StatusTab = "expired" | "expiring" | "valid" | "noExpiry";

const STATUS_ORDER: StatusTab[] = ["expired", "expiring", "valid", "noExpiry"];

function statusToTab(s: CheckResult): StatusTab {
  if (s === "expired") return "expired";
  if (s === "expiring") return "expiring";
  if (s === "valid") return "valid";
  return "noExpiry";
}

export const DocumentationTab = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useAuditDocuments();
  const [tab, setTab] = useState<StatusTab>("expired");

  const counts = useMemo(() => {
    const c: Record<StatusTab, number> = { expired: 0, expiring: 0, valid: 0, noExpiry: 0 };
    for (const d of data ?? []) c[statusToTab(d.status)]++;
    return c;
  }, [data]);

  // Default to the tab with content: expired > expiring > valid.
  const effectiveTab: StatusTab =
    counts.expired > 0 ? tab : counts.expiring > 0 && tab === "expired" ? "expiring" : tab;

  const filtered = useMemo(
    () => (data ?? []).filter((d) => statusToTab(d.status) === effectiveTab),
    [data, effectiveTab],
  );

  if (isLoading) return <Skeleton className="h-40" />;
  if (isError) return <p className="text-sm text-status-red">{t("audit.states.error")}: {error?.message}</p>;

  return (
    <div className="space-y-4">
      <Tabs value={effectiveTab} onValueChange={(v) => setTab(v as StatusTab)}>
        <TabsList className="h-auto flex flex-wrap gap-1 p-1.5 bg-secondary">
          {STATUS_ORDER.map((k) => (
            <TabsTrigger key={k} value={k} className="gap-2 text-xs sm:text-sm">
              {t(`audit.documents.statusTabs.${k}`)}
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{counts[k]}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {effectiveTab === "noExpiry" && (
        <p className="text-xs text-muted-foreground">{t("audit.documents.noExpiryHint")}</p>
      )}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground text-center">
            {t("audit.documents.emptyStatus")}
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
                <div className="text-muted-foreground text-xs">{t("audit.documents.category")}</div>
                <div>{d.category}</div>
                <div className="text-muted-foreground text-xs mt-2">{t("audit.documents.nextReview")}</div>
                <div>{d.nextReview ? new Date(d.nextReview).toLocaleDateString(i18n.language) : "—"}</div>
                <div className="pt-2 flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => navigate(auditDeepLink("document", d.id).path)}>
                    {t("audit.documents.open")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
