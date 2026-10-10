import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LayoutDashboard, Users, Plane, Activity, ShieldAlert, ClipboardCheck, Package, Construction, X, Building2, Lightbulb,
} from "lucide-react";
import { OverviewTab } from "./tabs/OverviewTab";
import { DocumentationTab } from "./tabs/DocumentationTab";
import { CompetencyTab } from "./tabs/CompetencyTab";
import { FleetTab } from "./tabs/FleetTab";
import { OperationsTab } from "./tabs/OperationsTab";
import { SafetyTab } from "./tabs/SafetyTab";
import { InternalAuditsTab } from "./tabs/InternalAuditsTab";
import { InspectionPackageTab } from "./tabs/InspectionPackageTab";
import { useAuditDepartments } from "./hooks/useAuditData";
import { useAuditDepartment } from "./hooks/useAuditDepartment";
import { ALL_DEPARTMENTS } from "./lib/complianceView";
import { TabFrame } from "./components/TabFrame";

const tabDefs = [
  { value: "overview", key: "overview", icon: LayoutDashboard },
  { value: "operations", key: "operations", icon: Activity },
  { value: "fleet", key: "fleet", icon: Plane },
  { value: "people", key: "people", icon: Users },
  { value: "safety", key: "incidents", icon: ShieldAlert },
  { value: "internal", key: "internal", icon: ClipboardCheck },
  { value: "package", key: "package", icon: Package },
] as const;

export type AuditTabValue = (typeof tabDefs)[number]["value"];

const BANNER_KEY = "audit.devBannerDismissed";
const INTRO_KEY = "audit.introDismissed";

const readFlag = (store: "session" | "local", key: string) => {
  try { return (store === "session" ? sessionStorage : localStorage).getItem(key) === "1"; } catch { return false; }
};
const writeFlag = (store: "session" | "local", key: string) => {
  try { (store === "session" ? sessionStorage : localStorage).setItem(key, "1"); } catch { /* storage unavailable */ }
};

export const AuditSection = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<AuditTabValue>("overview");
  const [bannerHidden, setBannerHidden] = useState(() => readFlag("session", BANNER_KEY));
  const [introHidden, setIntroHidden] = useState(() => readFlag("local", INTRO_KEY));
  const { dept, setDept } = useAuditDepartment();
  const { data: departments = [] } = useAuditDepartments();

  const goto = (value: AuditTabValue) => {
    setTab(value);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  };

  return (
    <div className="space-y-5">
      {!bannerHidden && (
        <div className="flex items-center gap-2 rounded-md border border-status-yellow/50 bg-status-yellow/10 px-3 py-1.5 text-xs">
          <Construction className="h-4 w-4 shrink-0 text-status-yellow" />
          <span className="flex-1 min-w-0 truncate">{t("audit.developmentBanner.short")}</span>
          <button
            type="button"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={t("common.close")}
            onClick={() => { writeFlag("session", BANNER_KEY); setBannerHidden(true); }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t("audit.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("audit.subtitle")}</p>
        </div>
        {departments.length > 1 && (
          <div className="flex items-center gap-2 md:min-w-[16rem]">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Select value={dept ?? ALL_DEPARTMENTS} onValueChange={(v) => setDept(v)}>
              <SelectTrigger className="w-full md:w-64" aria-label={t("audit.department.label")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_DEPARTMENTS}>{t("audit.department.all")}</SelectItem>
                {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {!introHidden && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-4 flex gap-3">
            <Lightbulb className="h-5 w-5 shrink-0 text-primary mt-0.5" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="text-sm font-semibold">{t("audit.intro.title")}</div>
              <ol className="list-decimal pl-4 space-y-1 text-sm text-muted-foreground">
                <li>{t("audit.intro.step1")}</li>
                <li>{t("audit.intro.step2")}</li>
                <li>{t("audit.intro.step3")}</li>
              </ol>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0"
              onClick={() => { writeFlag("local", INTRO_KEY); setIntroHidden(true); }}
            >
              {t("audit.intro.dismiss")}
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as AuditTabValue)} className="w-full">
        <div className="-mx-1 overflow-x-auto [touch-action:pan-x] px-1 pb-1">
          <TabsList className="inline-flex h-auto w-max gap-1 p-1.5 bg-secondary rounded-xl">
            {tabDefs.map(({ value, key, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg transition-colors"
              >
                <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                <span>{t(`audit.tabs.${key}`)}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="overview" className="mt-4 sm:mt-6"><OverviewTab onNavigate={goto} /></TabsContent>
        <TabsContent value="operations" className="mt-4 sm:mt-6"><TabFrame tabKey="operations" categories={["operations"]}><OperationsTab /></TabFrame></TabsContent>
        <TabsContent value="fleet" className="mt-4 sm:mt-6"><TabFrame tabKey="fleet" categories={["fleet"]}><FleetTab /></TabFrame></TabsContent>
        <TabsContent value="people" className="mt-4 sm:mt-6">
          <TabFrame tabKey="people" categories={["competence", "documentation"]}>
            <div className="space-y-8">
              <section className="space-y-3">
                <h3 className="text-lg font-semibold">{t("audit.tabs.competency")}</h3>
                <CompetencyTab />
              </section>
              <section className="space-y-3">
                <h3 className="text-lg font-semibold">{t("audit.tabs.documentation")}</h3>
                <DocumentationTab />
              </section>
            </div>
          </TabFrame>
        </TabsContent>
        <TabsContent value="safety" className="mt-4 sm:mt-6"><TabFrame tabKey="incidents" categories={["safety"]}><SafetyTab /></TabFrame></TabsContent>
        <TabsContent value="internal" className="mt-4 sm:mt-6"><InternalAuditsTab /></TabsContent>
        <TabsContent value="package" className="mt-4 sm:mt-6"><InspectionPackageTab /></TabsContent>
      </Tabs>
    </div>
  );
};
