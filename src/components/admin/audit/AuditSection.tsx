import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, FileText, Users, Plane, Activity, ShieldAlert, ClipboardCheck, Package, Construction } from "lucide-react";
import { OverviewTab } from "./tabs/OverviewTab";
import { DocumentationTab } from "./tabs/DocumentationTab";
import { CompetencyTab } from "./tabs/CompetencyTab";
import { FleetTab } from "./tabs/FleetTab";
import { OperationsTab } from "./tabs/OperationsTab";
import { SafetyTab } from "./tabs/SafetyTab";
import { InternalAuditsTab } from "./tabs/InternalAuditsTab";
import { InspectionPackageTab } from "./tabs/InspectionPackageTab";

const tabDefs = [
  { value: "overview", key: "overview", icon: LayoutDashboard },
  { value: "documentation", key: "documentation", icon: FileText },
  { value: "competency", key: "competency", icon: Users },
  { value: "fleet", key: "fleet", icon: Plane },
  { value: "operations", key: "operations", icon: Activity },
  { value: "safety", key: "safety", icon: ShieldAlert },
  { value: "internal", key: "internal", icon: ClipboardCheck },
  { value: "package", key: "package", icon: Package },
] as const;

export type AuditTabValue = (typeof tabDefs)[number]["value"];

export const AuditSection = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<AuditTabValue>("overview");

  const goto = (value: AuditTabValue) => {
    setTab(value);
    // Ensure the tab strip is visible after switching.
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t("audit.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("audit.subtitle")}</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as AuditTabValue)} className="w-full">
        <TabsList className="grid grid-cols-2 sm:inline-flex h-auto w-full sm:w-auto gap-1 p-1.5 bg-secondary rounded-xl flex-wrap">
          {tabDefs.map(({ value, key, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="flex items-center justify-center gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-lg transition-colors"
            >
              <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <span>{t(`audit.tabs.${key}`)}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview" className="mt-4 sm:mt-6">
          <OverviewTab onNavigate={goto} />
        </TabsContent>
        <TabsContent value="documentation" className="mt-4 sm:mt-6"><DocumentationTab /></TabsContent>
        <TabsContent value="competency" className="mt-4 sm:mt-6"><CompetencyTab /></TabsContent>
        <TabsContent value="fleet" className="mt-4 sm:mt-6"><FleetTab /></TabsContent>
        <TabsContent value="operations" className="mt-4 sm:mt-6"><OperationsTab /></TabsContent>
        <TabsContent value="safety" className="mt-4 sm:mt-6"><SafetyTab /></TabsContent>
        <TabsContent value="internal" className="mt-4 sm:mt-6"><InternalAuditsTab /></TabsContent>
        <TabsContent value="package" className="mt-4 sm:mt-6"><InspectionPackageTab /></TabsContent>
      </Tabs>
    </div>
  );
};
