import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, FileText, Users, Plane, Activity, ShieldAlert, ClipboardCheck, Package } from "lucide-react";
import { OverviewTab } from "./tabs/OverviewTab";
import { DocumentationTab } from "./tabs/DocumentationTab";
import { CompetencyTab } from "./tabs/CompetencyTab";
import { FleetTab } from "./tabs/FleetTab";
import { OperationsTab } from "./tabs/OperationsTab";
import { SafetyTab } from "./tabs/SafetyTab";
import { InternalAuditsTab } from "./tabs/InternalAuditsTab";
import { InspectionPackageTab } from "./tabs/InspectionPackageTab";

const tabDefs = [
  { value: "overview", key: "overview", icon: LayoutDashboard, Component: OverviewTab },
  { value: "documentation", key: "documentation", icon: FileText, Component: DocumentationTab },
  { value: "competency", key: "competency", icon: Users, Component: CompetencyTab },
  { value: "fleet", key: "fleet", icon: Plane, Component: FleetTab },
  { value: "operations", key: "operations", icon: Activity, Component: OperationsTab },
  { value: "safety", key: "safety", icon: ShieldAlert, Component: SafetyTab },
  { value: "internal", key: "internal", icon: ClipboardCheck, Component: InternalAuditsTab },
  { value: "package", key: "package", icon: Package, Component: InspectionPackageTab },
];

export const AuditSection = () => {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t("audit.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("audit.subtitle")}</p>
      </div>

      <Tabs defaultValue="overview" className="w-full">
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
        {tabDefs.map(({ value, Component }) => (
          <TabsContent key={value} value={value} className="mt-4 sm:mt-6">
            <Component />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};
