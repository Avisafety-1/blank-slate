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
import { auditDeepLink } from "../utils/auditDeepLink";
import { cn } from "@/lib/utils";
import { SendReminderDialog } from "../SendReminderDialog";
import { BellRing } from "lucide-react";
import { InfoTip } from "../components/InfoTip";
import type { FleetRow, ScannerFinding } from "../types";

const droneFinding = (d: FleetRow): ScannerFinding => {
  const red = d.status === "Rød";
  const params = { drone: d.droneName, reasons: d.reasons.map((r) => r.text).join("; ") || "—", department: d.departmentName ?? "" };
  return {
    code: red ? "DroneStatusRed" : "DroneStatusYellow",
    severity: red ? "critical" : "warning",
    categoryKey: "fleet",
    titleKey: red ? "audit.scanner.droneStatusRed.title" : "audit.scanner.droneStatusYellow.title",
    bodyKey: red ? "audit.scanner.droneStatusRed.body" : "audit.scanner.droneStatusYellow.body",
    titleParams: params,
    bodyParams: params,
    entityType: "drone",
    entityId: d.id,
    deepLink: auditDeepLink("drone", d.id),
  };
};

export const FleetTab = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useAuditFleet();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [reminder, setReminder] = useState<ScannerFinding | null>(null);
  const red = useMemo(() => (data ?? []).filter((d) => d.status === "Rød"), [data]);
  const yellow = useMemo(() => (data ?? []).filter((d) => d.status === "Gul"), [data]);

  const rows = useMemo(() => {
    const list = data ?? [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? list.filter((f) =>
          [f.droneName, f.registration ?? ""].some((v) => v.toLowerCase().includes(q)),
        )
      : list;
    const rank = (f: FleetRow) => (f.status === "Rød" ? 2 : f.status === "Gul" ? 1 : 0);
    return [...filtered].sort((a, b) => rank(b) - rank(a));
  }, [data, search]);

  if (isLoading) return <Skeleton className="h-40" />;
  if (isError) return <p className="text-sm text-status-red">{t("audit.states.error")}: {error?.message}</p>;

  const toggle = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

  return (
    <div className="space-y-4">
      {[{ list: red, tone: "red" as const, title: t("audit.fleet.redTitle") }, { list: yellow, tone: "yellow" as const, title: t("audit.fleet.yellowTitle") }]
        .filter((g) => g.list.length > 0)
        .map((g) => (
          <Card key={g.tone} className={cn("border-l-4", g.tone === "red" ? "border-l-status-red/70" : "border-l-status-yellow/70")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertOctagon className={cn("w-4 h-4", g.tone === "red" ? "text-status-red" : "text-status-yellow")} />
                {g.title}
                <Badge variant="outline" className="ml-1">{g.list.length}</Badge>
                <InfoTip k={`audit.sectionHelp.${g.tone === "red" ? "fleetRed" : "fleetYellow"}`} />
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="divide-y divide-border">
                {g.list.map((d) => (
                  <li key={d.id} className="py-2 flex flex-col sm:flex-row sm:items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">
                        {d.droneName}
                        {d.registration && <span className="ml-2 text-xs text-muted-foreground">{d.registration}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {d.departmentName ?? "—"} · {t("audit.fleet.technicalResponsible")}: {d.technicalResponsibleName ?? t("audit.fleet.noTechnicalResponsible")}
                      </div>
                      {d.reasons.length > 0 && (
                        <ul className="mt-1 text-xs list-disc pl-4">
                          {d.reasons.map((r, k) => (
                            <li key={k} className={r.status === "Rød" ? "text-status-red" : "text-status-yellow"}>{r.text}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => setReminder(droneFinding(d))}>
                        <BellRing className="w-3.5 h-3.5 mr-1.5" /> {t("audit.fleet.sendReminder")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => navigate(auditDeepLink("drone", d.id).path)}>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      <SendReminderDialog finding={reminder} open={!!reminder} onOpenChange={(v) => !v && setReminder(null)} />

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
            return (
              <Card key={f.id} className={cn(f.status === "Gul" && "border-l-4 border-status-yellow/60", f.status === "Rød" && "border-l-4 border-status-red/60")}>
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
                    <StatusPill
                      status={f.status === "Rød" ? "danger" : f.status === "Gul" ? "warning" : "ok"}
                      labelOverride={t(`audit.fleet.status.${f.status === "Rød" ? "red" : f.status === "Gul" ? "yellow" : "green"}`)}
                    />
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
                      <div className="text-muted-foreground text-xs mb-1">{t("audit.fleet.logEntries")}</div>
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
