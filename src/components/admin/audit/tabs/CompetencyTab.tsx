import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronDown, ChevronRight, User, ArrowRight, CheckCircle2 } from "lucide-react";
import { StatusPill } from "../components/StatusPill";
import { useAuditCompetencies } from "../hooks/useAuditData";
import { checkToPill, checkLabelKey, resolveCheckBucket } from "../utils/statusMapping";
import { auditDeepLink } from "../utils/auditDeepLink";
import type { CompetencyRow } from "../types";
import { cn } from "@/lib/utils";

interface Grouped {
  profileId: string;
  pilotName: string;
  items: CompetencyRow[];
  critical: number;
  warnings: number;
}

export const CompetencyTab = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useAuditCompetencies();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const grouped = useMemo<Grouped[]>(() => {
    const map = new Map<string, Grouped>();
    for (const c of data ?? []) {
      const g = map.get(c.profileId) ?? {
        profileId: c.profileId,
        pilotName: c.pilotName,
        items: [],
        critical: 0,
        warnings: 0,
      };
      g.items.push(c);
      const b = resolveCheckBucket(c.status);
      if (b === "fail") g.critical++;
      else if (b === "warn") g.warnings++;
      map.set(c.profileId, g);
    }
    const q = search.trim().toLowerCase();
    return [...map.values()]
      .filter((g) => (q ? g.pilotName.toLowerCase().includes(q) : true))
      .sort((a, b) => b.critical - a.critical || b.warnings - a.warnings || a.pilotName.localeCompare(b.pilotName));
  }, [data, search]);

  if (isLoading) return <Skeleton className="h-40" />;
  if (isError) return <p className="text-sm text-status-red">{t("audit.states.error")}: {error?.message}</p>;

  const toggle = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder={t("audit.competency.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {grouped.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">{t("audit.states.empty")}</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {grouped.map((g) => {
            const open = !!expanded[g.profileId];
            const issues = g.critical + g.warnings;
            const tone = g.critical > 0 ? "border-status-red/60" : g.warnings > 0 ? "border-status-yellow/60" : "";
            return (
              <Card key={g.profileId} className={cn(issues > 0 && "border-l-4", tone)}>
                <CardHeader className="pb-2 flex flex-row items-center gap-2 space-y-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggle(g.profileId)}>
                    {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </Button>
                  <User className="w-4 h-4 text-primary" />
                  <CardTitle className="text-base flex-1 min-w-0 truncate">{g.pilotName}</CardTitle>
                  {issues > 0 ? (
                    <Badge variant="outline" className={cn("text-xs", g.critical > 0 ? "bg-status-red/20 text-black border-status-red/50" : "bg-status-yellow/20 text-black border-status-yellow/50")}>
                      {t("audit.competency.issueCount", { count: issues })}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 bg-status-green/20 text-black border-status-green/50 text-xs">
                      <CheckCircle2 className="w-3 h-3" /> {t("audit.competency.allValid")}
                    </Badge>
                  )}
                </CardHeader>
                {open && (
                  <CardContent className="pt-0 pl-14">
                    <ul className="divide-y divide-border">
                      {g.items.map((c) => (
                        <li key={c.id} className="py-2 flex items-center gap-3 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium">{c.competency}</div>
                            <div className="text-xs text-muted-foreground">
                              {t("audit.competency.validUntil")}: {c.validUntil ? new Date(c.validUntil).toLocaleDateString(i18n.language) : "—"}
                            </div>
                          </div>
                          <StatusPill status={checkToPill[c.status]} labelOverride={t(checkLabelKey[c.status])} />
                        </li>
                      ))}
                    </ul>
                    <div className="flex justify-end pt-2">
                      <Button size="sm" variant="outline" onClick={() => navigate(auditDeepLink("person", g.profileId).path)}>
                        {t("audit.competency.openPerson")} <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                      </Button>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
