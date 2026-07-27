import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Plane, AlertOctagon, ArrowRight, Search } from "lucide-react";
import { StatusPill } from "../components/StatusPill";
import { useAuditFleet } from "../hooks/useAuditData";
import { checkToPill, checkLabelKey } from "../utils/statusMapping";
import { auditDeepLink } from "../utils/auditDeepLink";
import { cn } from "@/lib/utils";

export const FleetTab = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useAuditFleet();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const list = data ?? [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? list.filter((f) =>
          [f.droneName, f.registration ?? ""].some((v) => v.toLowerCase().includes(q)),
        )
      : list;
    // Sort: overdue service first, then drones with open deviations, then the rest.
    return [...filtered].sort((a, b) => {
      const aBad = a.service === "expired" ? 2 : a.openDeviations > 0 ? 1 : 0;
      const bBad = b.service === "expired" ? 2 : b.openDeviations > 0 ? 1 : 0;
      return bBad - aBad;
    });
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

      {rows.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">{t("audit.states.empty")}</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {rows.map((f) => {
            const open = !!expanded[f.id];
            const hasIssues = f.openDeviations > 0 || f.service === "expired";
            return (
              <Card key={f.id} className={cn(hasIssues && "border-l-4 border-status-yellow/60", f.service === "expired" && "border-status-red/60")}>
                <CardHeader className="pb-2 flex flex-row items-center gap-2 space-y-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggle(f.id)}>
                    {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </Button>
                  <Plane className="w-4 h-4 text-primary" />
                  <CardTitle className="text-base flex-1 min-w-0 truncate">
                    {f.droneName}
                    {f.registration && <span className="ml-2 text-xs text-muted-foreground">{f.registration}</span>}
                  </CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusPill status={checkToPill[f.service]} labelOverride={t(checkLabelKey[f.service])} />
                    {f.openDeviations > 0 && (
                      <Badge variant="outline" className="gap-1 bg-status-yellow/20 text-black border-status-yellow/50">
                        <AlertOctagon className="w-3 h-3" />
                        {f.openDeviations} {t("audit.fleet.openDeviations")}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                {open && (
                  <CardContent className="pt-0 pl-14 space-y-3 text-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="text-muted-foreground text-xs">{t("audit.fleet.nextInspection")}</div>
                        <div>{f.nextInspection ? new Date(f.nextInspection).toLocaleDateString(i18n.language) : "—"}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">{t("audit.fleet.lastInspection")}</div>
                        <div>{f.lastInspectionAt ? new Date(f.lastInspectionAt).toLocaleDateString(i18n.language) : "—"}</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs mb-1">{t("audit.fleet.deviationsList")}</div>
                      {f.deviations.length === 0 ? (
                        <div className="text-xs text-muted-foreground">{t("audit.fleet.noDeviations")}</div>
                      ) : (
                        <ul className="divide-y divide-border rounded-md border">
                          {f.deviations.map((d) => (
                            <li key={d.id} className="p-2">
                              <div className="flex items-center gap-2 text-xs">
                                <Badge variant="outline" className="text-[10px]">
                                  {d.entryType ? t(`resources.logbook.entryTypes.${d.entryType.toLowerCase()}`, d.entryType) : "—"}
                                </Badge>
                                <span className="text-muted-foreground">
                                  {d.entryDate ? new Date(d.entryDate).toLocaleDateString(i18n.language) : ""}
                                </span>
                              </div>
                              {d.title && <div className="text-sm font-medium mt-1">{d.title}</div>}
                              {d.description && <div className="text-xs text-muted-foreground line-clamp-2">{d.description}</div>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" onClick={() => navigate(auditDeepLink("drone", f.id).path)}>
                        {t("audit.fleet.openDrone")} <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
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
